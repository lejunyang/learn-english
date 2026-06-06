import { useEffect, useMemo, useState } from 'react';
import type { Item, TranslationGrade } from '../api';
import { api } from '../api';
import { Phonetics, WordWithAudio, isWordOrPhrase } from './Phonetics';
import { speak } from '../speech';

interface Props {
  sessionId: string;
  item: Item;
  index: number;
  total: number;
  onNext: (next: Item | null) => void;
}

type Phase = 'answering' | 'feedback';

export function Quiz({ sessionId, item, index, total, onNext }: Props) {
  const [phase, setPhase] = useState<Phase>('answering');
  const [userAnswer, setUserAnswer] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [hintShown, setHintShown] = useState<{ level: 'weak' | 'strong'; text: string }[]>([]);
  const [grade, setGrade] = useState<TranslationGrade | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [coach, setCoach] = useState<string>('');

  // 切题时复位
  useEffect(() => {
    setPhase('answering');
    setUserAnswer('');
    setPicked(null);
    setHintShown([]);
    setGrade(null);
    setCoach('');
  }, [item.id]);

  // 选项（en2cn/cn2en/cloze）—— 随机插入正确答案
  const options = useMemo(() => {
    if (item.type === 'translate') return null;
    const correct =
      item.type === 'en2cn' ? item.answer?.cn ?? '' :
      item.type === 'cn2en' ? item.answer?.en ?? '' :
      item.answer?.en ?? '';
    const all = [...(item.distractors ?? []), correct];
    // 简单稳定打乱：按 itemId 哈希
    return shuffleWithSeed(all, item.id);
  }, [item]);

  async function requestHint(level: 'weak' | 'strong') {
    if (hintShown.some((h) => h.level === level)) return;
    const r = await api.hint(sessionId, level);
    setHintShown((h) => [...h, { level, text: r.hint }]);
  }

  async function submitChoice(choice: string) {
    if (phase !== 'answering' || submitting) return;
    setPicked(choice);
    setSubmitting(true);

    const correct =
      item.type === 'en2cn' ? item.answer?.cn :
      item.type === 'cn2en' ? item.answer?.en :
      item.answer?.en;

    const isRight = normalize(choice) === normalize(correct ?? '');
    // 评分：答对=2(Good)，用了提示扣到 1；答错=0
    const usedHint = hintShown.length > 0;
    const score: 0 | 1 | 2 | 3 = isRight ? (usedHint ? 1 : 2) : 0;

    try {
      const r = await api.grade(sessionId, { itemId: item.id, userAnswer: choice, score });
      setPhase('feedback');
      // 如果错了，启动 coach 流
      if (!isRight) startCoach(choice);
      // next 会在用户点"下一题"时切
      // 暂存 next
      pendingNext = r.next;
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTranslation() {
    if (phase !== 'answering' || submitting) return;
    if (!userAnswer.trim()) return;
    setSubmitting(true);
    try {
      const r = await api.gradeTranslation(sessionId, {
        itemId: item.id,
        userAnswer: userAnswer.trim(),
      });
      setGrade(r.grade ?? null);
      setPhase('feedback');
      if ((r.grade?.score ?? 0) <= 1) startCoach(userAnswer.trim());
      pendingNext = r.next;
    } finally {
      setSubmitting(false);
    }
  }

  function startCoach(userAns: string) {
    api.coach(
      sessionId,
      item.id,
      userAns,
      (delta) => setCoach((c) => c + delta),
      () => {},
      (e) => setCoach((c) => c + `\n[stream error: ${e}]`),
    );
  }

  function goNext() {
    onNext(pendingNext);
    pendingNext = null;
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-slate-500 flex justify-between">
        <span>{index + 1} / {total}</span>
        <span>{item.scenario} · {item.type} · 难度 {item.difficulty}</span>
      </div>

      <PromptDisplay item={item} />

      {/* 题型分支 */}
      {item.type === 'translate' ? (
        <TranslateInput
          value={userAnswer}
          onChange={setUserAnswer}
          disabled={phase === 'feedback'}
          onSubmit={submitTranslation}
          submitting={submitting}
        />
      ) : (
        <ChoiceList
          options={options ?? []}
          picked={picked}
          correct={correctOf(item)}
          phase={phase}
          onPick={submitChoice}
        />
      )}

      {/* 提示 */}
      {phase === 'answering' && (
        <div className="flex gap-2">
          <button
            onClick={() => requestHint('weak')}
            className="text-xs px-2 py-1 rounded border text-slate-600 hover:bg-slate-100"
          >
            提示（弱）
          </button>
          <button
            onClick={() => requestHint('strong')}
            className="text-xs px-2 py-1 rounded border text-slate-600 hover:bg-slate-100"
          >
            提示（强）
          </button>
        </div>
      )}
      {hintShown.length > 0 && (
        <div className="space-y-1">
          {hintShown.map((h) => (
            <div key={h.level} className="text-sm text-amber-700 bg-amber-50 border-l-4 border-amber-300 px-3 py-2">
              <span className="text-xs text-amber-500 mr-2">[{h.level === 'weak' ? '弱' : '强'}]</span>
              {h.text}
            </div>
          ))}
        </div>
      )}

      {/* 反馈 */}
      {phase === 'feedback' && (
        <Feedback
          item={item}
          picked={picked}
          userAnswer={userAnswer}
          grade={grade}
          coach={coach}
          onNext={goNext}
        />
      )}
    </div>
  );
}

// 暂存（避免多次 setState）
let pendingNext: Item | null = null;

function correctOf(it: Item): string {
  return (
    (it.type === 'en2cn' ? it.answer?.cn :
     it.type === 'cn2en' ? it.answer?.en :
     it.answer?.en) ?? ''
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.,!?;:'"。，！？；：]/g, '');
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
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <div className="text-3xl font-medium">
          <button onClick={() => speak(text)} className="hover:text-blue-600">{text} 🔊</button>
        </div>
        {item.phonetics?.ipa && isWordOrPhrase(text) && (
          <div className="mt-2"><Phonetics text={text} ipa={item.phonetics.ipa} /></div>
        )}
        <div className="text-sm text-slate-500 mt-3">请选择中文意思</div>
      </div>
    );
  }
  if (item.type === 'cn2en') {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <div className="text-2xl font-medium">{item.prompt.cn}</div>
        <div className="text-sm text-slate-500 mt-3">请选择对应的英文</div>
      </div>
    );
  }
  if (item.type === 'translate') {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="text-xl font-medium">{item.prompt.cn}</div>
        <div className="text-sm text-slate-500 mt-2">请输入英文翻译</div>
      </div>
    );
  }
  // cloze
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 text-center">
      <div className="text-xl font-medium">{item.prompt.cloze}</div>
      <div className="text-sm text-slate-500 mt-3">请选择填入空格的词</div>
    </div>
  );
}

function ChoiceList({
  options, picked, correct, phase, onPick,
}: {
  options: string[]; picked: string | null; correct: string;
  phase: Phase; onPick: (s: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const isCorrect = normalize(opt) === normalize(correct);
        const isPicked = picked === opt;
        let cls = 'bg-white border-slate-200 hover:bg-slate-50';
        if (phase === 'feedback') {
          if (isCorrect) cls = 'bg-green-50 border-green-400';
          else if (isPicked) cls = 'bg-red-50 border-red-400';
          else cls = 'bg-white border-slate-200 opacity-60';
        }
        return (
          <button
            key={opt}
            disabled={phase === 'feedback'}
            onClick={() => onPick(opt)}
            className={`text-left px-4 py-3 rounded border ${cls} transition`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function TranslateInput({
  value, onChange, disabled, onSubmit, submitting,
}: {
  value: string; onChange: (s: string) => void; disabled: boolean;
  onSubmit: () => void; submitting: boolean;
}) {
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder="输入英文翻译…"
        className="w-full border rounded p-3 text-lg disabled:bg-slate-50"
      />
      {!disabled && (
        <button
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? '评分中…' : '提交'}
        </button>
      )}
    </div>
  );
}

function Feedback({
  item, picked, userAnswer, grade, coach, onNext,
}: {
  item: Item; picked: string | null; userAnswer: string;
  grade: TranslationGrade | null; coach: string; onNext: () => void;
}) {
  const answerEn = item.answer?.en;
  const answerCn = item.answer?.cn;
  return (
    <div className="space-y-3 bg-slate-50 rounded-lg p-4">
      {item.type === 'translate' && grade && (
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

      {item.type !== 'translate' && (
        <div className="text-sm">
          <div>
            正确答案：
            {(item.type === 'en2cn') ? <strong>{answerCn}</strong> :
              <WordWithAudio text={answerEn ?? ''} ipa={item.phonetics?.ipa} />}
          </div>
          {picked && (
            <div className="text-slate-500 mt-1">你的选择：{picked}</div>
          )}
        </div>
      )}

      {coach && (
        <div className="text-sm text-slate-700 bg-white border-l-4 border-blue-300 px-3 py-2 whitespace-pre-wrap">
          {coach}
        </div>
      )}

      <button
        onClick={onNext}
        className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded"
      >
        下一题 →
      </button>
    </div>
  );
}
