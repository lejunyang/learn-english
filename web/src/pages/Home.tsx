import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const SCENARIOS = [
  { key: 'workplace', label: '职场' },
  { key: 'computing', label: '计算机' },
  { key: 'ai', label: 'AI' },
  { key: 'travel', label: '旅游' },
  { key: 'daily', label: '日常交流' },
  { key: 'food', label: '美食' },
];

const MINUTES = [5, 10, 15, 20, 30];

export function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'new' | 'review'>('new');
  const [scenario, setScenario] = useState<string>('daily');
  const [minutes, setMinutes] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setErr(null);
    setLoading(true);
    try {
      const res = await api.start({
        mode,
        scenario: mode === 'new' ? scenario : scenario,
        minutes,
      });
      if (res.error || !res.sessionId) {
        setErr(res.error ?? '没有可用题目');
        return;
      }
      navigate(`/learn/${res.sessionId}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-semibold">开始学习</h2>

        <div>
          <div className="text-sm text-slate-600 mb-2">模式</div>
          <div className="flex gap-2">
            {(['new', 'review'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded border ${mode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'}`}
              >
                {m === 'new' ? '新学习' : '复习'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm text-slate-600 mb-2">场景</div>
          <div className="grid grid-cols-3 gap-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                onClick={() => setScenario(s.key)}
                className={`px-3 py-2 rounded border text-sm ${scenario === s.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {mode === 'review' && (
            <p className="text-xs text-slate-500 mt-2">复习时场景为可选过滤；取不到时会跨场景取。</p>
          )}
        </div>

        <div>
          <div className="text-sm text-slate-600 mb-2">时长（分钟）</div>
          <div className="flex gap-2">
            {MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className={`px-3 py-2 rounded border text-sm ${minutes === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={start}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded font-medium disabled:opacity-50"
        >
          {loading ? '准备中…' : '开始'}
        </button>

        {err && <div className="text-red-600 text-sm">{err}</div>}
      </section>
    </div>
  );
}
