import { speak } from '../speech';

interface Props {
  text: string;
  ipa?: string;
  className?: string;
}

// 仅当 text 是 ≤3 token 的英文（词/短语）时展示音标
export function isWordOrPhrase(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t) return false;
  // 含中文则不是
  if (/[一-鿿]/.test(t)) return false;
  return t.split(/\s+/).length <= 3;
}

export function Phonetics({ text, ipa, className = '' }: Props) {
  if (!ipa || !isWordOrPhrase(text)) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      title="点击发音"
      className={`text-slate-500 text-sm hover:text-blue-600 transition ${className}`}
    >
      {ipa} 🔊
    </button>
  );
}

// 单词 + 音标 + 发音按钮 一体
export function WordWithAudio({ text, ipa }: { text: string; ipa?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <button
        type="button"
        onClick={() => speak(text)}
        title="点击发音"
        className="hover:text-blue-600 transition"
      >
        {text}
      </button>
      {ipa && isWordOrPhrase(text) && (
        <span className="text-slate-500 text-sm">{ipa}</span>
      )}
    </span>
  );
}
