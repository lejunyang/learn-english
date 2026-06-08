import { useState } from 'react';
import { speak } from '../speech';

export function ExampleDisplay({ examples }: { examples?: Array<{ en: string; cn?: string }> }) {
  const [show, setShow] = useState(false);
  if (!examples || examples.length === 0) return null;
  const ex = examples[0]!;
  return (
    <div className="mt-3">
      <button
        onClick={() => setShow(!show)}
        className="text-xs px-2.5 py-1.5 rounded border border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 transition"
      >
        {show ? '收起例句 ▲' : '查看例句 ▼'}
      </button>
      {show && (
        <div className="mt-2 text-left bg-slate-50 rounded border border-slate-200 px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="text-sm flex-1 break-words">{ex.en}</span>
            <button
              onClick={(e) => { e.stopPropagation(); speak(ex.en); }}
              className="text-xs text-blue-600 hover:text-blue-800 shrink-0 mt-0.5"
              title="朗读"
            >
              🔊
            </button>
          </div>
          {ex.cn && <div className="text-xs text-slate-500 mt-1">{ex.cn}</div>}
          {examples.length > 1 && (
            <div className="text-xs text-slate-400 mt-1.5">还有 {examples.length - 1} 条例句</div>
          )}
        </div>
      )}
    </div>
  );
}