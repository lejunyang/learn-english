// 极小的 API 客户端
export interface StartResponse {
  sessionId?: string;
  total?: number;
  current?: Item;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface Item {
  id: string;
  type: 'en2cn' | 'cn2en' | 'translate' | 'cloze';
  scenario: string;
  langTags: string[];
  difficulty: number;
  prompt: { en?: string; cn?: string; cloze?: string };
  answer?: { en?: string; cn?: string }; // translate 题前端拿不到
  distractors?: string[];
  hints: { weak: string; strong: string };
  phonetics?: { ipa?: string; ipaUS?: string; ipaUK?: string };
  related: string[];
  stats: { attempts: number; correct: number; lastScore?: number };
}

export interface GradeResponse {
  next: Item | null;
  index: number;
  total: number;
  done: boolean;
  grade?: TranslationGrade;
}

export interface TranslationGrade {
  score: 0 | 1 | 2 | 3;
  semantic: number;
  grammar: number;
  naturalness: number;
  feedback: string;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  start: (body: {
    mode: 'new' | 'review';
    scenario?: string;
    minutes: number;
    model?: string;
    effort?: 'low' | 'medium' | 'high';
  }) => postJSON<StartResponse>('/api/session/start', body),

  models: () =>
    getJSON<{ models: string[]; defaults: { generator: string; grader: string; coach: string } }>(
      '/api/config/models',
    ),

  scenarios: () =>
    getJSON<{
      groups: Array<{
        group: string;
        groupLabel: string;
        items: Array<{ id: string; label: string; hint: string }>;
      }>;
    }>('/api/config/scenarios'),

  current: (id: string) => getJSON<{ current?: Item; done?: boolean; index?: number; total?: number }>(
    `/api/session/${id}/current`,
  ),

  hint: (id: string, level: 'weak' | 'strong') =>
    getJSON<{ hint: string; level: string }>(`/api/session/${id}/hint?level=${level}`),

  grade: (id: string, body: { itemId: string; userAnswer: string; score: 0 | 1 | 2 | 3 }) =>
    postJSON<GradeResponse>(`/api/session/${id}/grade`, body),

  gradeTranslation: (id: string, body: { itemId: string; userAnswer: string }) =>
    postJSON<GradeResponse>(`/api/session/${id}/grade-translation`, body),

  finish: (id: string) =>
    postJSON<{ session: unknown; summary: { total: number; correct: number; accuracy: number } }>(
      `/api/session/${id}/finish`,
      {},
    ),

  stats: () => getJSON<{
    totalItems: number;
    due: number;
    byScenario: Record<string, number>;
    byType: Record<string, number>;
    sessionDays: number;
  }>('/api/stats/overview'),

  // Coach SSE
  coach(id: string, itemId: string, userAnswer: string, onDelta: (s: string) => void, onDone: () => void, onError: (e: string) => void) {
    const url = `/api/session/${id}/coach?itemId=${encodeURIComponent(itemId)}&userAnswer=${encodeURIComponent(userAnswer)}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { delta?: string };
        if (data.delta) onDelta(data.delta);
      } catch {/* ignore */}
    };
    es.addEventListener('done', () => { es.close(); onDone(); });
    es.addEventListener('error', (ev) => {
      es.close();
      onError((ev as MessageEvent).data ?? 'stream error');
    });
    return () => es.close();
  },
};
