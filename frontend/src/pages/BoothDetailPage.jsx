import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createBoothReservation,
  createBoothReservationCheckInToken,
  createBoothStream,
  createReservationStream,
  fetchBoothById,
  fetchBoothReservations,
  fetchCongestion,
  sendReservationAuthCode,
  verifyReservationAuthCode,
} from "../api";
import { IconArrowLeft, IconClock, IconMapPin, IconRefresh, IconSearch } from "../components/UxIcons";
import { resolveBoothImageUrl } from "../config/boothImages";
import { fallbackBooths } from "../data/festivalUiData";
import {
  clearReservationAuth,
  getReservationPhone,
  getReservationToken,
  saveReservationAuth,
} from "../utils/reservationAuth";

const BOOTH_KEY_STORAGE_KEY = "festflow_ops_booth_key";

function createKakaoDirectionsUrl(booth) {
  const name = booth?.name || booth?.locationName || "FestFlow 부스";
  const lat = Number(booth?.latitude);
  const lng = Number(booth?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
}

function fallbackBooth(id) {
  return fallbackBooths.find((item) => Number(item.id) === Number(id)) || fallbackBooths[0];
}

function createEmptyReservationState(maxReservationMinutes = 10) {
  return {
    maxReservationMinutes,
    tables: [],
    activeReservations: [],
    myReservation: null,
    penalty: null,
  };
}

function formatTimeRange(booth) {
  if (booth?.openTime || booth?.closeTime) {
    return `${booth.openTime || "--:--"} - ${booth.closeTime || "--:--"}`;
  }
  return "18:00 - 23:00";
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

function tableSeats(table) {
  return Math.max(0, Number(table?.reservableSeats ?? table?.availableSeats) || 0);
}

function tableStatus(table) {
  if (table?.occupancyStatus) return table.occupancyStatus;
  return tableSeats(table) > 0 ? "AVAILABLE" : "FULL";
}

function tableStatusLabel(table) {
  if (table?.occupancyLabel) return table.occupancyLabel;
  switch (tableStatus(table)) {
    case "IN_USE":
      return "이용중";
    case "RESERVED":
      return "예약중";
    case "FULL":
      return "마감";
    default:
      return "예약 가능";
  }
}

function canReserveTable(table) {
  return tableStatus(table) === "AVAILABLE" && tableSeats(table) > 0;
}

function parseTimeMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function timerText(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function BoothDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const authRef = useRef(null);
  const reservationRef = useRef(null);

  const [booth, setBooth] = useState(() => fallbackBooth(id));
  const [congestion, setCongestion] = useState(null);
  const [reservationState, setReservationState] = useState(() => createEmptyReservationState());
  const [error, setError] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [message, setMessage] = useState("");

  const [phoneNumber, setPhoneNumber] = useState(getReservationPhone());
  const [verifyCode, setVerifyCode] = useState("");
  const [sendCooldownSeconds, setSendCooldownSeconds] = useState(0);
  const [reservationToken, setReservationToken] = useState(getReservationToken());

  const [seatCount, setSeatCount] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [reserving, setReserving] = useState(false);
  const [checkInQrDataUrl, setCheckInQrDataUrl] = useState("");
  const [checkInQrToken, setCheckInQrToken] = useState("");
  const [checkInQrExpiresAt, setCheckInQrExpiresAt] = useState("");
  const [opsKeyInput, setOpsKeyInput] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  function applyReservationState(nextState) {
    const safe = nextState || createEmptyReservationState(booth?.maxReservationMinutes);
    setReservationState(safe);
    setSelectedTableId((current) => {
      const tables = safe.tables || [];
      if (!tables.length) return null;
      if (current && tables.some((table) => table.id === current)) return current;
      const firstReservable = tables.find(canReserveTable) || tables[0];
      return firstReservable.id;
    });
  }

  async function loadReservations(token = reservationToken, boothData = booth) {
    try {
      const data = await fetchBoothReservations(id, token);
      applyReservationState(data);
      setReservationError("");
    } catch (error) {
      if (token) {
        clearReservationAuth();
        setReservationToken("");
        setReservationError("예약 인증이 만료되어 다시 인증해 주세요.");
        try {
          const publicData = await fetchBoothReservations(id, "");
          applyReservationState(publicData);
          return;
        } catch {
          // Fall back below.
        }
      } else {
        setReservationError(error.message);
      }
      applyReservationState(createEmptyReservationState(boothData?.maxReservationMinutes));
    }
  }

  async function loadPage() {
    const [boothResult, congestionResult] = await Promise.allSettled([
      fetchBoothById(id),
      fetchCongestion(id),
    ]);

    const boothData =
      boothResult.status === "fulfilled" ? boothResult.value : fallbackBooth(id);
    setBooth(boothData);
    setCongestion(congestionResult.status === "fulfilled" ? congestionResult.value : null);
    setError(
      boothResult.status === "rejected"
        ? "실시간 부스 정보를 불러오지 못해 기본 안내를 표시 중입니다."
        : "",
    );
    await loadReservations(reservationToken, boothData);
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reservationToken]);

  useEffect(() => {
    let boothStream = null;
    try {
      boothStream = createBoothStream();
      boothStream.addEventListener("booths", (event) => {
        try {
          const list = JSON.parse(event.data);
          const next = Array.isArray(list)
            ? list.find((item) => String(item.id) === String(id))
            : null;
          if (next) setBooth(next);
        } catch {
          // Ignore malformed stream payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    let reservationStream = null;
    try {
      reservationStream = createReservationStream();
      reservationStream.addEventListener("reservations", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload?.boothId || String(payload.boothId) === String(id)) {
            loadReservations(reservationToken).catch((error) => setReservationError(error.message));
          }
        } catch {
          // Ignore malformed stream payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    return () => {
      boothStream?.close();
      reservationStream?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reservationToken]);

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

  const selectedTable = useMemo(
    () => reservationState.tables?.find((table) => table.id === selectedTableId) || null,
    [reservationState.tables, selectedTableId],
  );

  const myReservation = reservationState.myReservation;
  const penalty = reservationState.penalty;
  const isAuthComplete = Boolean(reservationToken);
  const remainingSeconds = myReservation
    ? Math.floor((parseTimeMs(myReservation.expiresAt) - nowTick) / 1000)
    : 0;
  const qrRemainingSeconds = checkInQrExpiresAt
    ? Math.floor((parseTimeMs(checkInQrExpiresAt) - nowTick) / 1000)
    : 0;
  const menuItems = useMemo(() => parseMenuBoardJson(booth?.menuBoardJson), [booth?.menuBoardJson]);
  const requestedSeatCount = Math.max(1, Number(seatCount) || 1);
  const noSeat = selectedTable && tableSeats(selectedTable) < requestedSeatCount;
  const canReserve = Boolean(
    reservationToken &&
      selectedTable &&
      canReserveTable(selectedTable) &&
      !myReservation &&
      !penalty?.blocked &&
      !noSeat,
  );

  async function handleRefreshCongestion() {
    try {
      const next = await fetchCongestion(id);
      setCongestion(next);
      setMessage("혼잡도를 갱신했습니다.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSendCode() {
    try {
      setReservationError("");
      await sendReservationAuthCode(phoneNumber);
      setVerifyCode("");
      setMessage("인증번호를 문자로 발송했습니다.");
      setSendCooldownSeconds(30);
    } catch (error) {
      setReservationError(error.message);
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
      setMessage("전화번호 인증이 완료되었습니다.");
    } catch (error) {
      setReservationError(error.message);
    }
  }

  function handleClearAuth() {
    clearReservationAuth();
    setReservationToken("");
    setCheckInQrDataUrl("");
    setCheckInQrToken("");
    setCheckInQrExpiresAt("");
    setMessage("예약 인증을 해제했습니다.");
  }

  function guideToAuth() {
    setReservationError("먼저 전화번호 인증을 완료해 주세요.");
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleReserve() {
    if (!selectedTable) {
      setReservationError("테이블을 선택해 주세요.");
      return;
    }
    if (!reservationToken) {
      guideToAuth();
      return;
    }
    if (!canReserve) {
      setReservationError(noSeat ? "요청 좌석 수가 남은 좌석보다 많습니다." : "현재 예약할 수 없는 테이블입니다.");
      return;
    }

    setReserving(true);
    try {
      await createBoothReservation(
        id,
        { tableId: selectedTable.id, seatCount: requestedSeatCount },
        reservationToken,
      );
      setMessage("예약이 완료되었습니다. 제한 시간 내 QR 체크인을 진행해 주세요.");
      await loadReservations(reservationToken);
    } catch (error) {
      setReservationError(error.message);
    } finally {
      setReserving(false);
    }
  }

  async function handleGenerateCheckInQr() {
    if (!myReservation?.id) return;

    try {
      const tokenPayload = await createBoothReservationCheckInToken(
        id,
        myReservation.id,
        reservationToken,
      );
      const qrData = await QRCode.toDataURL(tokenPayload.token, { width: 220, margin: 1 });
      setCheckInQrDataUrl(qrData);
      setCheckInQrToken(tokenPayload.token);
      setCheckInQrExpiresAt(tokenPayload.expiresAt);
      setMessage("체크인 QR이 생성되었습니다.");
    } catch (error) {
      setReservationError(error.message);
    }
  }

  function handleOpsLogin() {
    const key = opsKeyInput.trim();
    if (!key) {
      setReservationError("부스 운영 키를 입력해 주세요.");
      return;
    }
    sessionStorage.setItem(BOOTH_KEY_STORAGE_KEY, key);
    navigate(`/ops/booth/${id}`);
  }

  function handleDirections() {
    const url = createKakaoDirectionsUrl(booth);
    const opened = window.open(url, "_blank");
    if (opened) opened.opener = null;
    if (!opened) window.location.href = url;
  }

  const imageUrl = resolveBoothImageUrl(booth);
  const congestionLabel = congestion?.level || congestion?.label || booth?.congestion || "보통";

  return (
    <section className="uni-page booth-detail-page">
      <header className="plain-page-header">
        <Link to="/stage-map" aria-label="지도로 돌아가기">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1>부스 상세</h1>
        <button type="button" aria-label="혼잡도 새로고침" onClick={handleRefreshCongestion}>
          <IconRefresh className="h-5 w-5" />
        </button>
      </header>

      <section className="booth-photo-card">
        <img src={imageUrl} alt="" />
        <button type="button" aria-label="검색으로 이동" onClick={() => navigate("/stage-map")}>
          <IconSearch className="h-5 w-5" />
        </button>
      </section>

      <section className="booth-detail-title">
        <span>{booth?.category || "축제 부스"}</span>
        <h2>{booth?.name || "축제 부스"}</h2>
        <p>{booth?.description || "아주대 축제 부스 정보를 확인하세요."}</p>
      </section>

      {error && <p className="app-inline-note">{error}</p>}
      {message && <p className="app-inline-note app-inline-note--success">{message}</p>}

      <section className="uni-card detail-info-grid">
        <article>
          <IconClock className="h-5 w-5" />
          <span>운영 시간</span>
          <strong>{formatTimeRange(booth)}</strong>
        </article>
        <button type="button" onClick={handleDirections} aria-label={`${booth?.name || "부스"} 길찾기`}>
          <IconMapPin className="h-5 w-5" />
          <span>길찾기</span>
          <strong>{booth?.locationName || "아주대 캠퍼스"}</strong>
        </button>
        <article>
          <IconSearch className="h-5 w-5" />
          <span>혼잡도</span>
          <strong>{congestionLabel}</strong>
        </article>
      </section>

      <section ref={reservationRef} className="uni-card reservation-summary-card">
        <div className="uni-section-head">
          <h2>예약 가능 좌석</h2>
          <span>{reservationState.tables?.length || 0}개 테이블</span>
        </div>

        {myReservation ? (
          <div className="active-reservation-card">
            <strong>현재 활성 예약</strong>
            <p>{myReservation.tableName} · {myReservation.seatCount}석</p>
            <span>남은 시간 {timerText(remainingSeconds)}</span>
            <button type="button" className="primary-wide-button" onClick={handleGenerateCheckInQr}>
              QR 체크인 생성
            </button>
            {checkInQrDataUrl && qrRemainingSeconds > 0 && (
              <div className="qr-card">
                <img src={checkInQrDataUrl} alt="체크인 QR" />
                <strong>QR 만료까지 {timerText(qrRemainingSeconds)}</strong>
                {checkInQrToken && (
                  <button type="button" onClick={() => navigator.clipboard?.writeText(checkInQrToken)}>
                    토큰 복사
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="seat-control-row">
              <label>
                예약 인원
                <input
                  type="number"
                  min="1"
                  value={seatCount}
                  onChange={(event) => setSeatCount(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="primary-wide-button"
                onClick={handleReserve}
                disabled={reserving}
              >
                {reserving ? "예약 중..." : "예약하기"}
              </button>
            </div>

            <div className="reservation-table-grid">
              {reservationState.tables?.length ? (
                reservationState.tables.map((table, index) => {
                  const selected = selectedTableId === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      className={selected ? "reservation-table reservation-table--selected" : "reservation-table"}
                      onClick={() => {
                        setSelectedTableId(table.id);
                        if (!reservationToken) guideToAuth();
                      }}
                      disabled={!canReserveTable(table)}
                    >
                      <strong>{table.tableName || index + 1}</strong>
                      <small>{tableStatusLabel(table)}</small>
                      <span>{tableSeats(table)}석</span>
                    </button>
                  );
                })
              ) : (
                <p className="empty-copy">예약 테이블 정보가 아직 설정되지 않았습니다.</p>
              )}
            </div>
          </>
        )}

        {penalty?.blocked && <p className="app-inline-note">현재 예약이 제한되어 있습니다.</p>}
        {reservationError && <p className="app-inline-note app-inline-note--danger">{reservationError}</p>}
      </section>

      <section ref={authRef} className="uni-card reservation-auth-card">
        <div className="uni-section-head">
          <h2>휴대폰 인증</h2>
          {isAuthComplete && <button type="button" onClick={handleClearAuth}>해제</button>}
        </div>
        {isAuthComplete ? (
          <p className="auth-complete-copy">인증된 번호: {phoneNumber || getReservationPhone()}</p>
        ) : (
          <div className="auth-form-grid">
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="01012345678"
            />
            <button type="button" onClick={handleSendCode} disabled={sendCooldownSeconds > 0}>
              {sendCooldownSeconds > 0 ? `${sendCooldownSeconds}s` : "번호 받기"}
            </button>
            <input
              value={verifyCode}
              onChange={(event) => setVerifyCode(event.target.value)}
              placeholder="인증번호"
            />
            <button type="button" onClick={handleVerifyCode}>인증 확인</button>
          </div>
        )}
      </section>

      {menuItems.length > 0 && (
        <section className="uni-card menu-preview-card">
          <div className="uni-section-head">
            <h2>메뉴판</h2>
            <span>{menuItems.length}개</span>
          </div>
          <div className="menu-item-list">
            {menuItems.map((item, index) => (
              <article key={`${item.name}-${index}`} className={item.soldOut ? "menu-item menu-item--soldout" : "menu-item"}>
                <strong>{item.name}</strong>
                <span>{item.price}</span>
                {item.description && <small>{item.description}</small>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="uni-card ops-login-card">
        <h2>부스 운영자</h2>
        <div className="auth-form-grid">
          <input
            value={opsKeyInput}
            onChange={(event) => setOpsKeyInput(event.target.value)}
            placeholder="운영 키"
          />
          <button type="button" onClick={handleOpsLogin}>운영 화면</button>
        </div>
      </section>
    </section>
  );
}
