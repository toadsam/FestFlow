import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  checkInOpsBoothReservation,
  fetchOpsBoothBootstrap,
  updateOpsBoothLiveStatus,
  updateOpsBoothReservationConfig,
} from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { resolveBoothImageUrl } from '../config/boothImages';

const BOOTH_KEY_STORAGE_KEY = 'festflow_ops_booth_key';

function confirmAction(message) {
  return window.confirm(`실행할까요?\n\n${message}`);
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

  const [reservationDraft, setReservationDraft] = useState({
    maxReservationMinutes: 10,
    tables: [],
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
      setReservationDraft({
        maxReservationMinutes: next.reservations?.maxReservationMinutes ?? 10,
        tables: (next.reservations?.tables ?? []).map((table) => ({
          id: table.id,
          tableName: table.tableName,
          totalSeats: table.totalSeats,
          availableSeats: table.availableSeats,
        })),
      });
      setError('');
    } catch (e) {
      setData(null);
      setError(e.message === 'Failed to fetch' ? '서버 연결에 실패했습니다. 백엔드 상태를 확인해주세요.' : e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id, key]);

  async function handleSaveLiveStatus() {
    if (!confirmAction('실시간 운영 정보를 저장합니다.')) return;
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
      setMessage('실시간 정보가 저장되었습니다.');
      await load();
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? '저장 요청에 실패했습니다.' : e.message);
    }
  }

  async function handleSaveReservationConfig() {
    if (!confirmAction('예약 설정을 저장합니다.')) return;
    try {
      await updateOpsBoothReservationConfig(
        id,
        {
          maxReservationMinutes: Math.max(1, Number(reservationDraft.maxReservationMinutes) || 10),
          tables: reservationDraft.tables.map((table) => ({
            id: table.id ?? null,
            tableName: table.tableName,
            totalSeats: Math.max(1, Number(table.totalSeats) || 1),
            availableSeats: Math.max(0, Number(table.availableSeats) || 0),
          })),
        },
        key
      );
      setMessage('예약 설정이 저장되었습니다.');
      await load();
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? '예약 설정 저장 요청에 실패했습니다.' : e.message);
    }
  }

  async function handleCheckIn(reservationId) {
    if (!confirmAction(`예약 #${reservationId} 체크인 처리할까요?`)) return;
    try {
      await checkInOpsBoothReservation(id, reservationId, key);
      setMessage(`예약 #${reservationId} 체크인 완료`);
      await load();
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? '체크인 요청에 실패했습니다.' : e.message);
    }
  }

  function updateTableDraft(index, patch) {
    setReservationDraft((prev) => {
      const tables = [...prev.tables];
      tables[index] = { ...tables[index], ...patch };
      return { ...prev, tables };
    });
  }

  function addTableDraft() {
    setReservationDraft((prev) => ({
      ...prev,
      tables: [
        ...prev.tables,
        {
          id: null,
          tableName: `Table ${prev.tables.length + 1}`,
          totalSeats: 4,
          availableSeats: 4,
        },
      ],
    }));
  }

  function removeTableDraft(index) {
    setReservationDraft((prev) => ({
      ...prev,
      tables: prev.tables.filter((_, idx) => idx !== index),
    }));
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

  const activeReservations = useMemo(() => {
    if (!data?.reservations?.activeReservations) return [];
    return data.reservations.activeReservations;
  }, [data]);

  return (
    <section className="cyber-page pt-4 space-y-3">
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

      {!key && <p className="text-sm text-rose-600">운영 키를 입력해주세요.</p>}
      {loading && <p className="text-sm text-slate-600">불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {message && <p className="text-sm text-teal-700">{message}</p>}

      {data && (
        <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="aspect-[16/9] bg-slate-100">
            <img src={resolveBoothImageUrl(data.booth)} alt={`${data.booth.name} 이미지`} className="h-full w-full object-cover" />
          </div>

          <div className="p-3 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold">{data.booth.name}</h3>
              <CongestionBadge level={data.congestion.level} />
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold">실시간 운영 정보</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="border rounded px-2 py-2 text-sm"
                  placeholder="대기(분)"
                  value={draft.estimatedWaitMinutes}
                  onChange={(e) => setDraft((prev) => ({ ...prev, estimatedWaitMinutes: e.target.value }))}
                />
                <input
                  className="border rounded px-2 py-2 text-sm"
                  placeholder="잔여 수량"
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
              <button
                type="button"
                onClick={handleSaveLiveStatus}
                className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold"
              >
                실시간 정보 저장
              </button>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-900">예약 설정</p>
                <button type="button" onClick={addTableDraft} className="rounded border border-emerald-400 px-2 py-1 text-xs">테이블 추가</button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-xs text-emerald-900">최대 예약시간(분)</span>
                <input
                  className="border rounded px-2 py-1.5 text-sm w-24"
                  type="number"
                  min="1"
                  value={reservationDraft.maxReservationMinutes}
                  onChange={(e) => setReservationDraft((prev) => ({ ...prev, maxReservationMinutes: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                {reservationDraft.tables.map((table, index) => (
                  <div key={`${table.id ?? 'new'}-${index}`} className="rounded border border-emerald-200 bg-white p-2 space-y-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <input
                        className="border rounded px-2 py-1.5 text-sm"
                        value={table.tableName}
                        onChange={(e) => updateTableDraft(index, { tableName: e.target.value })}
                        placeholder="테이블명"
                      />
                      <button type="button" onClick={() => removeTableDraft(index)} className="rounded border px-2 text-xs">삭제</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="border rounded px-2 py-1.5 text-sm"
                        type="number"
                        min="1"
                        value={table.totalSeats}
                        onChange={(e) => updateTableDraft(index, { totalSeats: e.target.value })}
                        placeholder="총 좌석"
                      />
                      <input
                        className="border rounded px-2 py-1.5 text-sm"
                        type="number"
                        min="0"
                        value={table.availableSeats}
                        onChange={(e) => updateTableDraft(index, { availableSeats: e.target.value })}
                        placeholder="남은 좌석"
                      />
                    </div>
                  </div>
                ))}
                {!reservationDraft.tables.length && <p className="text-xs text-slate-600">설정된 테이블이 없습니다.</p>}
              </div>

              <button
                type="button"
                onClick={handleSaveReservationConfig}
                className="w-full rounded bg-emerald-700 text-white py-2 text-sm font-semibold"
              >
                예약 설정 저장
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">예약 큐</p>
              {activeReservations.length ? activeReservations.map((reservation) => (
                <div key={reservation.id} className="rounded border border-amber-300 bg-white p-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-700">
                    <p className="font-semibold">#{reservation.id} · {reservation.tableName}</p>
                    <p>User: {reservation.userKey}</p>
                    <p>Seats: {reservation.seatCount}</p>
                    <p>Expires: {reservation.expiresAt?.replace('T', ' ').slice(5, 16)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckIn(reservation.id)}
                    className="rounded bg-amber-600 text-white px-3 py-2 text-xs font-semibold"
                  >
                    체크인
                  </button>
                </div>
              )) : (
                <p className="text-xs text-slate-600">현재 활성 예약이 없습니다.</p>
              )}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}

