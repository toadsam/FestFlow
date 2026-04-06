import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchOpsMasterBootstrap, updateOpsMasterBoothLiveStatus } from '../api';

export default function OpsMasterPage() {
  const [searchParams] = useSearchParams();
  const key = searchParams.get('key') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});

  async function load() {
    if (!key) {
      setLoading(false);
      return;
    }
    try {
      const next = await fetchOpsMasterBootstrap(key);
      setData(next);
      const nextDrafts = {};
      next.booths.forEach((booth) => {
        nextDrafts[booth.id] = {
          estimatedWaitMinutes: booth.estimatedWaitMinutes ?? '',
          remainingStock: booth.remainingStock ?? '',
          liveStatusMessage: booth.liveStatusMessage ?? '',
        };
      });
      setDrafts(nextDrafts);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [key]);

  const booths = useMemo(
    () => (data?.booths || []).slice().sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)),
    [data]
  );

  async function handleSave(boothId) {
    try {
      const draft = drafts[boothId] || {};
      await updateOpsMasterBoothLiveStatus(
        boothId,
        {
          estimatedWaitMinutes: draft.estimatedWaitMinutes === '' ? null : Number(draft.estimatedWaitMinutes),
          remainingStock: draft.remainingStock === '' ? null : Number(draft.remainingStock),
          liveStatusMessage: draft.liveStatusMessage || null,
        },
        key
      );
      setMessage('저장되었습니다.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!key) {
    return <section className="pt-4"><p className="text-sm text-rose-600">운영 키가 없습니다. URL에 `?key=...`를 포함해 주세요.</p></section>;
  }

  return (
    <section className="pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">통합 운영자 화면</h2>
        <button type="button" onClick={load} className="rounded-lg border px-3 py-2 text-sm">새로고침</button>
      </div>
      {loading && <p className="text-sm text-slate-600">불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {message && <p className="text-sm text-teal-700">{message}</p>}

      {data && (
        <>
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="font-semibold">요약 KPI</h3>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-teal-50 p-2">
                <p className="text-[10px] text-teal-700">오늘 총 방문</p>
                <p className="font-bold text-teal-800">{data.kpi?.todayVisitorCount ?? 0}</p>
              </div>
              <div className="rounded bg-amber-50 p-2">
                <p className="text-[10px] text-amber-700">최대 혼잡</p>
                <p className="text-xs font-bold text-amber-800 line-clamp-1">{data.kpi?.mostCongestedBooth?.boothName || '-'}</p>
              </div>
              <div className="rounded bg-indigo-50 p-2">
                <p className="text-[10px] text-indigo-700">30분 내 공연</p>
                <p className="text-xs font-bold text-indigo-800 line-clamp-1">{data.kpi?.upcomingWithin30Minutes?.title || '-'}</p>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <h3 className="font-semibold">부스 실시간 관리</h3>
            {booths.map((booth) => (
              <div key={booth.id} className="rounded-lg border border-slate-200 p-2">
                <p className="text-sm font-semibold">{booth.name}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input
                    className="border rounded px-2 py-2 text-sm"
                    placeholder="대기(분)"
                    value={drafts[booth.id]?.estimatedWaitMinutes ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [booth.id]: { ...prev[booth.id], estimatedWaitMinutes: e.target.value } }))}
                  />
                  <input
                    className="border rounded px-2 py-2 text-sm"
                    placeholder="잔여수량"
                    value={drafts[booth.id]?.remainingStock ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [booth.id]: { ...prev[booth.id], remainingStock: e.target.value } }))}
                  />
                  <button type="button" onClick={() => handleSave(booth.id)} className="rounded border px-2 py-2 text-sm font-semibold">
                    저장
                  </button>
                </div>
                <input
                  className="mt-2 w-full border rounded px-2 py-2 text-sm"
                  placeholder="운영 메모"
                  value={drafts[booth.id]?.liveStatusMessage ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [booth.id]: { ...prev[booth.id], liveStatusMessage: e.target.value } }))}
                />
              </div>
            ))}
          </article>
        </>
      )}
    </section>
  );
}

