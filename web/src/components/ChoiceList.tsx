import { normalize } from './helpers';

export function ChoiceList({
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