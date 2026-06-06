import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Quiz } from '../components/Quiz';
import { api } from '../api';
import {
  sessionIdAtom,
  currentItemAtom,
  indexAtom,
  totalAtom,
  sessionDoneAtom,
  summaryAtom,
  resetItemStateAtom,
  pendingNextAtom,
} from '../state/atoms';

export function Learn() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const setSessionId = useSetAtom(sessionIdAtom);
  const setCurrentItem = useSetAtom(currentItemAtom);
  const setIndex = useSetAtom(indexAtom);
  const setTotal = useSetAtom(totalAtom);
  const setSessionDone = useSetAtom(sessionDoneAtom);
  const setSummary = useSetAtom(summaryAtom);
  const setPendingNext = useSetAtom(pendingNextAtom);
  const resetItem = useSetAtom(resetItemStateAtom);
  const done = useAtomValue(sessionDoneAtom);
  const summary = useAtomValue(summaryAtom);
  const item = useAtomValue(currentItemAtom);

  useEffect(() => {
    // 进入页面 → 重置所有 session 级 atom，避免上次状态残留
    setSessionId(sessionId);
    setCurrentItem(null);
    setIndex(0);
    setTotal(0);
    setSessionDone(false);
    setSummary(null);
    setPendingNext(null);
    resetItem();

    let cancelled = false;
    api
      .current(sessionId)
      .then((r) => {
        if (cancelled) return;
        if (r.done) {
          setSessionDone(true);
          return;
        }
        if (r.current) {
          setCurrentItem(r.current);
          setIndex(r.index ?? 0);
          setTotal(r.total ?? 0);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionDone(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (done) {
    return (
      <div className="bg-white rounded-lg p-6 space-y-3 text-center">
        <h2 className="text-xl font-semibold">本次学习完成 🎉</h2>
        {summary && (
          <div className="text-slate-600">
            共 {summary.total} 题，正确 {summary.correct}，正确率 {summary.accuracy}%
          </div>
        )}
        <button
          onClick={() => navigate('/')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg min-h-12 w-full sm:w-auto"
        >
          回到首页
        </button>
      </div>
    );
  }

  if (!item) return <div className="text-slate-500">加载中…</div>;

  return <Quiz />;
}
