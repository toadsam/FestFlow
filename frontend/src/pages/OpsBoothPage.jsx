import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchOpsBoothBootstrap, updateOpsBoothLiveStatus } from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { resolveBoothImageUrl } from '../config/boothImages';

const BOOTH_KEY_STORAGE_KEY = 'festflow_ops_booth_key';

function confirmAction(message) {
  return window.confirm(`정말 실행할까요?\n\n${message}`);
}

export default function OpsBoothPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialKey = searchParams.get('key') || sessionStorage.getItem(BOOTH_KEY_STORAGE_KEY) || '';
  const [keyInput, setKeyInput] = useState(initialKey);
  const [key, setKey] = useState(initialKey);
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
      setData(null);
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
      setData(null);
      setError(e.message === 'Failed to fetch' ? '서버 연결에 실패했습니다. 백엔드 실행 상태를 확인해 주세요.' : e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id, key]);

  async function handleSave() {
    if (!confirmAction('부스 실시간 정보를 저장합니다.')) return;
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
      setError(e.message === 'Failed to fetch' ? '저장 요청에 실패했습니다. 운영 키 또는 서버 상태를 확인해 주세요.' : e.message);
    }
  }

  function submitKey(e) {
    e.preventDefault();
    const next = keyInput.trim();
    sessionStorage.setItem(BOOTH_KEY_STORAGE_KEY, next);
    setKey(next);
    setLoading(true);
    setError('');
    setMessage('');
  }

  function clearKey() {
    sessionStorage.removeItem(BOOTH_KEY_STORAGE_KEY);
    setKeyInput('');
    setKey('');
    setData(null);
    setError('');
    setMessage('');
    setLoading(false);
  }

  return (
    <section className="pt-4 space-y-3">
      <h2 className="text-lg font-bold">부스 운영자 화면</h2>
      <form onSubmit={submitKey} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-sm font-semibold">운영 키 입력</p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            className="border rounded px-2 py-2 text-sm"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="부스 운영 키"
          />
          <button type="submit" className="rounded border px-3 py-2 text-sm font-semibold">적용</button>
          <button type="button" onClick={clearKey} className="rounded border px-3 py-2 text-sm">초기화</button>
        </div>
      </form>
      {!key && <p className="text-sm text-rose-600">운영 키를 입력해 주세요.</p>}
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
