import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const MINUTES = [5, 10, 15, 20, 30];
const EFFORTS: Array<{ id: 'low' | 'medium' | 'high'; label: string; hint: string }> = [
  { id: 'low', label: '轻松', hint: '少量题，速度优先' },
  { id: 'medium', label: '常规', hint: '默认' },
  { id: 'high', label: '深入', hint: '更多题、更细致' },
];

interface ScenarioGroup {
  group: string;
  groupLabel: string;
  items: Array<{ id: string; label: string; hint: string }>;
}

export function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'new' | 'review'>('new');
  const [scenarioGroups, setScenarioGroups] = useState<ScenarioGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>('');
  const [scenario, setScenario] = useState<string>('');
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [effort, setEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [aiRatio, setAiRatio] = useState<number>(0); // 0 = 全本地，1 = 全 AI
  const [minutes, setMinutes] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 加载场景与模型
  useEffect(() => {
    Promise.all([api.scenarios(), api.models()])
      .then(([sc, md]) => {
        setScenarioGroups(sc.groups);
        if (sc.groups[0]) {
          setActiveGroup(sc.groups[0].group);
          if (sc.groups[0].items[0]) setScenario(sc.groups[0].items[0].id);
        }
        setModels(md.models);
        setDefaultModel(md.defaults.generator);
        setModel(md.models[0] ?? md.defaults.generator);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const currentGroupItems = scenarioGroups.find((g) => g.group === activeGroup)?.items ?? [];

  async function start() {
    setErr(null);
    setLoading(true);
    try {
      const res = await api.start({
        mode,
        scenario: mode === 'new' || scenario ? scenario : undefined,
        minutes,
        model: model || undefined,
        effort,
        aiRatio,
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
    <div className="space-y-4">
      <section className="bg-white rounded-lg shadow-sm p-4 sm:p-5 space-y-4">
        <h2 className="text-lg font-semibold">开始学习</h2>

        {/* 模式 */}
        <div>
          <div className="text-sm text-slate-600 mb-2">模式</div>
          <div className="flex gap-2">
            {(['new', 'review'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-4 py-2.5 rounded border text-sm sm:text-base ${
                  mode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
                }`}
              >
                {m === 'new' ? '新学习' : '复习'}
              </button>
            ))}
          </div>
        </div>

        {/* 场景（仅新学习必填，复习可选过滤） */}
        <div>
          <div className="text-sm text-slate-600 mb-2">
            场景 {mode === 'review' && <span className="text-xs text-slate-400">（可选，复习时留空 = 跨场景）</span>}
          </div>
          {/* 一级类目 tabs */}
          <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
            {scenarioGroups.map((g) => (
              <button
                key={g.group}
                onClick={() => {
                  setActiveGroup(g.group);
                  if (g.items[0]) setScenario(g.items[0].id);
                }}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
                  activeGroup === g.group
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700'
                }`}
              >
                {g.groupLabel}
              </button>
            ))}
            {mode === 'review' && (
              <button
                onClick={() => {
                  setActiveGroup('');
                  setScenario('');
                }}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
                  !activeGroup ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
                }`}
              >
                全部
              </button>
            )}
          </div>
          {/* 二级细分 */}
          {activeGroup && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {currentGroupItems.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScenario(s.id)}
                  title={s.hint}
                  className={`px-3 py-2.5 rounded border text-sm text-left ${
                    scenario === s.id
                      ? 'bg-blue-50 text-blue-700 border-blue-400'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {scenario && (
            <div className="text-xs text-slate-500 mt-2">
              {currentGroupItems.find((s) => s.id === scenario)?.hint}
            </div>
          )}
        </div>

        {/* 模型 */}
        <div>
          <div className="text-sm text-slate-600 mb-2">模型</div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full border rounded px-3 py-2.5 bg-white text-sm sm:text-base"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
                {m === defaultModel ? ' (默认)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* effort */}
        <div>
          <div className="text-sm text-slate-600 mb-2">深入程度</div>
          <div className="grid grid-cols-3 gap-2">
            {EFFORTS.map((e) => (
              <button
                key={e.id}
                onClick={() => setEffort(e.id)}
                title={e.hint}
                className={`px-2 py-2 rounded border text-sm ${
                  effort === e.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI 占比 (仅新学习有意义) */}
        {mode === 'new' && (
          <div>
            <div className="text-sm text-slate-600 mb-2 flex justify-between">
              <span>AI 生成占比</span>
              <span className="text-xs text-slate-400">
                本地 {Math.round((1 - aiRatio) * 100)}% / AI {Math.round(aiRatio * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={Math.round(aiRatio * 100)}
              onChange={(e) => setAiRatio(parseInt(e.target.value, 10) / 100)}
              className="w-full"
            />
            <div className="text-xs text-slate-400 mt-1">
              本地不足时会自动用 AI 补足
            </div>
          </div>
        )}

        {/* 时长 */}
        <div>
          <div className="text-sm text-slate-600 mb-2">时长（分钟）</div>
          <div className="flex gap-2">
            {MINUTES.map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className={`flex-1 px-3 py-2 rounded border text-sm ${
                  minutes === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={start}
          disabled={loading || (mode === 'new' && !scenario)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded font-medium disabled:opacity-50"
        >
          {loading ? '准备中…' : '开始'}
        </button>

        {err && <div className="text-red-600 text-sm">{err}</div>}
      </section>
    </div>
  );
}
