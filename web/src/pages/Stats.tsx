import { useEffect, useState } from 'react';
import { api } from '../api';

export function Stats() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.stats>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.stats().then(setData).catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <div className="text-red-600">{err}</div>;
  if (!data) return <div className="text-slate-500">加载中…</div>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="bg-white rounded-lg shadow-sm p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold mb-3">概览</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="总题目" value={data.totalItems} />
          <Stat label="待复习" value={data.due} />
          <Stat label="学习天数" value={data.sessionDays} />
          <Stat label="待纠错" value={data.mistakes?.open ?? 0} />
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm p-4 sm:p-5">
        <h3 className="font-medium mb-2">按场景</h3>
        <div className="space-y-1 text-sm">
          {Object.entries(data.byScenario).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b py-1">
              <span className="truncate mr-2">{k}</span>
              <span className="text-slate-600 shrink-0">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm p-4 sm:p-5">
        <h3 className="font-medium mb-2">按题型</h3>
        <div className="space-y-1 text-sm">
          {Object.entries(data.byType).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b py-1">
              <span>{k}</span>
              <span className="text-slate-600">{v}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl sm:text-2xl font-semibold">{value}</div>
      <div className="text-slate-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}