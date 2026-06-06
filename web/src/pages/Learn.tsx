import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Quiz } from '../components/Quiz';
import { api, type Item } from '../api';

export function Learn() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<{ total: number; correct: number; accuracy: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.current(sessionId).then((r) => {
      if (r.done) {
        setDone(true);
        return;
      }
      if (r.current) {
        setItem(r.current);
        setIndex(r.index ?? 0);
        setTotal(r.total ?? 0);
      }
    }).catch((e) => setErr((e as Error).message));
  }, [sessionId]);

  async function handleNext(next: Item | null) {
    if (!next) {
      // 会话结束
      try {
        const r = await api.finish(sessionId);
        setSummary(r.summary);
        setDone(true);
      } catch (e) {
        setErr((e as Error).message);
      }
      return;
    }
    setItem(next);
    setIndex((i) => i + 1);
  }

  if (err) return <div className="text-red-600">{err}</div>;
  if (done) {
    return (
      <div className="bg-white rounded-lg p-6 space-y-3 text-center">
        <h2 className="text-xl font-semibold">本次学习完成 🎉</h2>
        {summary && (
          <div className="text-slate-600">
            共 {summary.total} 题，正确 {summary.correct}，正确率 {summary.accuracy}%
          </div>
        )}
        <button onClick={() => navigate('/')} className="bg-blue-600 text-white px-4 py-2 rounded">
          回到首页
        </button>
      </div>
    );
  }
  if (!item) return <div className="text-slate-500">加载中…</div>;

  return (
    <Quiz
      sessionId={sessionId}
      item={item}
      index={index}
      total={total}
      onNext={handleNext}
    />
  );
}
