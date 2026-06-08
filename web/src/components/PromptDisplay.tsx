import type { Item } from '../api';
import { Phonetics, WordWithAudio, isWordOrPhrase } from './Phonetics';
import { speak } from '../speech';
import { ExampleDisplay } from './ExampleDisplay';

export function PromptDisplay({ item }: { item: Item }) {
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
        <ExampleDisplay examples={item.examples} />
        <div className="text-sm text-slate-500 mt-3">输入中文意思</div>
      </div>
    );
  }
  if (item.type === 'cn2en') {
    const cn = item.prompt.cn ?? '';
    return (
      <div className="bg-white rounded-lg shadow-sm p-5 sm:p-6 text-center">
        <div className="text-xl sm:text-2xl font-medium break-words">{cn}</div>
        <ExampleDisplay examples={item.examples} />
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