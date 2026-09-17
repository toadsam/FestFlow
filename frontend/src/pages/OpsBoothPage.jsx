// 부스 운영 콘솔. 폰에서는 한 줄, 데스크톱에서는 왼쪽 사이드바 + 본문.
// 여섯 구역: 현황 · 주문 · 자리 · 메뉴판 · 예약 · 설정. 스타일은 styles/v2-ops.css.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  checkInOpsBoothReservation,
  checkInOpsBoothReservationByToken,
  completeOpsBoothReservation,
  createReservationStream,
  fetchOpsBoothBootstrap,
  releaseOpsBoothReservationTable,
  resolveApiAssetUrl,
  uploadOpsBoothMenuImage,
  uploadOpsBoothMenuItemImage,
  updateOpsBoothLiveStatus,
  updateOpsBoothReservationConfig,
} from "../api";
import OpsBoothOrders from "../components/OpsBoothOrders";
import { resolveBoothImageUrl } from "../config/boothImages";
import { FESTIVAL } from "../config/festival";
import { TableMap } from "../components/v2/TableMap";

const BOOTH_KEY_STORAGE_KEY = "festflow_ops_booth_key";
const BOOTH_CATEGORIES = ["주점", "음식", "체험", "이벤트", "굿즈", "안내", "응급", "포토존", "플리마켓", "기타"];
const BOOTH_DAY_PARTS = ["상시", "주간", "야간"];

// 이번 축제는 자리 예약을 안 받는다(config/festival.js). 예약 구역·예약 가능 좌석·예약 스위치를 숨긴다.
const RESERVATIONS_ON = FESTIVAL.reservations !== false;

const SECTIONS = [
  { id: "overview", label: "현황" },
  { id: "orders", label: "주문" },
  { id: "tables", label: "자리" },
  { id: "menu", label: "메뉴판" },
  { id: "reservations", label: "예약" },
  { id: "settings", label: "설정" },
].filter((section) => RESERVATIONS_ON || section.id !== "reservations");

/* ---------- 작은 아이콘 ---------- */
const svgProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const Icons = {
  overview: (p) => <svg {...svgProps} {...p}><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>,
  orders: (p) => <svg {...svgProps} {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>,
  tables: (p) => <svg {...svgProps} {...p}><rect x="3" y="7" width="18" height="6" rx="2" /><path d="M6 13v5M18 13v5" /></svg>,
  menu: (p) => <svg {...svgProps} {...p}><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h5" /></svg>,
  reservations: (p) => <svg {...svgProps} {...p}><path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 000-4z" /><path d="M12 5v14" strokeDasharray="2 3" /></svg>,
  settings: (p) => <svg {...svgProps} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>,
  arrow: (p) => <svg {...svgProps} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  plus: (p) => <svg {...svgProps} {...p}><path d="M12 5v14M5 12h14" /></svg>,
  camera: (p) => <svg {...svgProps} {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  logout: (p) => <svg {...svgProps} {...p}><path d="M10 4H5v16h5M14 8l5 4-5 4M19 12H9" /></svg>,
  print: (p) => <svg {...svgProps} {...p}><path d="M7 8V3h10v5M7 17H4v-6h16v6h-3" /><path d="M7 14h10v7H7z" /></svg>,
};

/* ---------- 헬퍼 ---------- */
function confirmAction(message) {
  return window.confirm(message);
}

function clampNumber(value, min, fallback = min) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, parsed);
}

function formatTime(value) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(5, 16);
}

function reservationStatusLabel(status) {
  switch (status) {
    case "CHECKED_IN":
      return "이용중";
    case "EXPIRED":
      return "만료";
    case "COMPLETED":
      return "완료";
    case "CANCELLED":
      return "취소";
    default:
      return "예약중";
  }
}

function tableOccupancyStatus(table) {
  if (table?.occupancyStatus) return table.occupancyStatus;
  return Number(table?.availableSeats) > 0 ? "AVAILABLE" : "FULL";
}

function tableOccupancyLabel(table) {
  if (table?.occupancyLabel) return table.occupancyLabel;
  switch (tableOccupancyStatus(table)) {
    case "IN_USE":
      return "이용중";
    case "RESERVED":
      return "예약중";
    case "FULL":
      return "마감";
    default:
      return "빈 자리";
  }
}

function statusTone(status) {
  switch (status) {
    case "IN_USE":
    case "CHECKED_IN":
      return "violet";
    case "RESERVED":
      return "yellow";
    case "FULL":
    case "EXPIRED":
      return "red";
    case "COMPLETED":
    case "CANCELLED":
      return "";
    default:
      return "green";
  }
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
        imageUrl: String(item?.imageUrl || "").trim(),
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

function friendlyError(e, fallback) {
  return e?.message === "Failed to fetch" ? fallback : e?.message || fallback;
}

/* ---------- 토스트 ---------- */
function useOpsToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(0);
  const notify = useCallback((text, tone = "default") => {
    if (!text) return;
    window.clearTimeout(timerRef.current);
    setToast({ text, tone, key: Date.now() });
    timerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const node = toast ? (
    <div key={toast.key} className={`ops-toast ops-toast--${toast.tone}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  ) : null;
  return [notify, node];
}

/* ---------- 조각 ---------- */
function Card({ title, desc, actions, children }) {
  return (
    <article className="ops-card">
      {(title || actions) && (
        <div className="ops-card__head">
          <div>
            {title && <h2>{title}</h2>}
            {desc && <p>{desc}</p>}
          </div>
          {actions && <div className="ops-card__actions">{actions}</div>}
        </div>
      )}
      {children}
    </article>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="ops-field">
      {label && <span>{label}</span>}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Switch({ checked, onChange, title, desc }) {
  return (
    <label className="ops-switch">
      <span className="ops-switch__text">
        <strong>{title}</strong>
        {desc && <small>{desc}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ops-switch__knob" />
    </label>
  );
}

function Stepper({ label, value, onStep }) {
  return (
    <div className="ops-stepper">
      <button type="button" onClick={() => onStep(-1)} aria-label={`${label} 줄이기`}>−</button>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
      <button type="button" onClick={() => onStep(1)} aria-label={`${label} 늘리기`}>+</button>
    </div>
  );
}

function KeyGate({ value, onChange, onSubmit }) {
  return (
    <div className="ops-gate">
      <form className="ops-gate__card" onSubmit={onSubmit}>
        <img src="/images/chito-wave.png" alt="" onError={(e) => { e.currentTarget.src = "/images/chito.png"; }} />
        <h1>부스 운영 콘솔</h1>
        <p>운영진에게 받은 부스 키를 넣어 주세요. 이 브라우저를 닫기 전까지 기억해요.</p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="부스 키"
          autoComplete="off"
          autoFocus
        />
        <button type="submit" className="ops-btn ops-btn--primary ops-btn--block" disabled={!value.trim()}>
          들어가기
        </button>
      </form>
    </div>
  );
}

/* ---------- 페이지 ---------- */
export default function OpsBoothPage() {
  const { id } = useParams();
  const initialKey = sessionStorage.getItem(BOOTH_KEY_STORAGE_KEY) || "";
  const [notify, toastNode] = useOpsToast();

  const [keyInput, setKeyInput] = useState(initialKey);
  const [key, setKey] = useState(initialKey);
  const [loading, setLoading] = useState(Boolean(initialKey));
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [reservationAlert, setReservationAlert] = useState("");
  const [orderCounts, setOrderCounts] = useState({ pending: 0, cooking: 0 });
  const [active, setActive] = useState("overview");
  const [saving, setSaving] = useState("");

  const [draft, setDraft] = useState({
    estimatedWaitMinutes: "",
    remainingStock: "",
    liveStatusMessage: "",
    boothIntro: "",
    menuImageUrl: "",
    category: "주점",
    dayPart: "야간",
    openTime: "",
    closeTime: "",
    tags: "",
    contentJson: "",
    reservationEnabled: true,
  });
  const [menuItems, setMenuItems] = useState([]);
  const [reservationDraft, setReservationDraft] = useState({ maxReservationMinutes: 10, tables: [] });
  const [snapshot, setSnapshot] = useState({ info: "", tables: "" });

  const [qrTokenInput, setQrTokenInput] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  const infoDirty = useMemo(() => JSON.stringify({ draft, menuItems }) !== snapshot.info, [draft, menuItems, snapshot.info]);
  const tablesDirty = useMemo(() => JSON.stringify(reservationDraft) !== snapshot.tables, [reservationDraft, snapshot.tables]);

  async function load() {
    if (!id || !key) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const next = await fetchOpsBoothBootstrap(id, key);
      setData(next);
      const nextDraft = {
        estimatedWaitMinutes: next.booth.estimatedWaitMinutes ?? "",
        remainingStock: next.booth.remainingStock ?? "",
        liveStatusMessage: next.booth.liveStatusMessage ?? "",
        boothIntro: next.booth.boothIntro ?? "",
        menuImageUrl: next.booth.menuImageUrl ?? "",
        category: next.booth.category ?? "주점",
        dayPart: next.booth.dayPart ?? "야간",
        openTime: next.booth.openTime ?? "",
        closeTime: next.booth.closeTime ?? "",
        tags: next.booth.tags ?? "",
        contentJson: next.booth.contentJson ?? "",
        reservationEnabled: next.booth.reservationEnabled ?? true,
      };
      const nextMenu = parseMenuBoardJson(next.booth.menuBoardJson);
      const nextReservation = {
        maxReservationMinutes: next.reservations?.maxReservationMinutes ?? 10,
        tables: (next.reservations?.tables ?? []).map((table) => ({
          id: table.id,
          tableName: table.tableName,
          totalSeats: table.totalSeats,
          availableSeats: table.availableSeats,
          reservableSeats: table.reservableSeats,
          occupancyStatus: table.occupancyStatus,
          occupancyLabel: table.occupancyLabel,
          activeReservationId: table.activeReservationId,
        })),
      };
      setDraft(nextDraft);
      setMenuItems(nextMenu);
      setReservationDraft(nextReservation);
      setSnapshot({
        info: JSON.stringify({ draft: nextDraft, menuItems: nextMenu }),
        tables: JSON.stringify(nextReservation),
      });
      setError("");
    } catch (e) {
      setData(null);
      setError(friendlyError(e, "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  // 예약 스트림: 새 예약이 오면 띠를 띄우고 다시 읽는다.
  useEffect(() => {
    if (!id || !key) return undefined;
    const stream = createReservationStream();
    let alertTimer = null;
    stream.addEventListener("reservations", (event) => {
      try {
        const reservation = JSON.parse(event.data);
        if (String(reservation.boothId) !== String(id)) return;
        if (reservation.status === "RESERVED") {
          setReservationAlert(`새 예약 · ${reservation.tableName} · ${reservation.seatCount}명`);
          if (alertTimer) window.clearTimeout(alertTimer);
          alertTimer = window.setTimeout(() => setReservationAlert(""), 6000);
        }
        load();
      } catch {
        // ignore stream parse errors
      }
    });
    return () => {
      if (alertTimer) window.clearTimeout(alertTimer);
      stream.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  useEffect(() => {
    setScannerSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스크롤 위치에 따라 왼쪽 메뉴의 현재 구역을 맞춘다.
  useEffect(() => {
    if (!data || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    SECTIONS.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [data]);

  function jump(sectionId) {
    setActive(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ----- 저장 ----- */
  async function handleSaveLiveStatus() {
    setSaving("info");
    try {
      await updateOpsBoothLiveStatus(
        id,
        {
          estimatedWaitMinutes: draft.estimatedWaitMinutes === "" ? null : Number(draft.estimatedWaitMinutes),
          remainingStock: draft.remainingStock === "" ? null : Number(draft.remainingStock),
          liveStatusMessage: draft.liveStatusMessage || null,
          boothIntro: draft.boothIntro || null,
          menuImageUrl: draft.menuImageUrl || null,
          menuBoardJson: JSON.stringify(menuItems),
          category: draft.category || null,
          dayPart: draft.dayPart || null,
          openTime: draft.openTime || null,
          closeTime: draft.closeTime || null,
          tags: draft.tags || null,
          contentJson: draft.contentJson || null,
          reservationEnabled: draft.reservationEnabled,
        },
        key,
      );
      notify("저장했어요. 손님 화면에 바로 반영돼요.", "success");
      await load();
    } catch (e) {
      notify(friendlyError(e, "저장하지 못했어요. 다시 시도해 주세요."), "error");
    } finally {
      setSaving("");
    }
  }

  async function handleSaveReservationConfig() {
    setSaving("tables");
    try {
      await updateOpsBoothReservationConfig(
        id,
        {
          maxReservationMinutes: clampNumber(reservationDraft.maxReservationMinutes, 1, 10),
          tables: reservationDraft.tables.map((table) => {
            const totalSeats = clampNumber(table.totalSeats, 1, 1);
            const availableSeats = Math.min(totalSeats, Math.max(0, Number(table.availableSeats) || 0));
            return { id: table.id ?? null, tableName: table.tableName, totalSeats, availableSeats };
          }),
        },
        key,
      );
      notify("테이블 설정을 저장했어요.", "success");
      await load();
    } catch (e) {
      notify(friendlyError(e, "테이블 설정을 저장하지 못했어요."), "error");
    } finally {
      setSaving("");
    }
  }

  function discardChanges() {
    if (!snapshot.info) return;
    const info = JSON.parse(snapshot.info);
    setDraft(info.draft);
    setMenuItems(info.menuItems);
    setReservationDraft(JSON.parse(snapshot.tables));
    notify("변경을 되돌렸어요.");
  }

  /* ----- 사진 ----- */
  async function handleUploadMenuImage(file) {
    if (!file) return;
    try {
      const updatedBooth = await uploadOpsBoothMenuImage(id, file, key);
      setDraft((prev) => ({ ...prev, menuImageUrl: updatedBooth.menuImageUrl || "" }));
      notify("대표 사진을 올렸어요.", "success");
      await load();
    } catch (e) {
      notify(friendlyError(e, "사진을 올리지 못했어요."), "error");
    }
  }

  async function handleMenuItemImage(index, file) {
    if (!file) return;
    try {
      const result = await uploadOpsBoothMenuItemImage(id, file, key);
      updateMenuItem(index, { imageUrl: result?.imageUrl || "" });
      notify("사진을 올렸어요. 저장을 눌러야 손님에게 보여요.");
    } catch (e) {
      notify(friendlyError(e, "메뉴 사진을 올리지 못했어요."), "error");
    }
  }

  /* ----- 메뉴판 ----- */
  function addMenuItem() {
    setMenuItems((prev) => [...prev, { name: "", price: "", description: "", soldOut: false, imageUrl: "" }]);
  }

  function updateMenuItem(index, patch) {
    setMenuItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function removeMenuItem(index) {
    setMenuItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  /* ----- 예약 ----- */
  async function handleCheckIn(reservationId) {
    try {
      await checkInOpsBoothReservation(id, reservationId, key);
      notify("체크인했어요.", "success");
      await load();
    } catch (e) {
      notify(friendlyError(e, "체크인하지 못했어요."), "error");
    }
  }

  async function handleCompleteReservation(reservationId) {
    if (!confirmAction("이용을 끝내고 테이블을 비울까요?")) return;
    try {
      await completeOpsBoothReservation(id, reservationId, key);
      notify("테이블을 비웠어요.", "success");
      await load();
    } catch (e) {
      notify(friendlyError(e, "테이블을 비우지 못했어요."), "error");
    }
  }

  async function handleReleaseTable(table, message = `${table?.tableName}을(를) 빈 자리로 돌릴까요?`) {
    if (!table?.id) return;
    if (!confirmAction(message)) return;
    try {
      await releaseOpsBoothReservationTable(id, table.id, key);
      notify(`${table.tableName}을(를) 빈 자리로 돌렸어요.`, "success");
      await load();
    } catch (e) {
      notify(friendlyError(e, "처리하지 못했어요."), "error");
    }
  }

  async function handleCheckInByToken() {
    const token = qrTokenInput.trim();
    if (!token) {
      notify("QR 토큰을 넣어 주세요.", "error");
      return;
    }
    try {
      await checkInOpsBoothReservationByToken(id, token, key);
      notify("QR 체크인했어요.", "success");
      setQrTokenInput("");
      await load();
    } catch (e) {
      notify(friendlyError(e, "QR 체크인하지 못했어요."), "error");
    }
  }

  function stopScanner() {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScannerActive(false);
    setScannerMessage("");
  }

  async function startScanner() {
    setScannerActive(true);
    setScannerMessage("카메라를 여는 중이에요…");
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("이 브라우저는 카메라를 쓸 수 없어요. 아래에 토큰을 직접 넣어 주세요.");
      setScannerActive(false);
      setScannerMessage("");
      return;
    }
    if (!scannerSupported) {
      setCameraError("이 브라우저는 QR 자동 인식이 안 돼요. 아래에 토큰을 직접 넣어 주세요.");
      setScannerActive(false);
      setScannerMessage("");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      setScannerMessage("QR을 화면 가운데에 맞춰 주세요.");
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (!results.length) return;
          const rawValue = results[0].rawValue?.trim();
          if (!rawValue) return;
          setQrTokenInput(rawValue);
          await checkInOpsBoothReservationByToken(id, rawValue, key);
          notify("QR 체크인했어요.", "success");
          await load();
          stopScanner();
        } catch {
          // ignore intermittent detector errors
        }
      }, 700);
    } catch {
      setCameraError("카메라를 열 수 없어요. 권한을 확인해 주세요.");
      stopScanner();
    }
  }

  /* ----- 테이블 편집 ----- */
  function updateTableDraft(index, patch) {
    setReservationDraft((prev) => {
      const tables = [...prev.tables];
      const target = { ...tables[index], ...patch };
      const total = Math.max(1, Number(target.totalSeats) || 1);
      const available = Math.max(0, Math.min(total, Number(target.availableSeats) || 0));
      tables[index] = { ...target, totalSeats: total, availableSeats: available };
      return { ...prev, tables };
    });
  }

  function stepTable(index, field, delta) {
    setReservationDraft((prev) => {
      const tables = [...prev.tables];
      const table = { ...tables[index] };
      if (field === "totalSeats") {
        const nextTotal = Math.max(1, (Number(table.totalSeats) || 1) + delta);
        table.totalSeats = nextTotal;
        table.availableSeats = Math.min(nextTotal, Math.max(0, Number(table.availableSeats) || 0));
      }
      if (field === "availableSeats") {
        const max = Math.max(1, Number(table.totalSeats) || 1);
        table.availableSeats = Math.max(0, Math.min(max, (Number(table.availableSeats) || 0) + delta));
      }
      tables[index] = table;
      return { ...prev, tables };
    });
  }

  function addTableDraft(template = 4) {
    setReservationDraft((prev) => {
      const sameSize = prev.tables.filter((table) => Number(table.totalSeats) === template).length + 1;
      return {
        ...prev,
        tables: [...prev.tables, { id: null, tableName: `${template}인 ${sameSize}`, totalSeats: template, availableSeats: template }],
      };
    });
  }

  function removeTableDraft(index) {
    setReservationDraft((prev) => ({ ...prev, tables: prev.tables.filter((_, idx) => idx !== index) }));
  }

  /* ----- 키 ----- */
  function submitKey(e) {
    e.preventDefault();
    const next = keyInput.trim();
    if (!next) return;
    sessionStorage.setItem(BOOTH_KEY_STORAGE_KEY, next);
    setKey(next);
    setLoading(true);
    setError("");
  }

  function clearKey() {
    sessionStorage.removeItem(BOOTH_KEY_STORAGE_KEY);
    setKeyInput("");
    setKey("");
    setData(null);
    setError("");
    setLoading(false);
    stopScanner();
  }

  /* ----- 파생값 ----- */
  const activeReservations = useMemo(() => data?.reservations?.activeReservations ?? [], [data]);
  // 그림용은 서버가 준 그대로(편집 중인 초안 말고).
  const serverTables = useMemo(() => data?.reservations?.tables ?? [], [data]);

  const tableSummary = useMemo(() => {
    const tables = reservationDraft.tables || [];
    const totalTables = tables.length;
    const reservedTables = tables.filter((table) => tableOccupancyStatus(table) === "RESERVED").length;
    const inUseTables = tables.filter((table) => tableOccupancyStatus(table) === "IN_USE").length;
    const freeTables = tables.filter((table) => tableOccupancyStatus(table) === "AVAILABLE").length;
    const totalSeats = tables.reduce((acc, table) => acc + (Number(table.totalSeats) || 0), 0);
    return { totalTables, reservedTables, inUseTables, freeTables, totalSeats };
  }, [reservationDraft.tables]);

  const handleOrderSummary = useCallback((counts) => setOrderCounts(counts), []);

  const badgeFor = (sectionId) => {
    if (sectionId === "orders") return orderCounts.pending;
    if (sectionId === "reservations") return activeReservations.filter((r) => r.status !== "CHECKED_IN").length;
    return 0;
  };

  const openNow = (() => {
    if (!data?.booth?.openTime || !data?.booth?.closeTime) return null;
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const open = String(data.booth.openTime).slice(0, 5);
    const close = String(data.booth.closeTime).slice(0, 5);
    return open <= close ? hm >= open && hm < close : hm >= open || hm < close;
  })();

  /* ----- 렌더 ----- */
  if (!key) {
    return (
      <>
        <KeyGate value={keyInput} onChange={setKeyInput} onSubmit={submitKey} />
        {toastNode}
      </>
    );
  }

  const nav = (compact) =>
    SECTIONS.map((section) => {
      const Icon = Icons[section.id];
      const count = badgeFor(section.id);
      const cls = compact
        ? `ops__tab${active === section.id ? " ops__tab--active" : ""}`
        : `ops__nav-item${active === section.id ? " ops__nav-item--active" : ""}`;
      return (
        <button key={section.id} type="button" className={cls} onClick={() => jump(section.id)}>
          {!compact && <Icon />}
          {section.label}
          {count > 0 && <span className="ops-count">{count}</span>}
        </button>
      );
    });

  return (
    <div className="ops">
      <aside className="ops__side">
        <div className="ops__brand">
          <img src="/images/chito.png" alt="" />
          <div>
            <strong>부스 운영 콘솔</strong>
            <small>2026 가을축제 바람</small>
          </div>
        </div>
        <div className="ops__booth">
          <small>{data?.booth?.category || "부스"} · {openNow == null ? "운영 시간 미설정" : openNow ? "운영 중" : "운영 시간 아님"}</small>
          <strong>{data?.booth?.name || `부스 ${id}`}</strong>
        </div>
        <nav className="ops__nav">{nav(false)}</nav>
        <div className="ops__side-links">
          <Link to={`/ops/booth/${id}/tables`} className="ops-btn ops-btn--dark ops-btn--sm">
            <Icons.tables /> 자리 현황판 열기
          </Link>
          <Link to={`/ops/booth/${id}/table-qr`} className="ops-btn ops-btn--ghost ops-btn--sm">
            <Icons.print /> 주문 QR 인쇄
          </Link>
          <button type="button" className="ops-btn ops-btn--text" onClick={clearKey}>
            <Icons.logout /> 키 지우고 나가기
          </button>
        </div>
      </aside>

      <div className="ops__main">
        <header className="ops__top">
          <div className="ops__top-row">
            <div className="ops__top-title">
              <small>부스 운영 콘솔</small>
              <strong>{data?.booth?.name || `부스 ${id}`}</strong>
            </div>
            <div className="ops-row">
              <Link to={`/ops/booth/${id}/tables`} className="ops-btn ops-btn--dark ops-btn--sm">현황판</Link>
              <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" onClick={clearKey} aria-label="키 지우고 나가기">
                <Icons.logout />
              </button>
            </div>
          </div>
          <div className="ops__tabs">{nav(true)}</div>
        </header>

        {loading && !data && (
          <>
            <div className="ops-skeleton" style={{ height: 120 }} />
            <div className="ops-skeleton" style={{ height: 220 }} />
            <div className="ops-skeleton" style={{ height: 220 }} />
          </>
        )}

        {error && !data && (
          <Card title="연결이 안 돼요" desc={error}>
            <div className="ops-row ops-row--wrap">
              <button type="button" className="ops-btn ops-btn--primary" onClick={() => { setLoading(true); load(); }}>다시 시도</button>
              <button type="button" className="ops-btn ops-btn--ghost" onClick={clearKey}>다른 키로 들어가기</button>
            </div>
          </Card>
        )}

        {data && (
          <>
            {/* ===== 현황 ===== */}
            <section id="overview" className="ops-section">
              {reservationAlert && <div className="ops-banner ops-banner--green">{reservationAlert}</div>}
              <Card
                title="지금 현황"
                desc={`${data.booth.category || "부스"} · ${data.booth.openTime ? `${String(data.booth.openTime).slice(0, 5)}–${String(data.booth.closeTime || "").slice(0, 5)}` : "운영 시간 미설정"}`}
                actions={
                  <span className={`ops-chip ops-chip--dot ${openNow ? "ops-chip--green" : openNow == null ? "" : "ops-chip--red"}`}>
                    {openNow == null ? "시간 미설정" : openNow ? "운영 중" : "운영 시간 아님"}
                  </span>
                }
              >
                <div className={`ops-kpis${RESERVATIONS_ON ? "" : " ops-kpis--3"}`}>
                  <button type="button" className="ops-kpi ops-kpi--green" onClick={() => jump("tables")} style={{ textAlign: "left" }}>
                    <small>빈 테이블</small>
                    <strong>{tableSummary.freeTables}<em>/ {tableSummary.totalTables}</em></strong>
                    <span>이용중 {tableSummary.inUseTables}{RESERVATIONS_ON ? ` · 예약중 ${tableSummary.reservedTables}` : ""}</span>
                  </button>
                  <button type="button" className="ops-kpi ops-kpi--blue" onClick={() => jump("orders")} style={{ textAlign: "left" }}>
                    <small>입금 대기 주문</small>
                    <strong>{orderCounts.pending}<em>건</em></strong>
                    <span>조리 중 {orderCounts.cooking}건</span>
                  </button>
                  {RESERVATIONS_ON && (
                    <button type="button" className="ops-kpi ops-kpi--yellow" onClick={() => jump("reservations")} style={{ textAlign: "left" }}>
                      <small>활성 예약</small>
                      <strong>{activeReservations.length}<em>건</em></strong>
                      <span>체크인 전 {activeReservations.filter((r) => r.status !== "CHECKED_IN").length}건</span>
                    </button>
                  )}
                  <div className="ops-kpi ops-kpi--violet">
                    <small>메뉴</small>
                    <strong>{menuItems.length}<em>개</em></strong>
                    <span>품절 {menuItems.filter((item) => item.soldOut).length}개</span>
                  </div>
                </div>
              </Card>

              <Card
                title="자리 한눈에"
                desc="초록이 빈 테이블, 회색이 이용 중. 입구 스태프가 현황판을 누르면 여기와 손님 화면이 같이 바뀌어요."
                actions={
                  <Link to={`/ops/booth/${id}/tables`} className="ops-btn ops-btn--dark ops-btn--sm">현황판 열기</Link>
                }
              >
                {serverTables.length ? (
                  <TableMap tables={serverTables} />
                ) : (
                  <div className="ops-empty">아직 테이블이 없어요. 아래 자리 구역에서 만들어 주세요.</div>
                )}
              </Card>

              <Card title="손님에게 보이는 한 줄" desc="주점 카드 위에 바로 뜨는 안내예요. 재료 소진, 마지막 주문 같은 걸 적어요.">
                <div className="ops-grid-2">
                  <Field label="운영 메모">
                    <input
                      value={draft.liveStatusMessage}
                      onChange={(e) => setDraft((prev) => ({ ...prev, liveStatusMessage: e.target.value }))}
                      placeholder="예) 오뎅탕 10분 뒤 재입고"
                    />
                  </Field>
                  <div className="ops-grid-2">
                    <Field label="대기 시간(분)">
                      <input inputMode="numeric" value={draft.estimatedWaitMinutes} onChange={(e) => setDraft((prev) => ({ ...prev, estimatedWaitMinutes: e.target.value }))} placeholder="0" />
                    </Field>
                    <Field label="남은 재고">
                      <input inputMode="numeric" value={draft.remainingStock} onChange={(e) => setDraft((prev) => ({ ...prev, remainingStock: e.target.value }))} placeholder="비우면 표시 안 함" />
                    </Field>
                  </div>
                </div>
              </Card>
            </section>

            {/* ===== 주문 ===== */}
            <section id="orders" className="ops-section">
              <OpsBoothOrders boothId={id} opsKey={key} notify={notify} onSummary={handleOrderSummary} />
            </section>

            {/* ===== 자리 ===== */}
            <section id="tables" className="ops-section">
              <Card
                title="자리"
                desc="입구 스태프는 현황판에서 한 번 눌러 이용 중/빈 자리를 바꿔요. 여기서는 테이블 이름과 좌석 수만 고쳐요."
                actions={
                  <div className="ops-seg">
                    {[2, 4, 6, 8].map((n) => (
                      <button key={n} type="button" onClick={() => addTableDraft(n)}>+{n}인</button>
                    ))}
                  </div>
                }
              >
                <Link to={`/ops/booth/${id}/tables`} className="ops-board-link">
                  <span>
                    <strong>자리 현황판 열기</strong>
                    <small>입구 스태프용 · 큰 버튼 · 한 번 누르면 바뀜</small>
                  </span>
                  <Icons.arrow />
                </Link>

                {reservationDraft.tables.length ? (
                  <div className="ops-tables">
                    {reservationDraft.tables.map((table, index) => {
                      const status = tableOccupancyStatus(table);
                      const blocked = status === "RESERVED" || status === "IN_USE";
                      return (
                        <div
                          key={`${table.id ?? "new"}-${index}`}
                          className={`ops-table${status === "IN_USE" ? " ops-table--inuse" : status === "RESERVED" ? " ops-table--busy" : ""}`}
                        >
                          <div className="ops-table__head">
                            <input value={table.tableName} onChange={(e) => updateTableDraft(index, { tableName: e.target.value })} placeholder="테이블 이름" />
                            <span className={`ops-chip ops-chip--dot ops-chip--${statusTone(status)}`}>{tableOccupancyLabel(table)}</span>
                          </div>
                          <div className="ops-table__seats" style={RESERVATIONS_ON ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
                            <Stepper label="좌석 수" value={table.totalSeats} onStep={(d) => stepTable(index, "totalSeats", d)} />
                            {RESERVATIONS_ON && (
                              <Stepper label="예약 가능" value={table.availableSeats} onStep={(d) => stepTable(index, "availableSeats", d)} />
                            )}
                          </div>
                          <div className="ops-table__foot">
                            <span className="ops-sub">
                              {table.activeReservationId ? `예약 #${table.activeReservationId}` : table.id ? `테이블 #${table.id}` : "저장하면 만들어져요"}
                            </span>
                            <div className="ops-row">
                              {blocked && (
                                <button type="button" className="ops-btn ops-btn--soft ops-btn--sm" onClick={() => handleReleaseTable(table)}>
                                  빈 자리로
                                </button>
                              )}
                              <button type="button" className="ops-btn ops-btn--danger ops-btn--sm" disabled={blocked} onClick={() => removeTableDraft(index)}>
                                {blocked ? "사용 중" : "삭제"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ops-empty">아직 테이블이 없어요. 오른쪽 위 +4인 같은 버튼으로 추가해 주세요.</div>
                )}

                {RESERVATIONS_ON && (
                  <>
                    <div className="ops-divider" />
                    <div className="ops-grid-2">
                      <Field label="예약 자리 유지 시간(분)" hint="예약 후 이 시간 안에 안 오면 자동으로 풀려요.">
                        <input
                          type="number"
                          min="1"
                          value={reservationDraft.maxReservationMinutes}
                          onChange={(e) => setReservationDraft((prev) => ({ ...prev, maxReservationMinutes: e.target.value }))}
                        />
                      </Field>
                    </div>
                  </>
                )}
              </Card>
            </section>

            {/* ===== 메뉴판 ===== */}
            <section id="menu" className="ops-section">
              <Card
                title="메뉴판"
                desc="손님 주문 화면에 이 순서대로 보여요. 가격은 숫자만 적어도 돼요."
                actions={
                  <button type="button" className="ops-btn ops-btn--soft ops-btn--sm" onClick={addMenuItem}>
                    <Icons.plus /> 메뉴 추가
                  </button>
                }
              >
                {menuItems.length ? (
                  <div className="ops-dishes">
                    {menuItems.map((item, index) => (
                      <div key={`menu-item-${index}`} className={`ops-dish${item.soldOut ? " ops-dish--soldout" : ""}`}>
                        <label className="ops-dish__photo" title="사진 올리기">
                          {item.imageUrl ? <img src={resolveApiAssetUrl(item.imageUrl)} alt="" /> : <span>사진<br />올리기</span>}
                          <input type="file" accept="image/*" onChange={(e) => handleMenuItemImage(index, e.target.files?.[0] || null)} />
                        </label>
                        <div className="ops-dish__body">
                          <div className="ops-dish__row">
                            <input value={item.name} onChange={(e) => updateMenuItem(index, { name: e.target.value })} placeholder="메뉴 이름" />
                            <input value={item.price} onChange={(e) => updateMenuItem(index, { price: e.target.value })} placeholder="가격 (예: 12000)" inputMode="numeric" />
                          </div>
                          <input value={item.description} onChange={(e) => updateMenuItem(index, { description: e.target.value })} placeholder="설명 · 재료 (예: 삼겹살 400g · 볶음김치)" />
                          <div className="ops-dish__foot">
                            <label>
                              <input type="checkbox" checked={item.soldOut} onChange={(e) => updateMenuItem(index, { soldOut: e.target.checked })} />
                              품절
                            </label>
                            <div className="ops-row">
                              {item.imageUrl && (
                                <button type="button" className="ops-btn ops-btn--text" onClick={() => updateMenuItem(index, { imageUrl: "" })}>사진 지우기</button>
                              )}
                              <button type="button" className="ops-btn ops-btn--danger ops-btn--sm" onClick={() => removeMenuItem(index)}>삭제</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ops-empty">아직 메뉴가 없어요. 메뉴 추가로 시작해 주세요.</div>
                )}
              </Card>

              <Card title="대표 사진" desc="주점 카드와 주문 화면 맨 위에 크게 보여요.">
                <label className="ops-hero-photo" style={{ cursor: "pointer" }}>
                  {draft.menuImageUrl ? (
                    <img src={resolveApiAssetUrl(draft.menuImageUrl)} alt="대표 사진" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <span>사진을 골라 주세요</span>
                  )}
                  <input type="file" accept="image/*" style={{ position: "absolute", inset: 0, opacity: 0, minHeight: 0, cursor: "pointer" }} onChange={(e) => handleUploadMenuImage(e.target.files?.[0] || null)} />
                </label>
                <p className="ops-sub">지금 손님 화면 대표 이미지: <span style={{ wordBreak: "break-all" }}>{resolveBoothImageUrl(data.booth)}</span></p>
              </Card>
            </section>

            {/* ===== 예약 ===== */}
            {RESERVATIONS_ON && (
            <section id="reservations" className="ops-section">
              <Card
                title="예약"
                desc="손님이 앱에서 잡은 자리 예약이에요. 오면 체크인, 다 먹고 가면 테이블 비우기."
                actions={<span className="ops-chip">{activeReservations.length}건</span>}
              >
                {activeReservations.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {activeReservations.map((reservation) => {
                      const checkedIn = reservation.status === "CHECKED_IN";
                      return (
                        <div key={reservation.id} className="ops-resv">
                          <div className="ops-resv__main">
                            <div className="ops-resv__title">
                              <strong>{reservation.tableName}</strong>
                              <span className={`ops-chip ops-chip--dot ops-chip--${statusTone(reservation.status)}`}>{reservationStatusLabel(reservation.status)}</span>
                            </div>
                            <span className="ops-resv__meta">
                              #{reservation.id} · {reservation.seatCount}명 · {reservation.userKey}
                            </span>
                            <span className="ops-resv__meta">
                              {checkedIn ? `체크인 ${formatTime(reservation.checkedInAt)}` : `만료 ${formatTime(reservation.expiresAt)}`}
                            </span>
                          </div>
                          <div className="ops-resv__actions">
                            {checkedIn ? (
                              <button type="button" className="ops-btn ops-btn--dark ops-btn--sm" onClick={() => handleCompleteReservation(reservation.id)}>테이블 비우기</button>
                            ) : (
                              <>
                                <button type="button" className="ops-btn ops-btn--primary ops-btn--sm" onClick={() => handleCheckIn(reservation.id)}>체크인</button>
                                <button
                                  type="button"
                                  className="ops-btn ops-btn--danger ops-btn--sm"
                                  onClick={() => handleReleaseTable({ id: reservation.tableId, tableName: reservation.tableName }, "이 예약을 취소하고 자리를 비울까요?")}
                                >
                                  예약 취소
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ops-empty">지금 활성 예약이 없어요.</div>
                )}
              </Card>

              <Card
                title="QR 체크인"
                desc="손님 예약 QR을 카메라로 찍거나, QR 아래 토큰을 직접 넣어요."
                actions={
                  scannerActive ? (
                    <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" onClick={stopScanner}>스캔 중지</button>
                  ) : (
                    <button type="button" className="ops-btn ops-btn--soft ops-btn--sm" onClick={startScanner}><Icons.camera /> 카메라 스캔</button>
                  )
                }
              >
                {scannerActive && (
                  <div className="ops-scan">
                    <video ref={videoRef} muted playsInline />
                    {scannerMessage && <p className="ops-sub" style={{ marginTop: 8 }}>{scannerMessage}</p>}
                  </div>
                )}
                {cameraError && <div className="ops-banner ops-banner--red">{cameraError}</div>}
                <div className="ops-row">
                  <input value={qrTokenInput} onChange={(e) => setQrTokenInput(e.target.value)} placeholder="QR 토큰 직접 입력" />
                  <button type="button" className="ops-btn ops-btn--primary" onClick={handleCheckInByToken}>체크인</button>
                </div>
              </Card>
            </section>
            )}

            {/* ===== 설정 ===== */}
            <section id="settings" className="ops-section">
              <Card title="부스 정보" desc="손님 화면의 분류, 운영 시간, 소개에 쓰여요.">
                <div className="ops-grid-2">
                  <Field label="분류">
                    <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>
                      {BOOTH_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </Field>
                  <Field label="운영 시간대">
                    <select value={draft.dayPart} onChange={(e) => setDraft((prev) => ({ ...prev, dayPart: e.target.value }))}>
                      {BOOTH_DAY_PARTS.map((part) => <option key={part} value={part}>{part}</option>)}
                    </select>
                  </Field>
                  <Field label="여는 시간">
                    <input type="time" value={draft.openTime} onChange={(e) => setDraft((prev) => ({ ...prev, openTime: e.target.value }))} />
                  </Field>
                  <Field label="닫는 시간">
                    <input type="time" value={draft.closeTime} onChange={(e) => setDraft((prev) => ({ ...prev, closeTime: e.target.value }))} />
                  </Field>
                </div>
                <Field label="소개" hint="주점 카드에 두 줄 정도로 보여요.">
                  <textarea value={draft.boothIntro} onChange={(e) => setDraft((prev) => ({ ...prev, boothIntro: e.target.value }))} placeholder="예) 바람 축제 공식 주점. 테이블 QR로 자리에서 바로 주문할 수 있어요." />
                </Field>
                <div className="ops-grid-2">
                  <Field label="태그" hint="쉼표로 구분">
                    <input value={draft.tags} onChange={(e) => setDraft((prev) => ({ ...prev, tags: e.target.value }))} placeholder="예) 주점, 총학, 노천극장" />
                  </Field>
                  <Field label="추가 정보" hint="부스 유형별 자유 메모">
                    <input value={draft.contentJson} onChange={(e) => setDraft((prev) => ({ ...prev, contentJson: e.target.value }))} placeholder="선택" />
                  </Field>
                </div>
                {RESERVATIONS_ON && (
                  <Switch
                    checked={draft.reservationEnabled}
                    onChange={(checked) => setDraft((prev) => ({ ...prev, reservationEnabled: checked }))}
                    title="자리 예약 받기"
                    desc="끄면 손님 화면에서 예약 버튼이 사라져요. 빈 자리 표시는 그대로 보여요."
                  />
                )}
              </Card>
            </section>
          </>
        )}
      </div>

      {(infoDirty || tablesDirty) && data && (
        <div className="ops-savebar" role="region" aria-label="저장하지 않은 변경">
          <strong>저장 안 한 변경이 있어요</strong>
          <div className="ops-row">
            <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" onClick={discardChanges} disabled={Boolean(saving)}>되돌리기</button>
            {tablesDirty && (
              <button type="button" className="ops-btn ops-btn--primary ops-btn--sm" onClick={handleSaveReservationConfig} disabled={Boolean(saving)}>
                {saving === "tables" ? "저장 중…" : "테이블 저장"}
              </button>
            )}
            {infoDirty && (
              <button type="button" className="ops-btn ops-btn--primary ops-btn--sm" onClick={handleSaveLiveStatus} disabled={Boolean(saving)}>
                {saving === "info" ? "저장 중…" : tablesDirty ? "정보 저장" : "저장"}
              </button>
            )}
          </div>
        </div>
      )}

      {toastNode}
    </div>
  );
}
