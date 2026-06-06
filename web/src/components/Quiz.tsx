import { useMemo, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import type { Item, TranslationGrade } from '../api';
import { api } from '../api';
import {
  currentItemAtom,
  indexAtom,
  totalAtom,
  phaseAtom,
  userAnswerAtom,
  pickedAtom,
  showOptionsAtom,
  hintsShownAtom,
  gradeAtom,
  coachAtom,
  submittingAtom,
  pendingNextAtom,
  sessionIdAtom,
  resetItemStateAtom,
  sessionDoneAtom,
  summaryAtom,
} from '../state/atoms';
import { Phonetics, WordWithAudio, isWordOrPhrase } from './Phonetics';
import { speak } from '../speech';

export function Quiz() {
  const sid = useAtomValue(sessionIdAtom);
  const item = useAtomValue(currentItemAtom);
  const index = useAtomValue(indexAtom);
  const total = useAtomValue(totalAtom);
  const setCurrentItem = useSetAtom(currentItemAtom);
  const setIndex = useSetAtom(indexAtom);
  const [phase, setPhase] = useAtom(phaseAtom);
  const [userAnswer, setUserAnswer] = useAtom(userAnswerAtom);
  const [picked, setPicked] = useAtom(pickedAtom);
  const [showOptions, setShowOptions] = useAtom(showOptionsAtom);
  const [hintsShown, setHintsShown] = useAtom(hintsShownAtom);
  const [grade, setGrade] = useAtom(gradeAtom);
  const [coach, setCoach] = useAtom(coachAtom);
  const [submitting, setSubmitting] = useAtom(submittingAtom);
  const [pendingNext, setPendingNext] = useAtom(pendingNextAtom);
  const resetItem = useSetAtom(resetItemStateAtom);
  const setSessionDone = useSetAtom(sessionDoneAtom);
  const setSummary = useSetAtom(summaryAtom);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    if (!item || item.type === 'translate') return null;
    const correct =
      item.type === 'en2cn' ? item.answer?.cn ?? '' :
      item.type === 'cn2en' ? item.answer?.en ?? '' :
      item.answer?.en ?? '';
    const all = [...(item.distractors ?? []), correct];
    return shuffleWithSeed(all, item.id);
  }, [item]);

  if (!item) return null;

  const isTextInputType = item.type !== 'translate';

  async function requestHint(level: 'weak' | 'strong') {
    if (hintsShown.some((h) => h.level === level)) return;
    const r = await api.hint(sid, level);
    setHintsShown((h) => [...h, { level, text: r.hint }]);
  }

  async function gradeAnswer(answer: string) {
    if (!item || phase !== 'answering' || submitting) return;
    setPicked(answer);
    setSubmitting(true);

    const correct =
      item.type === 'en2cn' ? item.answer?.cn :
      item.type === 'cn2en' ? item.answer?.en :
      item.answer?.en;
    const isRight = normalize(answer) === normalize(correct ?? '');
    const usedHint = hintsShown.length > 0;
    const score: 0 | 1 | 2 | 3 = isRight ? (usedHint ? 1 : 2) : 0;

    try {
      const r = await api.grade(sid, { itemId: item.id, userAnswer: answer, score });
      setPhase('feedback');
      if (!isRight) startCoach(item.id, answer);
      setPendingNext(r.next);
    } finally {
      setSubmitting(false);
    }
  }

  function submitInput() {
    if (!userAnswer.trim()) return;
    void gradeAnswer(userAnswer.trim());
  }

  function submitChoice(choice: string) {
    void gradeAnswer(choice);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitInput();
    }
  }

  async function submitTranslation() {
    if (!item || phase !== 'answering' || submitting) return;
    if (!userAnswer.trim()) return;
    setSubmitting(true);
    try {
      const r = await api.gradeTranslation(sid, {
        itemId: item.id,
        userAnswer: userAnswer.trim(),
      });
      setGrade(r.grade ?? null);
      setPhase('feedback');
      if ((r.grade?.score ?? 0) <= 1) startCoach(item.id, userAnswer.trim());
      setPendingNext(r.next);
    } finally {
      setSubmitting(false);
    }
  }

  function startCoach(itemId: string, userAns: string) {
    api.coach(
      sid,
      itemId,
      userAns,
      (delta) => setCoach((c) => c + delta),
      () => {},
      (e) => setCoach((c) => c + `\n[stream error: ${e}]`),
    );
  }

  async function goNext() {
    if (pendingNext) {
      setCurrentItem(pendingNext);
      setIndex(index + 1);
      setPendingNext(null);
      resetItem();
    } else {
      try {
        const r = await api.finish(sid);
        setSummary(r.summary);
      } finally {
        setSessionDone(true);
      }
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="text-xs text-slate-500 flex justify-between">
        <span>{index + 1} / {total}</span>
        <span>{item.scenario} · {item.type} · 难度 {item.difficulty}</span>
      </div>

      <PromptDisplay item={item} />

      {phase === 'answering' && (
        <div className="space-y-3">
          {isTextInputType && (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                placeholder="输入答案…"
                className="flex-1 border rounded-lg px-4 py-3 text-base sm:text-lg disabled:bg-slate-50 min-h-12"
                autoFocus
              />
              <button
                onClick={submitInput}
                disabled={submitting || !userAnswer.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-medium disabled:opacity-50 shrink-0 min-h-12"
              >
                提交
              </button>
            </div>
          )}

          {isTextInputType && !showOptions && (
            <button
              onClick={() => setShowOptions(true)}
              className="w-full text-sm border border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 py-3 rounded-lg transition min-h-10"
            >
              + 展示选项
            </button>
          )}

          {isTextInputType && showOptions && options && (
            <ChoiceList
              options={options}
              picked={picked}
              correct={correctOf(item)}
              phase={phase}
              onPick={submitChoice}
            />
          )}

          {item.type === 'translate' && (
            <div className="space-y-2">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                disabled={submitting}
                rows={4}
                placeholder="输入英文翻译…"
                className="w-full border rounded-lg p-3 text-base disabled:bg-slate-50 min-h-[5rem]"
              />
              <button
                onClick={submitTranslation}
                disabled={submitting || !userAnswer.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-medium disabled:opacity-50 min-h-12"
              >
                {submitting ? '评分中…' : '提交'}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => requestHint('weak')}
              className="text-xs px-3 py-2 rounded border text-slate-600 hover:bg-slate-100 min-h-9"
            >
              提示（弱）
            </button>
            <button
              onClick={() => requestHint('strong')}
              className="text-xs px-3 py-2 rounded border text-slate-600 hover:bg-slate-100 min-h-9"
            >
              提示（强）
            </button>
          </div>

          {hintsShown.length > 0 && (
            <div className="space-y-1">
              {hintsShown.map((h) => (
                <div key={h.level} className="text-sm text-amber-700 bg-amber-50 border-l-4 border-amber-300 px-3 py-2.5">
                  <span className="text-xs text-amber-500 mr-2">[{h.level === 'weak' ? '弱' : '强'}]</span>
                  {h.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'feedback' && (
        <Feedback
          item={item}
          picked={picked}
          userAnswer={userAnswer}
          grade={grade}
          coach={coach}
          onNext={goNext}
          nextLabel={pendingNext ? '下一题 →' : '完成学习'}
        />
      )}
    </div>
  );
}

function correctOf(it: Item): string {
  return (
    (it.type === 'en2cn' ? it.answer?.cn :
     it.type === 'cn2en' ? it.answer?.en :
     it.answer?.en) ?? ''
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.,!?;:'"。，！？；：·’‘"「」『』（）\[\]【】—…\-]/g, '').replace(/\s+/g, ' ');
}

function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 9301 + 49297) & 0xffffffff;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function PromptDisplay({ item }: { item: Item }) {
  if (item.type === 'en2cn') {
    const text = item.prompt.en ?? '';
    return (
      <div className="bg-white rounded-lg shadow-sm p-5 sm:p-6 text-center">
        <div className="text-2xl sm:text-3xl font-medium break-words">
          <button onClick={() => speak(text)} className="hover:text-blue-600">{text} 🔊</button>
        </div>
        {item.phonetics?.ipa && isWordOrPhrase(text) && (
          <div className="mt-2"><Phonetics text={text} ipa={item.phonetics.ipa} /></div>
        )}
        <div className="text-sm text-slate-500 mt-3">输入中文意思</div>
      </div>
    );
  }
  if (item.type === 'cn2en') {
    return (
      <div className="bg-white rounded-lg shadow-sm p-5 sm:p-6 text-center">
        <div className="text-xl sm:text-2xl font-medium break-words">{item.prompt.cn}</div>
        <div className="text-sm text-slate-500 mt-3">输入对应的英文</div>
      </div>
    );
  }
  if (item.type === 'translate') {
    return (
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="text-lg sm:text-xl font-medium break-words">{item.prompt.cn}</div>
        <div className="text-sm text-slate-500 mt-2">请输入英文翻译</div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg shadow-sm p-5 sm:p-6 text-center">
      <div className="text-lg sm:text-xl font-medium break-words">{item.prompt.cloze}</div>
      <div className="text-sm text-slate-500 mt-3">输入填空词</div>
    </div>
  );
}

function ChoiceList({
  options, picked, correct, phase, onPick,
}: {
  options: string[]; picked: string | null; correct: string;
  phase: 'answering' | 'feedback'; onPick: (s: string) => void;
}) {
  if (phase === 'feedback') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => {
          const isCorrect = normalize(opt) === normalize(correct);
          const isPicked = picked === opt;
          let cls = 'bg-white border-slate-200';
          if (isCorrect) cls = 'bg-green-50 border-green-400';
          else if (isPicked) cls = 'bg-red-50 border-red-400';
          else cls = 'bg-white border-slate-200 opacity-60';
          return (
            <div key={opt} className={`text-left px-4 py-3 rounded border ${cls} transition`}>
              {opt}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-slate-400 mb-1.5">点击选项快速作答：</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onPick(opt)}
            className="text-left px-4 py-3.5 rounded border bg-white border-slate-200 hover:bg-slate-50 transition min-h-11"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Feedback({
  item, picked, userAnswer, grade, coach, onNext, nextLabel,
}: {
  item: Item; picked: string | null; userAnswer: string;
  grade: TranslationGrade | null; coach: string;
  onNext: () => void; nextLabel: string;
}) {
  const answerEn = item.answer?.en;
  const answerCn = item.answer?.cn;
  const isTranslate = item.type === 'translate';
  const correct =
    item.type === 'en2cn' ? answerCn :
    item.type === 'cn2en' ? answerEn :
    item.answer?.en;
  const isRight = picked ? normalize(picked) === normalize(correct ?? '') : false;

  return (
    <div className="space-y-3 bg-slate-50 rounded-lg p-4">
      {isTranslate && grade && (
        <div>
          <div className="font-medium">评分：{grade.score} / 3</div>
          <div className="text-xs text-slate-500">
            语义 {grade.semantic} · 语法 {grade.grammar} · 地道 {grade.naturalness}
          </div>
          <div className="mt-2 text-sm">{grade.feedback}</div>
          {answerEn && (
            <div className="text-sm mt-2">
              参考译文：<WordWithAudio text={answerEn} />
            </div>
          )}
          <div className="text-xs text-slate-500 mt-1">你的翻译：{userAnswer}</div>
        </div>
      )}

      {!isTranslate && (
        <div className="text-sm">
          <div className={isRight ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
            {isRight ? '✓ 正确' : '✗ 错误'}
          </div>
          <div className="mt-1">
            正确答案：
            {item.type === 'en2cn' ? <strong>{answerCn}</strong> :
              <WordWithAudio text={answerEn ?? ''} ipa={item.phonetics?.ipa} />}
          </div>
          {picked && (
            <div className="text-slate-500 mt-1">你的回答：{picked}</div>
          )}
        </div>
      )}

      {coach && (
        <div className="text-sm text-slate-700 bg-white border-l-4 border-blue-300 px-3 py-2.5 whitespace-pre-wrap">
          {coach}
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-lg font-medium min-h-12"
      >
        {nextLabel}
      </button>
    </div>
  );
}
