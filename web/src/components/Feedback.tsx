import type { Item, TranslationGrade } from '../api';
import { WordWithAudio } from './Phonetics';
import { normalize } from './helpers';

export function Feedback({
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