import { useMemo, useRef, useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
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
import { PromptDisplay } from './PromptDisplay';
import { ChoiceList } from './ChoiceList';
import { Feedback } from './Feedback';
import { normalize, shuffleWithSeed } from './helpers';

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

  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当 item 切换时刷新 noteText
  const prevItemId = useRef<string>('');
  if (item && item.id !== prevItemId.current) {
    prevItemId.current = item.id;
    setNoteText(item.userNote ?? '');
    setNoteSaved(false);
  }

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

  async function saveNote() {
    if (!item || noteSaving) return;
    setNoteSaving(true);
    try {
      await api.saveNote(item.id, noteText);
      setNoteSaved(true);
    } catch { /* ignore */ }
    setNoteSaving(false);
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
        <>
          <Feedback
            item={item}
            picked={picked}
            userAnswer={userAnswer}
            grade={grade}
            coach={coach}
            onNext={goNext}
            nextLabel={pendingNext ? '下一题 →' : '完成学习'}
          />

          {/* 用户备注 */}
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
            <div className="text-xs text-slate-500">备注（可选，不会被 AI 修改，仅你可见）</div>
            <textarea
              value={noteText}
              onChange={(e) => { setNoteText(e.target.value); setNoteSaved(false); }}
              rows={2}
              placeholder="记录这句的学习心得、易错点…"
              className="w-full border rounded px-3 py-2 text-sm resize-none min-h-[2.5rem]"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveNote}
                disabled={noteSaving}
                className="text-xs px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 disabled:opacity-50"
              >
                {noteSaving ? '保存中…' : '保存备注'}
              </button>
              {noteSaved && <span className="text-xs text-green-600">已保存</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function correctOf(item: import('../api').Item): string {
  const ans = item.answer;
  return item.type === 'en2cn' ? ans?.cn ?? '' :
         item.type === 'cn2en' ? ans?.en ?? '' :
         ans?.en ?? '';
}