import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate, useParams } from "react-router-dom";
import {
  createBoothReservation,
  createBoothReservationCheckInToken,
  createBoothStream,
  fetchBoothById,
  fetchBoothReservations,
  fetchCongestion,
  sendReservationAuthCode,
  verifyReservationAuthCode,
} from "../api";
import CongestionBadge from "../components/CongestionBadge";
import { resolveBoothImageUrl } from "../config/boothImages";
import {
  clearReservationAuth,
  getReservationPhone,
  getReservationToken,
  saveReservationAuth,
} from "../utils/reservationAuth";

function SeatAvailabilityBar({ totalSeats, availableSeats }) {
  const total = Math.max(1, Number(totalSeats) || 1);
  const available = Math.max(0, Math.min(total, Number(availableSeats) || 0));
  const ratio = Math.round((available / total) * 100);

  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full rounded ${ratio >= 60 ? "bg-emerald-500" : ratio >= 30 ? "bg-amber-500" : "bg-rose-500"}`}
          style={{ width: `${ratio}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-600">가용 {available} / 전체 {total}</p>
    </div>
  );
}

function SeatDots({ totalSeats, availableSeats }) {
  const total = Math.min(12, Math.max(1, Number(totalSeats) || 1));
  const available = Math.max(0, Math.min(total, Number(availableSeats) || 0));

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Array.from({ length: total }, (_, idx) => (
        <span
          key={`seat-dot-${idx}`}
          className={`h-2.5 w-2.5 rounded-full ${idx < available ? "bg-emerald-500" : "bg-slate-300"}`}
        />
      ))}
    </div>
  );
}

function TableMiniLayout({ totalSeats, availableSeats }) {
  const total = Math.max(1, Math.min(12, Number(totalSeats) || 1));
  const available = Math.max(0, Math.min(total, Number(availableSeats) || 0));
  const radius = 34;
  const center = 44;

  return (
    <div className="mx-auto w-[88px]">
      <div className="relative h-[88px] w-[88px]">
        <div className="absolute inset-2 rounded-full border border-dashed border-slate-300" />
        <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-400 bg-white text-[9px] font-semibold text-slate-600 flex items-center justify-center">
          T
        </div>
        {Array.from({ length: total }, (_, idx) => {
          const angle = ((360 / total) * idx - 90) * (Math.PI / 180);
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const isAvailable = idx < available;
          return (
            <span
              key={`mini-seat-${idx}`}
              className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                isAvailable
                  ? "bg-emerald-500 border-emerald-300"
                  : "bg-slate-200 border-slate-300"
              }`}
              style={{ left: `${x}px`, top: `${y}px` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReservationStepPill({ step, label, active, done }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-2 py-2 h-16 ${
        done
          ? "border-emerald-300 bg-gradient-to-b from-emerald-100 to-emerald-200/80 shadow-[0_0_14px_rgba(16,185,129,0.2)]"
          : active
            ? "border-cyan-300 bg-gradient-to-b from-cyan-100 to-cyan-200/80 shadow-[0_0_14px_rgba(34,211,238,0.2)]"
            : "border-slate-200 bg-gradient-to-b from-white to-slate-100"
      }`}
    >
      <div className="flex h-full items-center justify-center gap-1.5 whitespace-nowrap">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
            done
              ? "border-emerald-600 bg-emerald-500 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
              : active
                ? "border-cyan-600 bg-cyan-500 text-white"
                : "border-slate-300 bg-white text-slate-500"
          }`}
        >
          {done ? "✓" : step}
        </span>
        <span
          className={`text-[13px] font-extrabold tracking-tight ${
            done
              ? "text-emerald-900"
              : active
                ? "text-cyan-900"
                : "text-slate-600"
          }`}
        >
          {step}. {label}
        </span>
      </div>
      {done && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-emerald-500/80" />
      )}
      {active && !done && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-cyan-500/80 animate-pulse" />
      )}
      {!active && !done && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-slate-300/70" />
      )}
    </div>
  );
}

function parseMenuBoardJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item?.name || "").trim(),
        price: String(item?.price || "").trim(),
        description: String(item?.description || "").trim(),
        soldOut: Boolean(item?.soldOut),
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

function boothMetaLabel(booth) {
  const time =
    booth?.openTime || booth?.closeTime
      ? `${booth.openTime || "--:--"}~${booth.closeTime || "--:--"}`
      : "시간 미정";
  return `${booth?.category || "주점"} · ${booth?.dayPart || "야간"} · ${time}`;
}

export default function BoothDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booth, setBooth] = useState(null);
  const [congestion, setCongestion] = useState(null);
  const [reservationState, setReservationState] = useState(null);

  const [error, setError] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [reservationMessage, setReservationMessage] = useState("");

  const [phoneNumber, setPhoneNumber] = useState(getReservationPhone());
  const [verifyCode, setVerifyCode] = useState("");
  const [sendCooldownSeconds, setSendCooldownSeconds] = useState(0);

  const [reservationToken, setReservationToken] = useState(getReservationToken());
  const [seatCount, setSeatCount] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [confirmTargetTable, setConfirmTargetTable] = useState(null);
  const [isConfirmModalActive, setIsConfirmModalActive] = useState(false);
  const [isConfirmModalClosing, setIsConfirmModalClosing] = useState(false);
  const [isReserving, setIsReserving] = useState(false);

  const [checkInQrDataUrl, setCheckInQrDataUrl] = useState("");
  const [checkInQrExpiresAt, setCheckInQrExpiresAt] = useState("");

  const [opsKeyInput, setOpsKeyInput] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const authPanelRef = useRef(null);
  const reservationPanelRef = useRef(null);
  const [showAboutSection, setShowAboutSection] = useState(false);
  const [showMenuBoardSection, setShowMenuBoardSection] = useState(false);
  const [showReservationSection, setShowReservationSection] = useState(true);

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
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reservationToken]);

  useEffect(() => {
    const stream = createBoothStream();
    stream.addEventListener("booths", (event) => {
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

  useEffect(() => {
    if (!confirmTargetTable) {
      setIsConfirmModalActive(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setIsConfirmModalActive(true), 10);
    return () => window.clearTimeout(timer);
  }, [confirmTargetTable]);

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
      setReservationError("");
      const response = await sendReservationAuthCode(phoneNumber);
      setReservationMessage("인증번호를 발송했습니다.");
      setSendCooldownSeconds(30);
    } catch (e) {
      setReservationError(e.message);
    }
  }

  async function handleVerifyCode() {
    try {
      setReservationError("");
      const response = await verifyReservationAuthCode(phoneNumber, verifyCode);
      saveReservationAuth(response.reservationToken, response.phoneNumber);
      setReservationToken(response.reservationToken);
      setPhoneNumber(response.phoneNumber);
      setVerifyCode("");
      setReservationMessage("전화번호 인증이 완료되었습니다.");
    } catch (e) {
      setReservationError(e.message);
    }
  }

  function handleLogoutReservationAuth() {
    clearReservationAuth();
    setReservationToken("");
    setCheckInQrDataUrl("");
    setCheckInQrExpiresAt("");
  }

  function guideToAuth() {
    setReservationError("1단계: 먼저 전화번호 인증을 완료해 주세요.");
    setReservationMessage("");
    authPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleQuickReserveStart() {
    setShowReservationSection(true);
    reservationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!reservationToken) {
      window.setTimeout(() => guideToAuth(), 220);
    }
  }

  async function reserveTable(tableId, count) {
    if (!tableId) return;

    setIsReserving(true);
    try {
      setReservationError("");
      setReservationMessage("");
      await createBoothReservation(
        id,
        {
          tableId,
          seatCount: Math.max(1, Number(count) || 1),
        },
        reservationToken,
      );
      setReservationMessage("예약이 완료되었습니다. 제한 시간 내 QR 체크인을 진행해 주세요.");
      await refreshReservations();
    } catch (e) {
      setReservationError(e.message);
    } finally {
      setIsReserving(false);
    }
  }

  async function handleReserve() {
    if (!selectedTableId) {
      setReservationError("테이블을 선택해 주세요.");
      return;
    }
    await reserveTable(selectedTableId, seatCount);
  }

  async function handleReserveByTable(table) {
    if (!table || table.availableSeats <= 0) return;

    setSelectedTableId(table.id);

    if (!reservationToken) {
      guideToAuth();
      return;
    }
    if (penalty?.blocked) {
      setReservationError("현재 예약이 제한되어 있습니다.");
      setReservationMessage("");
      return;
    }

    const requestedSeatCount = Math.max(1, Number(seatCount) || 1);
    if (table.availableSeats < requestedSeatCount) {
      setReservationError("요청 좌석 수가 남은 좌석보다 많습니다.");
      setReservationMessage("");
      return;
    }

    setIsConfirmModalClosing(false);
    setConfirmTargetTable(table);
  }

  async function handleConfirmReserve() {
    if (!confirmTargetTable) return;

    const requestedSeatCount = Math.max(1, Number(seatCount) || 1);
    await reserveTable(confirmTargetTable.id, requestedSeatCount);
    closeConfirmModal();
  }

  function closeConfirmModal() {
    setIsConfirmModalClosing(true);
    window.setTimeout(() => {
      setConfirmTargetTable(null);
      setIsConfirmModalActive(false);
      setIsConfirmModalClosing(false);
    }, 170);
  }

  async function handleGenerateCheckInQr() {
    const reservationId = reservationState?.myReservation?.id;
    if (!reservationId) return;

    try {
      setReservationError("");
      const tokenPayload = await createBoothReservationCheckInToken(
        id,
        reservationId,
        reservationToken,
      );
      const qrData = await QRCode.toDataURL(tokenPayload.token, {
        width: 220,
        margin: 1,
      });
      setCheckInQrDataUrl(qrData);
      setCheckInQrExpiresAt(tokenPayload.expiresAt);
      setReservationMessage("체크인 QR이 생성되었습니다. 60초 이내 관리자에게 보여주세요.");
    } catch (e) {
      setReservationError(e.message);
    }
  }

  function handleOpsLogin() {
    const key = opsKeyInput.trim();
    if (!key) {
      setReservationError("운영 키를 입력해 주세요.");
      return;
    }
    navigate(`/ops/booth/${id}?key=${encodeURIComponent(key)}`);
  }

  const myReservation = reservationState?.myReservation ?? null;
  const penalty = reservationState?.penalty ?? null;
  const isAuthComplete = Boolean(reservationToken);
  const isReserveStepActive = isAuthComplete && !myReservation && !penalty?.blocked;

  const remainingSeconds = myReservation
    ? Math.max(0, Math.floor((new Date(myReservation.expiresAt).getTime() - nowTick) / 1000))
    : 0;

  const qrRemainingSeconds = checkInQrExpiresAt
    ? Math.max(0, Math.floor((new Date(checkInQrExpiresAt).getTime() - nowTick) / 1000))
    : 0;

  const selectedTable =
    reservationState?.tables?.find((table) => table.id === selectedTableId) || null;
  const menuItems = useMemo(() => parseMenuBoardJson(booth?.menuBoardJson), [booth?.menuBoardJson]);
  const requestedSeatCount = Math.max(1, Number(seatCount) || 1);
  const noSeat = selectedTable ? selectedTable.availableSeats < requestedSeatCount : true;

  const canReserve = Boolean(
    reservationToken &&
      reservationState &&
      !myReservation &&
      !penalty?.blocked &&
      selectedTable &&
      selectedTable.availableSeats > 0 &&
      !noSeat,
  );

  const reservationTimerText = useMemo(() => {
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
    const ss = String(remainingSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [remainingSeconds]);

  const qrTimerText = useMemo(() => {
    const mm = String(Math.floor(qrRemainingSeconds / 60)).padStart(2, "0");
    const ss = String(qrRemainingSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [qrRemainingSeconds]);

  if (error) {
    return <p className="pt-4 text-sm text-rose-600">{error}</p>;
  }

  if (!booth || !congestion || !reservationState) {
    return <p className="pt-4 text-sm text-slate-500">불러오는 중...</p>;
  }

  return (
    <>
      <section className="cyber-page pt-4 space-y-4 pb-24 md:pb-4">
      <div className="sticky top-2 z-40">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="홈으로 돌아가기"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/70 bg-cyan-950/70 text-xl font-bold text-cyan-100 shadow-[0_10px_24px_rgba(6,182,212,0.28)] backdrop-blur-md"
        >
          <span aria-hidden="true">←</span>
          <span className="sr-only">홈으로 돌아가기</span>
        </button>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="aspect-[16/10] bg-slate-100">
          <img
            src={resolveBoothImageUrl(booth)}
            alt={`${booth.name} 대표 이미지`}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-800">{booth.name}</h2>
            <CongestionBadge level={congestion.level} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
              {boothMetaLabel(booth)}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              {booth.reservationEnabled === false ? "예약 없음" : "예약/웨이팅 가능"}
            </span>
            {booth.tags && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                {booth.tags}
              </span>
            )}
          </div>

          <p className="text-sm text-slate-600">{booth.description}</p>

          {booth.reservationEnabled !== false && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between gap-2">
              <div className="text-xs text-emerald-900 space-y-0.5">
                <p className="font-semibold">예약 우선 화면</p>
                <p>인증 후 테이블 선택으로 바로 진행할 수 있어요.</p>
              </div>
              <button
                type="button"
                onClick={handleQuickReserveStart}
                className="shrink-0 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
              >
                예약 시작
              </button>
            </div>
          )}

          {(booth.boothIntro || booth.menuImageUrl) && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAboutSection((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between text-left"
              >
                <p className="text-sm font-semibold text-cyan-900">부스 소개</p>
                <span className="text-xs text-cyan-700">{showAboutSection ? "접기" : "펼치기"}</span>
              </button>
              {showAboutSection && (
                <div className="px-3 pt-3 pb-3 space-y-2">
                  {booth.boothIntro && (
                    <p className="text-sm text-cyan-800 whitespace-pre-line">
                      {booth.boothIntro}
                    </p>
                  )}
                  {booth.menuImageUrl && (
                    <div className="overflow-hidden rounded border border-cyan-200 bg-white">
                      <img
                        src={booth.menuImageUrl}
                        alt={`${booth.name} 음식 사진`}
                        className="h-40 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {menuItems.length > 0 && (
            <div className="mt-1 rounded-lg border border-fuchsia-200 bg-gradient-to-b from-fuchsia-50 to-indigo-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMenuBoardSection((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between text-left"
              >
                <p className="text-sm font-semibold text-fuchsia-900">메뉴판</p>
                <span className="text-[11px] text-fuchsia-700">{showMenuBoardSection ? "접기" : "펼치기"}</span>
              </button>
              {showMenuBoardSection && (
                <div className="px-3 pt-3 pb-3 space-y-2">
                  {menuItems.map((item, index) => (
                    <article
                      key={`menu-board-${index}`}
                      className={`rounded-md border p-2 ${
                        item.soldOut
                          ? "border-slate-300 bg-slate-100"
                          : "border-fuchsia-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`font-bold ${item.soldOut ? "text-slate-500 line-through" : "text-slate-800"}`}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2">
                          {item.price && (
                            <span className={`text-sm font-extrabold ${item.soldOut ? "text-slate-500" : "text-fuchsia-700"}`}>
                              {item.price}
                            </span>
                          )}
                          {item.soldOut && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                              품절
                            </span>
                          )}
                        </div>
                      </div>
                      {item.description && (
                        <p className={`mt-1 text-xs ${item.soldOut ? "text-slate-400" : "text-slate-600"}`}>
                          {item.description}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          <div ref={reservationPanelRef} className="rounded-lg border border-emerald-200 bg-emerald-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowReservationSection((prev) => !prev)}
              className="w-full p-3 flex items-center justify-between text-left"
            >
              <p className="text-sm font-semibold text-emerald-900">예약</p>
              <span className="text-xs text-emerald-700">{showReservationSection ? "접기" : "펼치기"}</span>
            </button>
            {showReservationSection && (
              <div className="px-3 pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 rounded-md border border-emerald-200 bg-white p-2 text-[11px]">
              <div>
                <p className="text-slate-500">대기</p>
                <p className="font-semibold text-emerald-800">{booth.estimatedWaitMinutes ?? "-"}분</p>
              </div>
              <div>
                <p className="text-slate-500">재고</p>
                <p className="font-semibold text-emerald-800">{booth.remainingStock ?? "-"}</p>
              </div>
              <div>
                <p className="text-slate-500">메모</p>
                <p className="font-semibold text-emerald-800 line-clamp-1">{booth.liveStatusMessage || "없음"}</p>
              </div>
            </div>
            <p className="text-xs text-emerald-800">
              최대 예약 유지 시간: {reservationState.maxReservationMinutes}분
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              <ReservationStepPill
                step={1}
                label="인증"
                active={!isAuthComplete}
                done={isAuthComplete}
              />
              <ReservationStepPill
                step={2}
                label="테이블"
                active={isAuthComplete && !selectedTable}
                done={Boolean(selectedTable)}
              />
              <ReservationStepPill
                step={3}
                label="예약"
                active={isReserveStepActive && !myReservation}
                done={Boolean(myReservation)}
              />
            </div>
            {!reservationToken && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                테이블을 누르기 전에 전화번호 인증을 완료해야 예약이 가능합니다.
              </p>
            )}

            {!reservationToken && (
              <div ref={authPanelRef} className="rounded-md border border-emerald-200 bg-white p-2 space-y-2">
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
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                  >
                    인증 확인
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendCooldownSeconds > 0}
                  className="w-full rounded border border-emerald-400 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {sendCooldownSeconds > 0
                    ? `인증번호 재요청 (${sendCooldownSeconds}s)`
                    : "인증번호 받기"}
                </button>
              </div>
            )}

            {reservationToken && (
              <div className="rounded-md border border-emerald-200 bg-white p-2 space-y-1">
                <p className="text-xs text-slate-700">인증된 번호: {phoneNumber || getReservationPhone()}</p>
                <button
                  type="button"
                  onClick={handleLogoutReservationAuth}
                  className="text-xs text-rose-600 font-semibold"
                >
                  인증 해제
                </button>
              </div>
            )}

            {penalty?.blocked && (
              <p className="text-xs text-rose-700">
                예약 제한 중 ({penalty.blockedUntil?.replace("T", " ").slice(5, 16)}까지)
              </p>
            )}
            {!penalty?.blocked && (
              <p className="text-xs text-emerald-800">노쇼 횟수: {penalty?.noShowCount ?? 0} / 2</p>
            )}

            {myReservation ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">현재 활성 예약</p>
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
                    <img
                      src={checkInQrDataUrl}
                      alt="check-in qr"
                      className="h-40 w-40 object-contain"
                    />
                    <p className="text-[11px] font-semibold">QR 만료까지: {qrTimerText}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {reservationState.tables.length ? (
                    reservationState.tables.map((table) => {
                      const tableSoldOut = table.availableSeats <= 0;
                      const isSelected = selectedTableId === table.id;
                      return (
                        <article
                          key={table.id}
                          className={`rounded-md border p-2 ${
                            tableSoldOut
                              ? "border-slate-200 bg-slate-100 text-slate-400"
                              : !reservationToken
                                ? "border-amber-200 bg-amber-50/80"
                              : isSelected
                                ? "border-emerald-600 bg-white"
                                : "border-emerald-200 bg-emerald-100/50"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleReserveByTable(table)}
                            disabled={tableSoldOut}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-sm">{table.tableName}</p>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full ${
                                  tableSoldOut
                                    ? "bg-rose-100 text-rose-700"
                                    : !reservationToken
                                      ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {tableSoldOut ? "예약불가" : !reservationToken ? "인증 필요" : "예약가능"}
                              </span>
                            </div>
                            <div className="mt-2">
                              <TableMiniLayout
                                totalSeats={table.totalSeats}
                                availableSeats={table.availableSeats}
                              />
                              <SeatAvailabilityBar
                                totalSeats={table.totalSeats}
                                availableSeats={table.availableSeats}
                              />
                              <SeatDots
                                totalSeats={table.totalSeats}
                                availableSeats={table.availableSeats}
                              />
                            </div>
                          </button>
                        </article>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-600">테이블이 아직 설정되지 않았습니다.</p>
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
                    disabled={!canReserve || isReserving}
                    className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {isReserving ? "예약 중..." : "예약하기"}
                  </button>
                </div>
                {!reservationToken && (
                  <p className="text-[11px] text-slate-600">
                    인증이 끝나면 테이블 선택 시 예약 확인 모달이 열립니다.
                  </p>
                )}

                {selectedTable && noSeat && selectedTable.availableSeats > 0 && (
                  <p className="text-xs text-rose-700">요청 좌석 수가 남은 좌석보다 많습니다.</p>
                )}
              </>
            )}

            {reservationMessage && (
              <p className="text-xs text-emerald-800">{reservationMessage}</p>
            )}
            {reservationError && (
              <p className="text-xs text-rose-700">{reservationError}</p>
            )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={refreshCongestion}
            className="w-full rounded-xl border border-teal-700 text-teal-700 py-2.5 font-semibold"
          >
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
              <button
                type="button"
                onClick={handleOpsLogin}
                className="rounded bg-slate-800 text-white px-3 py-2 text-sm font-semibold"
              >
                로그인
              </button>
            </div>
          </div>
        </div>
      </article>
      </section>

      {!myReservation && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 md:hidden">
          <button
            type="button"
            onClick={handleQuickReserveStart}
            className="w-full rounded-xl border border-emerald-300 bg-emerald-600 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(5,150,105,0.35)]"
          >
            {reservationToken ? "테이블 선택하고 예약하기" : "전화번호 인증하고 예약하기"}
          </button>
        </div>
      )}

      {confirmTargetTable && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="모달 닫기"
            className={`absolute inset-0 backdrop-blur-[2px] transition-all duration-150 ${
              isConfirmModalClosing || !isConfirmModalActive ? "bg-slate-950/0" : "bg-slate-950/55"
            }`}
            onClick={closeConfirmModal}
          />
          <article
            className={`relative w-full max-w-sm rounded-2xl border border-cyan-300/70 bg-slate-950/95 p-4 shadow-[0_0_24px_rgba(34,211,238,0.35)] transition-all duration-150 ${
              isConfirmModalClosing || !isConfirmModalActive
                ? "translate-y-3 scale-95 opacity-0"
                : "translate-y-0 scale-100 opacity-100"
            }`}
          >
            <p className="text-xs tracking-[0.18em] text-cyan-300">TABLE RESERVATION</p>
            <h3 className="mt-1 text-lg font-bold text-white">예약하시겠습니까?</h3>
            <div className="mt-3 rounded-xl border border-cyan-400/40 bg-cyan-950/30 p-3 text-sm text-cyan-100 space-y-1">
              <p>
                테이블: <span className="font-semibold text-white">{confirmTargetTable.tableName}</span>
              </p>
              <p>
                예약 좌석: <span className="font-semibold text-white">{Math.max(1, Number(seatCount) || 1)}석</span>
              </p>
              <p>
                남은 좌석: <span className="font-semibold text-emerald-300">{confirmTargetTable.availableSeats}석</span>
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-lg border border-slate-500/70 py-2 text-sm font-semibold text-slate-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmReserve}
                disabled={isReserving}
                className="rounded-lg border border-cyan-300 bg-cyan-500/20 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50"
              >
                {isReserving ? "처리 중..." : "예약하기"}
              </button>
            </div>
          </article>
        </div>
      )}
    </>
  );
}








