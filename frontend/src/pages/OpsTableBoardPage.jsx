// 자리 현황판. 입구 스태프가 한 손으로 테이블을 누르면 "이용 중" ↔ "빈 자리"가 바뀐다.
// 손님 화면과 첫 화면 카드는 이 조작을 실시간으로 받는다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createReservationStream,
  fetchOpsBoothBootstrap,
  fetchOpsBoothReservations,
  occupyOpsBoothReservationTable,
  releaseOpsBoothReservationTable,
} from "../api";
import { IconArrowLeft, IconRefresh } from "../components/UxIcons";
import { useToast } from "../components/v2/V2Kit";

const BOOTH_KEY_STORAGE_KEY = "festflow_ops_booth_key";

function tableSeats(table) {
  return Math.max(0, Number(table?.totalSeats) || 0);
}

function statusOf(table) {
  if (table?.occupancyStatus) return table.occupancyStatus;
  return Number(table?.reservableSeats) > 0 ? "AVAILABLE" : "FULL";
}

function relativeTime(at) {
  if (!at) return "";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "방금";
  if (seconds < 60) return `${seconds}초 전`;
  return `${Math.floor(seconds / 60)}분 전`;
}

export default function OpsTableBoardPage() {
  const { id } = useParams();
  const [key, setKey] = useState(() => sessionStorage.getItem(BOOTH_KEY_STORAGE_KEY) || "");
  const [keyInput, setKeyInput] = useState("");
  const [boothName, setBoothName] = useState("");
  const [tables, setTables] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [pendingRelease, setPendingRelease] = useState(null);
  const [showToast, toastNode] = useToast();
  const loadingRef = useRef(false);

  async function load(currentKey = key) {
    if (!currentKey || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [bootstrap, state] = await Promise.all([
        fetchOpsBoothBootstrap(id, currentKey),
        fetchOpsBoothReservations(id, currentKey),
      ]);
      setBoothName(bootstrap?.booth?.name || "");
      setTables(Array.isArray(state?.tables) ? state.tables : []);
      setUpdatedAt(Date.now());
      setError("");
    } catch (loadError) {
      setError(loadError.message || "자리 현황을 불러오지 못했어요.");
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  useEffect(() => {
    if (!key) return undefined;
    let stream = null;
    try {
      stream = createReservationStream();
      stream.addEventListener("reservations", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload?.boothId || String(payload.boothId) === String(id)) load(key);
        } catch {
          // 잘못된 페이로드는 무시한다.
        }
      });
    } catch {
      // 스트림이 없으면 새로고침 버튼으로 본다.
    }
    const clock = window.setInterval(() => setTick((value) => value + 1), 5000);
    return () => {
      stream?.close();
      window.clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  const summary = useMemo(() => {
    const total = tables.length;
    const free = tables.filter((table) => statusOf(table) === "AVAILABLE").length;
    return { total, free, used: total - free };
  }, [tables]);

  function handleKeySubmit(event) {
    event.preventDefault();
    const next = keyInput.trim();
    if (!next) return;
    sessionStorage.setItem(BOOTH_KEY_STORAGE_KEY, next);
    setKey(next);
  }

  async function toggle(table) {
    const status = statusOf(table);
    if (busyId) return;
    if (status === "RESERVED" && pendingRelease !== table.id) {
      // 예약 손님 자리를 실수로 비우지 않도록 한 번 더 누르게 한다.
      setPendingRelease(table.id);
      window.setTimeout(() => setPendingRelease((current) => (current === table.id ? null : current)), 4000);
      return;
    }
    setBusyId(table.id);
    setPendingRelease(null);
    try {
      if (status === "AVAILABLE") {
        await occupyOpsBoothReservationTable(id, table.id, key);
        showToast(`${table.tableName} 이용 중으로 바꿨어요.`);
      } else {
        await releaseOpsBoothReservationTable(id, table.id, key);
        showToast(`${table.tableName} 비웠어요.`);
      }
      await load(key);
    } catch (toggleError) {
      setError(toggleError.message || "바꾸지 못했어요. 다시 눌러 주세요.");
    } finally {
      setBusyId(null);
    }
  }

  if (!key) {
    return (
      <section className="v2-page tb-page" data-i18n-skip>
        <div className="v2-title">
          <h1>자리 현황판</h1>
          <p>부스 운영 키를 넣으면 시작해요.</p>
        </div>
        <form onSubmit={handleKeySubmit}>
          <label className="v2-field">
            <span>운영 키</span>
            <input value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder="부스 키" />
          </label>
          <button type="submit" className="v2-btn">
            열기
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="v2-page tb-page" data-i18n-skip>
      <header className="v2-topbar">
        <Link to={`/ops/booth/${id}`} aria-label="운영 콘솔로">
          <IconArrowLeft />
        </Link>
        <h1>{boothName || "자리 현황판"}</h1>
        <button type="button" aria-label="새로고침" onClick={() => load(key)}>
          <IconRefresh />
        </button>
      </header>

      <div className="tb-summary">
        <div>
          <small>빈 테이블</small>
          <strong className={summary.free === 0 ? "is-zero" : ""}>
            {summary.free}
            <span>/{summary.total}</span>
          </strong>
        </div>
        <div>
          <small>이용 중</small>
          <strong>{summary.used}</strong>
        </div>
        <div>
          <small>갱신</small>
          <strong className="tb-summary__time">{relativeTime(updatedAt) || "-"}</strong>
        </div>
      </div>
      <p className="tb-hint">
        손님이 앉으면 한 번, 나가면 한 번 누르세요. 손님 화면의 &quot;남은 자리&quot;가 바로 바뀌어요.
      </p>

      {error && <p className="v2-note v2-note--danger">{error}</p>}

      {tables.length === 0 ? (
        <div className="v2-empty">
          <strong>등록된 테이블이 없어요</strong>
          <p>운영 콘솔의 자리 예약 설정에서 테이블을 먼저 만들어 주세요.</p>
          <Link to={`/ops/booth/${id}`} className="v2-btn v2-btn--gray v2-btn--sm">
            운영 콘솔로
          </Link>
        </div>
      ) : (
        <div className="tb-grid" data-tick={tick}>
          {tables.map((table) => {
            const status = statusOf(table);
            const free = status === "AVAILABLE";
            const reserved = status === "RESERVED";
            const confirming = pendingRelease === table.id;
            return (
              <button
                key={table.id}
                type="button"
                className={`tb-table tb-table--${status.toLowerCase()}${confirming ? " tb-table--confirm" : ""}`}
                onClick={() => toggle(table)}
                disabled={busyId === table.id}
              >
                <strong>{table.tableName}</strong>
                <span>{tableSeats(table)}인석</span>
                <em>
                  {busyId === table.id
                    ? "바꾸는 중"
                    : confirming
                      ? "한 번 더 누르면 비움"
                      : free
                        ? "빈 자리"
                        : reserved
                          ? "예약 손님"
                          : "이용 중"}
                </em>
              </button>
            );
          })}
        </div>
      )}
      {toastNode}
    </section>
  );
}
