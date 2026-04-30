import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  checkInOpsBoothReservation,
  checkInOpsBoothReservationByToken,
  fetchOpsBoothBootstrap,
  uploadOpsBoothMenuImage,
  updateOpsBoothLiveStatus,
  updateOpsBoothReservationConfig,
} from "../api";
import CongestionBadge from "../components/CongestionBadge";
import {
  IconCalendar,
  IconClipboard,
  IconMapPin,
  IconSettings,
  IconShield,
  IconUsers,
} from "../components/UxIcons";
import { resolveBoothImageUrl } from "../config/boothImages";

const BOOTH_KEY_STORAGE_KEY = "festflow_ops_booth_key";
const BOOTH_CATEGORIES = ["주점", "음식", "체험", "이벤트", "굿즈", "안내", "응급", "포토존", "플리마켓", "기타"];
const BOOTH_DAY_PARTS = ["상시", "주간", "야간"];

function confirmAction(message) {
  return window.confirm(`실행할까요?\n\n${message}`);
}

function clampNumber(value, min, fallback = min) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, parsed);
}

function formatTime(value) {
  if (!value) return "-";
  return value.replace("T", " ").slice(5, 16);
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

function TableSeatLayout({ tableName, totalSeats, availableSeats, onSeatClick }) {
  const seatCount = Math.max(1, Number(totalSeats) || 1);
  const activeSeats = Math.min(seatCount, Math.max(0, Number(availableSeats) || 0));
  const visibleCount = Math.min(16, seatCount);
  const visibleActiveCount = Math.min(visibleCount, activeSeats);
  const hiddenCount = Math.max(0, seatCount - visibleCount);
  const arenaSize = 196;
  const tableSize = 86;
  const seatSize = 28;
  const seatRadius =
    visibleActiveCount <= 4 ? 62 : visibleActiveCount <= 8 ? 68 : 72;

  return (
    <div
      className="border border-slate-200 bg-slate-50 p-2"
      style={{ borderRadius: "10px" }}
    >
      <div
        className="relative mx-auto overflow-visible"
        style={{ width: `${arenaSize}px`, height: `${arenaSize}px` }}
      >
        <div
          className="absolute rounded-full border-2 border-slate-400 bg-white text-center shadow-sm"
          style={{
            width: `${tableSize}px`,
            height: `${tableSize}px`,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="flex h-full w-full flex-col items-center justify-center">
            <p className="text-[11px] text-slate-500">TABLE</p>
            <p className="mt-0.5 max-w-[72px] line-clamp-1 text-sm font-bold text-slate-800">
              {tableName}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              {activeSeats}/{seatCount}
            </p>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-2 rounded-full border border-dashed border-slate-300/80" />

        {Array.from({ length: visibleActiveCount }, (_, idx) => {
          const count = Math.max(visibleActiveCount, 1);
          const angle = (360 / count) * idx - 90;
          return (
            <div
              key={`seat-circle-${idx}`}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${seatRadius}px)`,
              }}
            >
              <button
                type="button"
                onClick={() => onSeatClick?.(idx)}
                className="rounded-full border border-emerald-300 bg-emerald-500 text-[10px] font-bold text-white"
                style={{
                  width: `${seatSize}px`,
                  height: `${seatSize}px`,
                  transform: `rotate(${-angle}deg)`,
                }}
                title={`${idx + 1}번 의자 사용 가능`}
              >
                {idx + 1}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
        <p className="text-[11px] text-slate-600">
          {visibleActiveCount === 0
            ? "가용 좌석이 없습니다. + 버튼이나 슬라이더로 추가해 주세요."
            : "의자를 누르면 가용 좌석 수를 줄일 수 있어요."}
        </p>
      </div>

      {hiddenCount > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          +{hiddenCount}개 좌석은 슬라이더/숫자 버튼으로 조정
        </p>
      )}
    </div>
  );
}

export default function OpsBoothPage() {
  const { id } = useParams();
  const initialKey = sessionStorage.getItem(BOOTH_KEY_STORAGE_KEY) || "";

  const [keyInput, setKeyInput] = useState(initialKey);
  const [key, setKey] = useState(initialKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [data, setData] = useState(null);
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
  const [menuImageFile, setMenuImageFile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);

  const [reservationDraft, setReservationDraft] = useState({
    maxReservationMinutes: 10,
    tables: [],
  });

  const [qrTokenInput, setQrTokenInput] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

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
      });
      setMenuItems(parseMenuBoardJson(next.booth.menuBoardJson));
      setReservationDraft({
        maxReservationMinutes: next.reservations?.maxReservationMinutes ?? 10,
        tables: (next.reservations?.tables ?? []).map((table) => ({
          id: table.id,
          tableName: table.tableName,
          totalSeats: table.totalSeats,
          availableSeats: table.availableSeats,
        })),
      });
      setError("");
    } catch (e) {
      setData(null);
      setError(
        e.message === "Failed to fetch"
          ? "서버 연결에 실패했습니다. 백엔드 상태를 확인해 주세요."
          : e.message,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  useEffect(() => {
    setScannerSupported(
      typeof window !== "undefined" && "BarcodeDetector" in window,
    );

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveLiveStatus() {
    if (!confirmAction("실시간 운영 정보를 저장합니다.")) return;

    try {
      await updateOpsBoothLiveStatus(
        id,
        {
          estimatedWaitMinutes:
            draft.estimatedWaitMinutes === ""
              ? null
              : Number(draft.estimatedWaitMinutes),
          remainingStock:
            draft.remainingStock === "" ? null : Number(draft.remainingStock),
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
      setMessage("실시간 정보가 저장되었습니다.");
      await load();
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "실시간 정보 저장 요청이 실패했습니다."
          : e.message,
      );
    }
  }

  async function handleUploadMenuImage() {
    if (!menuImageFile) {
      setError("업로드할 음식 사진 파일을 선택해 주세요.");
      return;
    }
    try {
      const updatedBooth = await uploadOpsBoothMenuImage(id, menuImageFile, key);
      setDraft((prev) => ({
        ...prev,
        menuImageUrl: updatedBooth.menuImageUrl || "",
      }));
      setMenuImageFile(null);
      setMessage("음식 사진이 업로드되었습니다.");
      await load();
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "이미지 업로드 요청이 실패했습니다."
          : e.message,
      );
    }
  }

  async function handleSaveReservationConfig() {
    if (!confirmAction("예약/테이블 설정을 저장합니다.")) return;

    try {
      await updateOpsBoothReservationConfig(
        id,
        {
          maxReservationMinutes: clampNumber(
            reservationDraft.maxReservationMinutes,
            1,
            10,
          ),
          tables: reservationDraft.tables.map((table) => {
            const totalSeats = clampNumber(table.totalSeats, 1, 1);
            const availableSeats = Math.min(
              totalSeats,
              Math.max(0, Number(table.availableSeats) || 0),
            );

            return {
              id: table.id ?? null,
              tableName: table.tableName,
              totalSeats,
              availableSeats,
            };
          }),
        },
        key,
      );
      setMessage("예약/테이블 설정이 저장되었습니다.");
      await load();
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "예약 설정 저장 요청이 실패했습니다."
          : e.message,
      );
    }
  }

  function addMenuItem() {
    setMenuItems((prev) => [
      ...prev,
      { name: "", price: "", description: "", soldOut: false },
    ]);
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

  async function handleCheckIn(reservationId) {
    if (!confirmAction(`예약 #${reservationId}를 체크인 처리할까요?`)) return;

    try {
      await checkInOpsBoothReservation(id, reservationId, key);
      setMessage(`예약 #${reservationId} 체크인이 완료되었습니다.`);
      await load();
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "체크인 요청이 실패했습니다."
          : e.message,
      );
    }
  }

  async function handleCheckInByToken() {
    const token = qrTokenInput.trim();
    if (!token) {
      setError("QR 토큰을 입력해 주세요.");
      return;
    }

    try {
      await checkInOpsBoothReservationByToken(id, token, key);
      setMessage("QR 체크인이 완료되었습니다.");
      setQrTokenInput("");
      await load();
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "QR 체크인 요청이 실패했습니다."
          : e.message,
      );
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
  }

  async function startScanner() {
    if (!scannerSupported) {
      setCameraError("이 브라우저는 카메라 QR 스캔을 지원하지 않습니다.");
      return;
    }

    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;

        try {
          const results = await detector.detect(videoRef.current);
          if (!results.length) return;

          const rawValue = results[0].rawValue?.trim();
          if (!rawValue) return;

          setQrTokenInput(rawValue);
          await checkInOpsBoothReservationByToken(id, rawValue, key);
          setMessage("QR 체크인이 완료되었습니다.");
          await load();
          stopScanner();
        } catch {
          // ignore intermittent detector errors
        }
      }, 700);

      setScannerActive(true);
    } catch {
      setCameraError("카메라를 사용할 수 없습니다. 권한을 확인해 주세요.");
      stopScanner();
    }
  }

  function updateTableDraft(index, patch) {
    setReservationDraft((prev) => {
      const tables = [...prev.tables];
      const target = { ...tables[index], ...patch };

      const total = Math.max(1, Number(target.totalSeats) || 1);
      const available = Math.max(
        0,
        Math.min(total, Number(target.availableSeats) || 0),
      );

      tables[index] = {
        ...target,
        totalSeats: total,
        availableSeats: available,
      };

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
        table.availableSeats = Math.min(
          nextTotal,
          Math.max(0, Number(table.availableSeats) || 0),
        );
      }

      if (field === "availableSeats") {
        const max = Math.max(1, Number(table.totalSeats) || 1);
        table.availableSeats = Math.max(
          0,
          Math.min(max, (Number(table.availableSeats) || 0) + delta),
        );
      }

      tables[index] = table;
      return { ...prev, tables };
    });
  }

  function setTableAvailableSeats(index, value) {
    setReservationDraft((prev) => {
      const tables = [...prev.tables];
      const table = { ...tables[index] };
      const total = Math.max(1, Number(table.totalSeats) || 1);
      table.availableSeats = Math.max(0, Math.min(total, Number(value) || 0));
      tables[index] = table;
      return { ...prev, tables };
    });
  }

  function handleSeatVisualToggle(index, seatIndex) {
    const table = reservationDraft.tables[index];
    if (!table) return;
    const currentAvailable = Math.max(0, Number(table.availableSeats) || 0);
    const clickedSeat = seatIndex + 1;

    const nextAvailable =
      clickedSeat === currentAvailable
        ? Math.max(0, currentAvailable - 1)
        : clickedSeat;

    setTableAvailableSeats(index, nextAvailable);
  }

  function addTableDraft(template = 4) {
    setReservationDraft((prev) => {
      const nextIndex = prev.tables.length + 1;
      return {
        ...prev,
        tables: [
          ...prev.tables,
          {
            id: null,
            tableName: `테이블 ${nextIndex}`,
            totalSeats: template,
            availableSeats: template,
          },
        ],
      };
    });
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
    setError("");
    setMessage("");
  }

  function clearKey() {
    sessionStorage.removeItem(BOOTH_KEY_STORAGE_KEY);
    setKeyInput("");
    setKey("");
    setData(null);
    setError("");
    setMessage("");
    setLoading(false);
    stopScanner();
  }

  const activeReservations = useMemo(
    () => data?.reservations?.activeReservations ?? [],
    [data],
  );

  const tableSummary = useMemo(() => {
    const tables = reservationDraft.tables || [];
    const totalTables = tables.length;
    const totalSeats = tables.reduce(
      (acc, table) => acc + (Number(table.totalSeats) || 0),
      0,
    );
    const availableSeats = tables.reduce(
      (acc, table) => acc + (Number(table.availableSeats) || 0),
      0,
    );

    return {
      totalTables,
      totalSeats,
      availableSeats,
      occupiedSeats: Math.max(0, totalSeats - availableSeats),
    };
  }, [reservationDraft.tables]);

  return (
    <section className="cyber-page pt-4 space-y-3">
      <h2 className="text-lg font-bold text-role-ops inline-flex items-center gap-1.5">
        <IconShield className="h-5 w-5 icon-role-ops" />
        부스 운영 대시보드
      </h2>

      <form
        onSubmit={submitKey}
        className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
      >
        <p className="text-sm font-semibold text-role-ops inline-flex items-center gap-1.5">
          <IconSettings className="h-4 w-4 icon-role-ops" />
          운영 키 입력
        </p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            className="border rounded px-2 py-2 text-sm"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="부스 번호"
          />
          <button
            type="submit"
            className="rounded border px-3 py-2 text-sm font-semibold"
          >
            적용
          </button>
          <button
            type="button"
            onClick={clearKey}
            className="rounded border px-3 py-2 text-sm"
          >
            초기화
          </button>
        </div>
      </form>

      {!key && <p className="text-sm text-rose-600">운영 키를 입력해 주세요.</p>}
      {loading && <p className="text-sm text-slate-600">불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {message && <p className="text-sm text-teal-700">{message}</p>}

      {data && (
        <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="aspect-[16/8] bg-slate-100">
            <img
              src={resolveBoothImageUrl(data.booth)}
              alt={`${data.booth.name} 이미지`}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="p-3 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-role-map inline-flex items-center gap-1.5">
                <IconMapPin className="h-4 w-4 icon-role-map" />
                {data.booth.name}
              </h3>
              <CongestionBadge level={data.congestion.level} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-2">
                <p className="text-[11px] text-sky-700">⏱ 대기(분)</p>
                <p className="text-lg font-bold text-sky-800">{data.booth.estimatedWaitMinutes ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-2">
                <p className="text-[11px] text-purple-700">📦 재고</p>
                <p className="text-lg font-bold text-purple-800">{data.booth.remainingStock ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="text-[11px] text-amber-700">🧾 활성 예약</p>
                <p className="text-lg font-bold text-amber-800">{activeReservations.length}건</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                <p className="text-[11px] text-emerald-700">🪑 사용 좌석</p>
                <p className="text-lg font-bold text-emerald-800">
                  {tableSummary.occupiedSeats}/{tableSummary.totalSeats || 0}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-role-log inline-flex items-center gap-1.5">
                  <IconClipboard className="h-4 w-4 icon-role-log" />
                  실시간 운영 상태
                </p>
                <span className="text-xs text-slate-500">빠른 수정</span>
              </div>
              <div className="rounded border border-cyan-100 bg-cyan-50/40 p-2 space-y-2">
                <p className="text-xs font-semibold text-slate-700">부스 유형/운영시간</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="border rounded px-2 py-2 text-sm bg-white"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, category: e.target.value }))
                    }
                  >
                    {BOOTH_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    className="border rounded px-2 py-2 text-sm bg-white"
                    value={draft.dayPart}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, dayPart: e.target.value }))
                    }
                  >
                    {BOOTH_DAY_PARTS.map((part) => (
                      <option key={part} value={part}>
                        {part}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    className="border rounded px-2 py-2 text-sm bg-white"
                    value={draft.openTime}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, openTime: e.target.value }))
                    }
                  />
                  <input
                    type="time"
                    className="border rounded px-2 py-2 text-sm bg-white"
                    value={draft.closeTime}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, closeTime: e.target.value }))
                    }
                  />
                </div>
                <input
                  className="w-full border rounded px-2 py-2 text-sm bg-white"
                  placeholder="태그 (예: 예약필요, 무료, 실내)"
                  value={draft.tags}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, tags: e.target.value }))
                  }
                />
                <textarea
                  className="w-full border rounded px-2 py-2 text-sm bg-white min-h-16"
                  placeholder="부스 유형별 추가 정보"
                  value={draft.contentJson}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, contentJson: e.target.value }))
                  }
                />
                <label className="flex items-center gap-2 rounded border bg-white px-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.reservationEnabled}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        reservationEnabled: e.target.checked,
                      }))
                    }
                  />
                  예약/웨이팅 기능 사용
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="border rounded px-2 py-2 text-sm"
                  placeholder="대기 분"
                  value={draft.estimatedWaitMinutes}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      estimatedWaitMinutes: e.target.value,
                    }))
                  }
                />
                <input
                  className="border rounded px-2 py-2 text-sm"
                  placeholder="남은 재고"
                  value={draft.remainingStock}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      remainingStock: e.target.value,
                    }))
                  }
                />
              </div>
              <input
                className="w-full border rounded px-2 py-2 text-sm"
                placeholder="운영 메모 (예: 10분 뒤 재료 재입고)"
                value={draft.liveStatusMessage}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    liveStatusMessage: e.target.value,
                  }))
                }
              />
              <textarea
                className="w-full border rounded px-2 py-2 text-sm min-h-20"
                placeholder="부스 소개 (메뉴/특징/추천 포인트)"
                value={draft.boothIntro}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    boothIntro: e.target.value,
                  }))
                }
              />
              <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
                <p className="text-xs font-semibold text-slate-700">음식 사진 업로드</p>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="border rounded px-2 py-2 text-sm bg-white"
                    onChange={(e) => setMenuImageFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={handleUploadMenuImage}
                    className="rounded border border-teal-500 px-3 py-2 text-xs font-semibold text-teal-700"
                  >
                    업로드
                  </button>
                </div>
              </div>
              {draft.menuImageUrl && (
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-[11px] text-slate-600 mb-1">음식 사진 미리보기</p>
                  <img
                    src={draft.menuImageUrl}
                    alt="음식 사진 미리보기"
                    className="h-32 w-full rounded object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}

              <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">메뉴판 편집</p>
                  <button
                    type="button"
                    onClick={addMenuItem}
                    className="rounded border border-cyan-500 px-2 py-1 text-[11px] font-semibold text-cyan-700"
                  >
                    메뉴 추가
                  </button>
                </div>
                {menuItems.length ? (
                  <div className="space-y-2">
                    {menuItems.map((item, index) => (
                      <div
                        key={`menu-item-${index}`}
                        className="rounded border border-slate-200 bg-white p-2 space-y-2"
                      >
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <input
                            className="border rounded px-2 py-1.5 text-sm"
                            placeholder="메뉴명 (예: 닭강정)"
                            value={item.name}
                            onChange={(e) =>
                              updateMenuItem(index, { name: e.target.value })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeMenuItem(index)}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            삭제
                          </button>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <input
                            className="border rounded px-2 py-1.5 text-sm"
                            placeholder="가격 (예: 5000원)"
                            value={item.price}
                            onChange={(e) =>
                              updateMenuItem(index, { price: e.target.value })
                            }
                          />
                          <label className="inline-flex items-center gap-1 rounded border px-2 text-xs">
                            <input
                              type="checkbox"
                              checked={item.soldOut}
                              onChange={(e) =>
                                updateMenuItem(index, { soldOut: e.target.checked })
                              }
                            />
                            품절
                          </label>
                        </div>
                        <input
                          className="w-full border rounded px-2 py-1.5 text-sm"
                          placeholder="설명 (예: 국내산 닭다리살)"
                          value={item.description}
                          onChange={(e) =>
                            updateMenuItem(index, { description: e.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">아직 메뉴가 없습니다. 메뉴 추가로 시작해 주세요.</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSaveLiveStatus}
                className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold"
              >
                실시간 상태 저장
              </button>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-900 text-role-ops inline-flex items-center gap-1.5">
                <IconUsers className="h-4 w-4 icon-role-ops" />
                테이블/좌석 설정
              </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => addTableDraft(2)}
                    className="rounded border border-emerald-400 px-2 py-1 text-[11px]"
                  >
                    +2석
                  </button>
                  <button
                    type="button"
                    onClick={() => addTableDraft(4)}
                    className="rounded border border-emerald-400 px-2 py-1 text-[11px]"
                  >
                    +4석
                  </button>
                  <button
                    type="button"
                    onClick={() => addTableDraft(6)}
                    className="rounded border border-emerald-400 px-2 py-1 text-[11px]"
                  >
                    +6석
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded border border-emerald-200 bg-white p-2">
                <div>
                  <p className="text-[11px] text-slate-600">테이블</p>
                  <p className="font-bold text-slate-800">{tableSummary.totalTables}개</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-600">좌석(가용/전체)</p>
                  <p className="font-bold text-slate-800">
                    {tableSummary.availableSeats}/{tableSummary.totalSeats}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-xs text-emerald-900">최대 예약 유지시간(분)</span>
                <input
                  className="border rounded px-2 py-1.5 text-sm w-24"
                  type="number"
                  min="1"
                  value={reservationDraft.maxReservationMinutes}
                  onChange={(e) =>
                    setReservationDraft((prev) => ({
                      ...prev,
                      maxReservationMinutes: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                {reservationDraft.tables.map((table, index) => (
                  <div
                    key={`${table.id ?? "new"}-${index}`}
                    className="rounded border border-emerald-200 bg-white p-2 space-y-2"
                  >
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                      <input
                        className="border rounded px-2 py-1.5 text-sm"
                        value={table.tableName}
                        onChange={(e) =>
                          updateTableDraft(index, { tableName: e.target.value })
                        }
                        placeholder="테이블 이름"
                      />
                      <button
                        type="button"
                        onClick={() => removeTableDraft(index)}
                        className="rounded border px-2 text-xs"
                      >
                        삭제
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-slate-200 p-2">
                        <p className="text-[11px] text-slate-600">전체 좌석</p>
                        <div className="mt-1 flex items-center justify-between">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => stepTable(index, "totalSeats", -1)}
                          >
                            -
                          </button>
                          <span className="font-bold text-slate-800">{table.totalSeats}</span>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => stepTable(index, "totalSeats", 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="rounded border border-slate-200 p-2">
                        <p className="text-[11px] text-slate-600">가용 좌석</p>
                        <div className="mt-1 flex items-center justify-between">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => stepTable(index, "availableSeats", -1)}
                          >
                            -
                          </button>
                          <span className="font-bold text-slate-800">{table.availableSeats}</span>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => stepTable(index, "availableSeats", 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-600">좌석 상태 시각 설정</p>
                        <p className="text-[11px] font-semibold text-slate-700">
                          {table.availableSeats}/{table.totalSeats}
                        </p>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Number(table.totalSeats) || 1)}
                        value={Math.max(0, Number(table.availableSeats) || 0)}
                        onChange={(e) => setTableAvailableSeats(index, e.target.value)}
                        className="mt-2 w-full"
                      />
                    </div>

                    <TableSeatLayout
                      tableName={table.tableName}
                      totalSeats={table.totalSeats}
                      availableSeats={table.availableSeats}
                      onSeatClick={(seatIndex) =>
                        handleSeatVisualToggle(index, seatIndex)
                      }
                    />
                  </div>
                ))}

                {!reservationDraft.tables.length && (
                  <p className="text-xs text-slate-600">설정된 테이블이 없습니다. +2/+4/+6석 버튼으로 빠르게 추가해 주세요.</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveReservationConfig}
                className="w-full rounded bg-emerald-700 text-white py-2 text-sm font-semibold"
              >
                예약/테이블 설정 저장
              </button>
            </div>

            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-cyan-900 text-role-schedule inline-flex items-center gap-1.5">
                <IconCalendar className="h-4 w-4 icon-role-schedule" />
                QR 체크인
              </p>

              <div className="flex gap-2">
                {!scannerActive ? (
                  <button
                    type="button"
                    onClick={startScanner}
                    className="rounded border border-cyan-500 px-3 py-1.5 text-xs font-semibold"
                    disabled={!scannerSupported}
                  >
                    카메라 스캔 시작
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="rounded border border-slate-400 px-3 py-1.5 text-xs font-semibold"
                  >
                    스캔 중지
                  </button>
                )}
              </div>

              {scannerActive && (
                <video
                  ref={videoRef}
                  className="w-full rounded border border-cyan-300 bg-black"
                  muted
                  playsInline
                />
              )}

              {cameraError && (
                <p className="text-xs text-rose-700">{cameraError}</p>
              )}

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="border rounded px-2 py-2 text-sm"
                  value={qrTokenInput}
                  onChange={(e) => setQrTokenInput(e.target.value)}
                  placeholder="QR 토큰 직접 입력"
                />
                <button
                  type="button"
                  onClick={handleCheckInByToken}
                  className="rounded bg-cyan-700 text-white px-3 py-2 text-xs font-semibold"
                >
                  체크인
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">활성 예약 목록</p>

              {activeReservations.length ? (
                activeReservations.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="rounded border border-amber-300 bg-white p-2 flex items-center justify-between gap-2"
                  >
                    <div className="text-xs text-slate-700">
                      <p className="font-semibold">#{reservation.id} · {reservation.tableName}</p>
                      <p>예약자: {reservation.userKey}</p>
                      <p>좌석: {reservation.seatCount}</p>
                      <p>만료: {formatTime(reservation.expiresAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckIn(reservation.id)}
                      className="rounded bg-amber-600 text-white px-3 py-2 text-xs font-semibold"
                    >
                      수동 체크인
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600">현재 활성 예약이 없습니다.</p>
              )}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
