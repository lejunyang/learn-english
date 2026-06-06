// Web Speech API 封装 —— TTS（朗读）+ STT 先不做
let voices: SpeechSynthesisVoice[] = [];

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) {
      voices = v;
      resolve(v);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      voices = speechSynthesis.getVoices();
      resolve(voices);
    };
  });
}

void loadVoices();

function pickEnglishVoice(): SpeechSynthesisVoice | undefined {
  if (!voices.length) voices = speechSynthesis.getVoices();
  // 优先美式女声 → 任意英文
  return (
    voices.find((v) => /en-US/i.test(v.lang) && /aria|jenny|google us english|samantha/i.test(v.name)) ??
    voices.find((v) => /en-US/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang))
  );
}

export function speak(text: string, opts: { rate?: number; pitch?: number } = {}): void {
  if (!('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis not supported');
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickEnglishVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? 'en-US';
  u.rate = opts.rate ?? 1;
  u.pitch = opts.pitch ?? 1;
  speechSynthesis.speak(u);
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
