import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createBoothReservation,
  createBoothStream,
  fetchBoothById,
  fetchBoothReservations,
  fetchCongestion,
} from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { resolveBoothImageUrl } from '../config/boothImages';
import { getReservationUserKey } from '../utils/reservation';

function normalizeLevel(level) {
  const mapping = {
    여유: '여유',
    보통: '보통',
    혼잡: '혼잡',
    매우혼잡: '매우혼잡',
  };
  return mapping[level] || level;
}

export default function BoothDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booth, setBooth] = useState(null);
  const [congestion, setCongestion] = useState(null);
  const [reservationState, setReservationState] = useState(null);

  const [error, setError] = useState('');
  const [reservationError, setReservationError] = useState('');
  const [reservationMessage, setReservationMessage] = useState('');

  const [opsKeyInput, setOpsKeyInput] = useState('');
  const [seatCount, setSeatCount] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  async function loadPage() {
    try {
      const [boothData, congestionData, reservationData] = await Promise.all([
        fetchBoothById(id),
        fetchCongestion(id),
        fetchBoothReservations(id, getReservationUserKey()),
      ]);
      setBooth(boothData);
      setCongestion({ ...congestionData, level: normalizeLevel(congestionData.level) });
      setReservationState(reservationData);
      if (!selectedTableId && reservationData.tables.length > 0) {
        setSelectedTableId(reservationData.tables[0].id);
      }
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadPage();
  }, [id]);

  useEffect(() => {
    const stream = createBoothStream();
    stream.addEventListener('booths', (event) => {
      try {
        const list = JSON.parse(event.data);
        const next = list.find((item) => String(item.id) === String(id));
        if (next) {
          setBooth(next);
        }
      } catch {
        // ignore
      }
    });
    return () => stream.close();
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshCongestion() {
    try {
      const updated = await fetchCongestion(id);
      setCongestion({ ...updated, level: normalizeLevel(updated.level) });
    } catch (e) {
      setError(e.message);
    }
  }

  async function refreshReservations() {
    const updated = await fetchBoothReservations(id, getReservationUserKey());
    setReservationState(updated);
    if (!selectedTableId && updated.tables.length > 0) {
      setSelectedTableId(updated.tables[0].id);
    }
  }

  async function handleReserve() {
    if (!selectedTableId) {
      setReservationError('테이블을 선택해주세요.');
      return;
    }

    try {
      setReservationError('');
      setReservationMessage('');
      await createBoothReservation(id, {
        userKey: getReservationUserKey(),
        tableId: selectedTableId,
        seatCount: Math.max(1, Number(seatCount) || 1),
      });
      setReservationMessage('예약되었습니다. 제한 시간 내 도착 후 관리자 체크인을 받으세요.');
      await refreshReservations();
    } catch (e) {
      setReservationError(e.message);
    }
  }

  function handleOpsLogin() {
    const key = opsKeyInput.trim();
    if (!key) {
      setReservationError('운영 키를 입력해주세요.');
      return;
    }
    navigate(`/ops/booth/${id}?key=${encodeURIComponent(key)}`);
  }

  const myReservation = reservationState?.myReservation ?? null;
  const penalty = reservationState?.penalty ?? null;
  const canReserve = Boolean(reservationState && !myReservation && !(penalty?.blocked));
  const remainingSeconds = myReservation
    ? Math.max(0, Math.floor((new Date(myReservation.expiresAt).getTime() - nowTick) / 1000))
    : 0;

  const timerText = useMemo(() => {
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [remainingSeconds]);

  if (error) {
    return <p className="pt-4 text-sm text-rose-600">{error}</p>;
  }

  if (!booth || !congestion || !reservationState) {
    return <p className="pt-4 text-sm text-slate-500">불러오는 중...</p>;
  }

  return (
    <section className="cyber-page pt-4 space-y-4">
      <button type="button" onClick={() => navigate('/')} className="text-sm text-teal-700 font-semibold">
        홈으로 돌아가기
      </button>

      <article className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="aspect-[16/10] bg-slate-100">
          <img src={resolveBoothImageUrl(booth)} alt={`${booth.name} 대표 이미지`} className="h-full w-full object-cover" />
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-800">{booth.name}</h2>
            <CongestionBadge level={congestion.level} />
          </div>

          <p className="text-sm text-slate-600">{booth.description}</p>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-sm font-semibold text-indigo-800">실시간 운영 정보</p>
            <p className="text-sm text-indigo-700 mt-1">대기: {booth.estimatedWaitMinutes ?? '-'}분</p>
            <p className="text-sm text-indigo-700">잔여 수량: {booth.remainingStock ?? '-'}</p>
            <p className="text-sm text-indigo-700">운영 메모: {booth.liveStatusMessage || '없음'}</p>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-emerald-900">예약</p>
            <p className="text-xs text-emerald-800">최대 도착 제한시간: {reservationState.maxReservationMinutes}분</p>

            {penalty?.blocked && (
              <p className="text-xs text-rose-700">
                예약 제한 중: {penalty.blockedUntil?.replace('T', ' ').slice(5, 16)}까지
              </p>
            )}
            {!penalty?.blocked && <p className="text-xs text-emerald-800">노쇼 횟수: {penalty?.noShowCount ?? 0} / 2</p>}

            {myReservation ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-semibold">내 활성 예약</p>
                <p>테이블: {myReservation.tableName}</p>
                <p>좌석: {myReservation.seatCount}</p>
                <p className="font-bold mt-1">남은 시간: {timerText}</p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {reservationState.tables.length ? reservationState.tables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setSelectedTableId(table.id)}
                      className={`w-full rounded-md border px-2 py-2 text-left text-xs ${
                        selectedTableId === table.id ? 'border-emerald-600 bg-white' : 'border-emerald-200 bg-emerald-100/50'
                      }`}
                    >
                      <p className="font-semibold">{table.tableName}</p>
                      <p>총 {table.totalSeats}석 / 남은 {table.availableSeats}석</p>
                    </button>
                  )) : (
                    <p className="text-xs text-slate-600">관리자가 아직 테이블을 설정하지 않았습니다.</p>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    className="border rounded px-2 py-2 text-sm"
                    type="number"
                    min="1"
                    value={seatCount}
                    onChange={(e) => setSeatCount(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleReserve}
                    disabled={!canReserve || !reservationState.tables.length}
                    className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    예약하기
                  </button>
                </div>
              </>
            )}

            {reservationMessage && <p className="text-xs text-emerald-800">{reservationMessage}</p>}
            {reservationError && <p className="text-xs text-rose-700">{reservationError}</p>}
          </div>

          <button type="button" onClick={refreshCongestion} className="w-full rounded-xl border border-teal-700 text-teal-700 py-2.5 font-semibold">
            혼잡도 새로고침
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-800">부스 관리자 로그인</p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className="border rounded px-2 py-2 text-sm"
                placeholder="운영 키 입력"
                value={opsKeyInput}
                onChange={(e) => setOpsKeyInput(e.target.value)}
              />
              <button type="button" onClick={handleOpsLogin} className="rounded bg-slate-800 text-white px-3 py-2 text-sm font-semibold">
                로그인
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
