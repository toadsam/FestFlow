import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchOpsBoothBootstrap, updateOpsBoothLiveStatus } from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { resolveBoothImageUrl } from '../config/boothImages';

export default function OpsBoothPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const key = searchParams.get('key') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({
    estimatedWaitMinutes: '',
    remainingStock: '',
    liveStatusMessage: '',
  });

  async function load() {
    if (!id || !key) {
      setLoading(false);
      return;
    }

    try {
      const next = await fetchOpsBoothBootstrap(id, key);
      setData(next);
      setDraft({
        estimatedWaitMinutes: next.booth.estimatedWaitMinutes ?? '',
        remainingStock: next.booth.remainingStock ?? '',
        liveStatusMessage: next.booth.liveStatusMessage ?? '',
      });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id, key]);

  async function handleSave() {
    try {
      await updateOpsBoothLiveStatus(
        id,
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
      <h2 className="text-lg font-bold">부스 운영자 화면</h2>
      {loading && <p className="text-sm text-slate-600">불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {message && <p className="text-sm text-teal-700">{message}</p>}

      {data && (
        <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="aspect-[16/9] bg-slate-100">
            <img src={resolveBoothImageUrl(data.booth)} alt={`${data.booth.name} 이미지`} className="h-full w-full object-cover" />
          </div>
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold">{data.booth.name}</h3>
              <CongestionBadge level={data.congestion.level} />
            </div>
            <p className="text-xs text-slate-700">현재 주변 사용자: {data.congestion.nearbyUserCount}명</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="border rounded px-2 py-2 text-sm"
                placeholder="대기(분)"
                value={draft.estimatedWaitMinutes}
                onChange={(e) => setDraft((prev) => ({ ...prev, estimatedWaitMinutes: e.target.value }))}
              />
              <input
                className="border rounded px-2 py-2 text-sm"
                placeholder="잔여수량"
                value={draft.remainingStock}
                onChange={(e) => setDraft((prev) => ({ ...prev, remainingStock: e.target.value }))}
              />
            </div>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="운영 메모"
              value={draft.liveStatusMessage}
              onChange={(e) => setDraft((prev) => ({ ...prev, liveStatusMessage: e.target.value }))}
            />
            <button type="button" onClick={handleSave} className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold">
              실시간 정보 저장
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

