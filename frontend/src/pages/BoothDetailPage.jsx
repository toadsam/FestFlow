import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createBoothReservation,
  createBoothReservationCheckInToken,
  createBoothStream,
  fetchBoothById,
  fetchBoothReservations,
  fetchCongestion,
  sendReservationAuthCode,
  verifyReservationAuthCode,
} from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { resolveBoothImageUrl } from '../config/boothImages';
import {
  clearReservationAuth,
  getReservationPhone,
  getReservationToken,
  saveReservationAuth,
} from '../utils/reservationAuth';

export default function BoothDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booth, setBooth] = useState(null);
  const [congestion, setCongestion] = useState(null);
  const [reservationState, setReservationState] = useState(null);

  const [error, setError] = useState('');
  const [reservationError, setReservationError] = useState('');
  const [reservationMessage, setReservationMessage] = useState('');

  const [phoneNumber, setPhoneNumber] = useState(getReservationPhone());
  const [verifyCode, setVerifyCode] = useState('');
  const [debugCode, setDebugCode] = useState('');
  const [sendCooldownSeconds, setSendCooldownSeconds] = useState(0);

  const [reservationToken, setReservationToken] = useState(getReservationToken());
  const [seatCount, setSeatCount] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState(null);

  const [checkInQrDataUrl, setCheckInQrDataUrl] = useState('');
  const [checkInQrExpiresAt, setCheckInQrExpiresAt] = useState('');

  const [opsKeyInput, setOpsKeyInput] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  async function loadPage() {
    try {
      const [boothData, congestionData, reservationData] = await Promise.all([
        fetchBoothById(id),
        fetchCongestion(id),
        fetchBoothReservations(id, reservationToken),
      ]);

      setBooth(boothData);
      setCongestion(congestionData);
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
  }, [id, reservationToken]);

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
        // ignore stream parse error
      }
    });
    return () => stream.close();
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sendCooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setSendCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sendCooldownSeconds]);

  async function refreshCongestion() {
    try {
      const updated = await fetchCongestion(id);
      setCongestion(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  async function refreshReservations() {
    const updated = await fetchBoothReservations(id, reservationToken);
    setReservationState(updated);
    if (!selectedTableId && updated.tables.length > 0) {
      setSelectedTableId(updated.tables[0].id);
    }
  }

  async function handleSendCode() {
    try {
      setReservationError('');
      const response = await sendReservationAuthCode(phoneNumber);
      setDebugCode(response.debugCode || '');
      setReservationMessage('인증번호를 발송했습니다.');
      setSendCooldownSeconds(30);
    } catch (e) {
      setReservationError(e.message);
    }
  }

  async function handleVerifyCode() {
    try {
      setReservationError('');
      const response = await verifyReservationAuthCode(phoneNumber, verifyCode);
      saveReservationAuth(response.reservationToken, response.phoneNumber);
      setReservationToken(response.reservationToken);
      setPhoneNumber(response.phoneNumber);
      setVerifyCode('');
      setDebugCode('');
      setReservationMessage('전화번호 인증이 완료되었습니다.');
    } catch (e) {
      setReservationError(e.message);
    }
  }

  function handleLogoutReservationAuth() {
    clearReservationAuth();
    setReservationToken('');
    setCheckInQrDataUrl('');
    setCheckInQrExpiresAt('');
  }

  async function handleReserve() {
    if (!selectedTableId) {
      setReservationError('테이블을 선택해주세요.');
      return;
    }

    try {
      setReservationError('');
      setReservationMessage('');
      await createBoothReservation(
        id,
        {
          tableId: selectedTableId,
          seatCount: Math.max(1, Number(seatCount) || 1),
        },
        reservationToken
      );
      setReservationMessage('예약이 완료되었습니다. 제한 시간 내 도착 후 QR 체크인을 진행하세요.');
      await refreshReservations();
    } catch (e) {
      setReservationError(e.message);
    }
  }

  async function handleGenerateCheckInQr() {
    const reservationId = reservationState?.myReservation?.id;
    if (!reservationId) return;

    try {
      setReservationError('');
      const tokenPayload = await createBoothReservationCheckInToken(id, reservationId, reservationToken);
      const qrData = await QRCode.toDataURL(tokenPayload.token, { width: 220, margin: 1 });
      setCheckInQrDataUrl(qrData);
      setCheckInQrExpiresAt(tokenPayload.expiresAt);
      setReservationMessage('체크인 QR을 생성했습니다. 60초 내 관리자에게 보여주세요.');
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

  const remainingSeconds = myReservation
    ? Math.max(0, Math.floor((new Date(myReservation.expiresAt).getTime() - nowTick) / 1000))
    : 0;

  const qrRemainingSeconds = checkInQrExpiresAt
    ? Math.max(0, Math.floor((new Date(checkInQrExpiresAt).getTime() - nowTick) / 1000))
    : 0;

  const selectedTable = reservationState?.tables?.find((table) => table.id === selectedTableId) || null;
  const requestedSeatCount = Math.max(1, Number(seatCount) || 1);
  const noSeat = selectedTable ? selectedTable.availableSeats < requestedSeatCount : true;

  const canReserve = Boolean(
    reservationToken
      && reservationState
      && !myReservation
      && !(penalty?.blocked)
      && selectedTable
      && selectedTable.availableSeats > 0
      && !noSeat
  );

  const reservationTimerText = useMemo(() => {
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [remainingSeconds]);

  const qrTimerText = useMemo(() => {
    const mm = String(Math.floor(qrRemainingSeconds / 60)).padStart(2, '0');
    const ss = String(qrRemainingSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [qrRemainingSeconds]);

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

            {!reservationToken && (
              <div className="rounded-md border border-emerald-200 bg-white p-2 space-y-2">
                <p className="text-xs font-semibold text-slate-700">전화번호 인증</p>
                <input
                  className="w-full border rounded px-2 py-2 text-sm"
                  placeholder="전화번호 입력 (예: 01012345678)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    className="border rounded px-2 py-2 text-sm"
                    placeholder="인증번호 6자리"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                  />
                  <button type="button" onClick={handleVerifyCode} className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">
                    인증확인
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendCooldownSeconds > 0}
                  className="w-full rounded border border-emerald-400 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {sendCooldownSeconds > 0 ? `인증번호 재요청 (${sendCooldownSeconds}s)` : '인증번호 받기'}
                </button>
                {debugCode && <p className="text-[11px] text-slate-600">개발용 인증번호: {debugCode}</p>}
              </div>
            )}

            {reservationToken && (
              <div className="rounded-md border border-emerald-200 bg-white p-2 space-y-1">
                <p className="text-xs text-slate-700">인증된 번호: {phoneNumber || getReservationPhone()}</p>
                <button type="button" onClick={handleLogoutReservationAuth} className="text-xs text-rose-600 font-semibold">
                  인증 해제
                </button>
              </div>
            )}

            {penalty?.blocked && (
              <p className="text-xs text-rose-700">
                예약 제한 중: {penalty.blockedUntil?.replace('T', ' ').slice(5, 16)}까지
              </p>
            )}
            {!penalty?.blocked && <p className="text-xs text-emerald-800">노쇼 횟수: {penalty?.noShowCount ?? 0} / 2</p>}

            {myReservation ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">내 활성 예약</p>
                <p>테이블: {myReservation.tableName}</p>
                <p>좌석: {myReservation.seatCount}</p>
                <p className="font-bold">남은 시간: {reservationTimerText}</p>
                <button
                  type="button"
                  onClick={handleGenerateCheckInQr}
                  className="mt-1 w-full rounded bg-amber-600 text-white py-2 text-xs font-semibold"
                >
                  체크인 QR 생성
                </button>
                {checkInQrDataUrl && qrRemainingSeconds > 0 && (
                  <div className="mt-2 rounded border border-amber-300 bg-white p-2 flex flex-col items-center gap-1">
                    <img src={checkInQrDataUrl} alt="check-in qr" className="h-40 w-40 object-contain" />
                    <p className="text-[11px] font-semibold">QR 만료까지: {qrTimerText}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {reservationState.tables.length ? reservationState.tables.map((table) => {
                    const tableSoldOut = table.availableSeats <= 0;
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => !tableSoldOut && setSelectedTableId(table.id)}
                        disabled={tableSoldOut}
                        className={`w-full rounded-md border px-2 py-2 text-left text-xs ${
                          tableSoldOut
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                            : selectedTableId === table.id
                              ? 'border-emerald-600 bg-white'
                              : 'border-emerald-200 bg-emerald-100/50'
                        }`}
                      >
                        <p className="font-semibold">{table.tableName}</p>
                        <p>총 {table.totalSeats}석 / 남은 {table.availableSeats}석</p>
                        {tableSoldOut && <p className="text-rose-500 mt-0.5">예약 불가 (좌석 없음)</p>}
                      </button>
                    );
                  }) : (
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
                    disabled={!canReserve}
                    className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    예약하기
                  </button>
                </div>
                {selectedTable && noSeat && selectedTable.availableSeats > 0 && (
                  <p className="text-xs text-rose-700">요청 좌석 수가 남은 좌석보다 많습니다.</p>
                )}
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
