// 요리사 창(주방 화면). 입금이 확인된 주문만, 입금이 확인된 순서대로(먼저 확인된 주문이 맨 위) 보여 준다.
// 조리 시작 → 완료를 누르면 주문 콘솔의 '서빙할 것'에 올라가고 손님 화면도 같이 바뀐다.
// 금액 · 입금자 이름 · 전화번호는 주방에 필요 없어 보여 주지 않는다. 스타일은 styles/v2-ops.css 의 kt-.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createOrderStream, fetchOpsBoothBootstrap, fetchOpsBoothOrders, updateOpsBoothOrderStatus } from "../api";
import { IconArrowLeft, IconRefresh } from "../components/UxIcons";
import { chimeReady, playChime } from "../utils/chime";

const BOOTH_KEY_STORAGE_KEY = "festflow_ops_booth_key";
// '완료'를 잘못 눌렀을 때 되돌릴 수 있는 시간. 서버는 주문 상태를 뒤로 돌리지 못해서, 이 시간이 지난 뒤에야 서버로 보낸다.
const UNDO_MS = 5000;
// 입금 확인 뒤 이만큼 지나면 카드에 붉게 표시한다.
const LATE_MINUTES = 10;

// 서버가 주는 "2026-10-07T18:40:12" (한국 시간, 시간대 없음)을 읽는다.
function parseLocal(value) {
  if (!value) return 0;
  const time = new Date(`${value}`.slice(0, 19)).getTime();
  return Number.isFinite(time) ? time : 0;
}

const paidTime = (order) => parseLocal(order.paidAt || order.createdAt);

function clock(value) {
  return value ? `${value}`.slice(11, 16) : "";
}

function minutesSince(order, now) {
  const at = paidTime(order);
  return at ? Math.max(0, Math.floor((now - at) / 60_000)) : 0;
}

export default function OpsKitchenPage() {
  const { id } = useParams();
  const [key, setKey] = useState(() => sessionStorage.getItem(BOOTH_KEY_STORAGE_KEY) || "");
  const [keyInput, setKeyInput] = useState("");
  const [boothName, setBoothName] = useState("");
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [authFailed, setAuthFailed] = useState(false);
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState(null);
  // 완료를 누르고 아직 서버로 보내지 않은 주문: { 주문 id: 보낼 시각(performance.now 기준) }
  const [pending, setPending] = useState({});
  // 되돌릴 시간이 끝나 서버로 보내는 중인 주문 id
  const [sending, setSending] = useState([]);
  const [, setTick] = useState(0);
  const [soundOn, setSoundOn] = useState(chimeReady);
  const knownIds = useRef(null);
  const pendingTimers = useRef(new Map());
  const authFailedRef = useRef(false);
  const flashTimer = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  async function load(currentKey = keyRef.current) {
    if (!currentKey) return;
    try {
      const next = await fetchOpsBoothOrders(id, currentKey);
      const list = Array.isArray(next?.orders) ? next.orders : [];
      // 처음 읽을 때는 조용히, 그 뒤로 처음 보는 주방 주문이 있으면 알린다.
      const cooking = list.filter((order) => order.status === "PAID" || order.status === "PREPARING");
      if (knownIds.current) {
        const fresh = cooking.filter((order) => !knownIds.current.has(order.id));
        if (fresh.length) {
          const oldest = [...fresh].sort((a, b) => paidTime(a) - paidTime(b))[0];
          setFlash(`새 주문 · ${oldest.tableLabel} 테이블${fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : ""}`);
          playChime("kitchen");
          window.clearTimeout(flashTimer.current);
          flashTimer.current = window.setTimeout(() => setFlash(""), 8000);
        }
      } else {
        knownIds.current = new Set();
      }
      cooking.forEach((order) => knownIds.current.add(order.id));
      setOrders(list);
      setError("");
      authFailedRef.current = false;
      setAuthFailed(false);
    } catch (loadError) {
      // 키가 틀렸거나 잠긴 상태면 자동으로 다시 읽지 않는다(틀린 키로 계속 두드리면 잠금이 길어진다).
      const failed = loadError?.status === 401 || loadError?.status === 403 || loadError?.status === 429;
      authFailedRef.current = failed;
      setAuthFailed(failed);
      setError(loadError.message || "주문을 불러오지 못했어요.");
    }
  }

  useEffect(() => {
    if (!key) return undefined;
    knownIds.current = null;
    load(key);
    let alive = true;
    fetchOpsBoothBootstrap(id, key)
      .then((bootstrap) => {
        if (alive) setBoothName(bootstrap?.booth?.name || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  // 실시간: 주문이 바뀌면 바로 다시 읽는다. 연결이 조용히 끊겨도 놓치지 않게 15초마다, 화면으로 돌아올 때도 읽는다.
  useEffect(() => {
    if (!key) return undefined;
    let stream = null;
    let reloadTimer = null;
    const reloadSoon = () => {
      if (reloadTimer) return;
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        if (!authFailedRef.current) load();
      }, 400);
    };
    try {
      stream = createOrderStream();
      stream.addEventListener("orders", (event) => {
        try {
          const order = JSON.parse(event.data);
          if (String(order.boothId) === String(id)) reloadSoon();
        } catch {
          // 잘못된 페이로드는 무시한다.
        }
      });
    } catch {
      // 스트림이 없으면 15초마다 읽는 것으로 본다.
    }
    const poll = () => {
      if (document.visibilityState !== "hidden" && !authFailedRef.current) load();
    };
    const pollTimer = window.setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    return () => {
      stream?.close();
      if (reloadTimer) window.clearTimeout(reloadTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  // 지난 시간 · 되돌리기 남은 초를 다시 그린다.
  const hasPending = Object.keys(pending).length > 0;
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), hasPending ? 250 : 10000);
    return () => window.clearInterval(timer);
  }, [hasPending]);

  // 주방 기기 화면이 꺼지지 않게 한다(되는 브라우저에서만). 다른 앱에 갔다 오면 다시 건다.
  useEffect(() => {
    if (!key || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let closed = false;
    const hold = () => {
      if (closed || document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((next) => {
          if (closed) next.release().catch(() => {});
          else lock = next;
        })
        .catch(() => {});
    };
    hold();
    document.addEventListener("visibilitychange", hold);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", hold);
      lock?.release().catch(() => {});
    };
  }, [key]);

  // 화면을 한 번 누르면 소리가 켜진다.
  useEffect(() => {
    if (soundOn) return undefined;
    const check = () => window.setTimeout(() => setSoundOn(chimeReady()), 150);
    document.addEventListener("pointerdown", check);
    return () => document.removeEventListener("pointerdown", check);
  }, [soundOn]);

  async function send(order, status) {
    setBusyId(order.id);
    try {
      await updateOpsBoothOrderStatus(id, order.id, status, keyRef.current);
    } catch (sendError) {
      // 409: 콘솔에서 이미 넘겼거나 취소한 주문. 다시 읽으면 맞는 상태가 보인다.
      if (sendError?.status !== 409) setError(sendError.message || "바꾸지 못했어요. 다시 눌러 주세요.");
    } finally {
      await load();
      setBusyId(null);
    }
  }

  const sendRef = useRef(send);
  sendRef.current = send;

  function clearPending(orderId) {
    window.clearTimeout(pendingTimers.current.get(orderId));
    pendingTimers.current.delete(orderId);
    setPending((current) => {
      const { [orderId]: _removed, ...rest } = current;
      return rest;
    });
  }

  // 되돌릴 시간이 끝났다. 서버로 보내는 동안에도 카드는 '완료로 넘기는 중' 그대로 둔다(잠깐 '조리 중'으로 돌아가 보이지 않게).
  async function commit(order) {
    if (!pendingTimers.current.has(order.id)) return;
    window.clearTimeout(pendingTimers.current.get(order.id));
    pendingTimers.current.delete(order.id);
    setSending((current) => [...current, order.id]);
    try {
      await sendRef.current(order, "READY");
    } finally {
      setSending((current) => current.filter((orderId) => orderId !== order.id));
      clearPending(order.id);
    }
  }

  function finish(order) {
    if (pendingTimers.current.has(order.id)) return;
    pendingTimers.current.set(order.id, window.setTimeout(() => commit(order), UNDO_MS));
    setPending((current) => ({ ...current, [order.id]: performance.now() + UNDO_MS }));
  }

  // 되돌릴 시간을 기다리던 '완료'는 화면을 떠날 때(다른 앱 · 뒤로 가기) 바로 보낸다. 눌러 놓고 사라지지 않게.
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  useEffect(() => {
    const flush = () => {
      [...pendingTimers.current.keys()].forEach((orderId) => {
        const order = (ordersRef.current || []).find((item) => item.id === orderId);
        window.clearTimeout(pendingTimers.current.get(orderId));
        pendingTimers.current.delete(orderId);
        if (order) updateOpsBoothOrderStatus(id, orderId, "READY", keyRef.current).catch(() => {});
      });
      setPending({});
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [id]);

  // 입금이 확인된 순서. 같은 시각이면 먼저 들어온 주문이 먼저.
  const queue = useMemo(
    () =>
      (orders || [])
        .filter((order) => order.status === "PAID" || order.status === "PREPARING")
        .sort((a, b) => paidTime(a) - paidTime(b) || a.id - b.id),
    [orders],
  );

  // 콘솔에서 취소했거나 이미 넘긴 주문은 되돌리기 대기에서 뺀다.
  useEffect(() => {
    [...pendingTimers.current.keys()].forEach((orderId) => {
      if (!queue.some((order) => order.id === orderId)) clearPending(orderId);
    });
  }, [queue]);

  const toMake = queue.filter((order) => !(order.id in pending));
  const totals = useMemo(() => {
    const tally = new Map();
    toMake.forEach((order) =>
      (order.items || []).forEach((item) => tally.set(item.name, (tally.get(item.name) || 0) + (Number(item.quantity) || 0))),
    );
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, pending]);
  const waitingToServe = (orders || [])
    .filter((order) => order.status === "READY")
    .sort((a, b) => parseLocal(a.readyAt) - parseLocal(b.readyAt) || a.id - b.id);

  function handleKeySubmit(event) {
    event.preventDefault();
    const next = keyInput.trim();
    if (!next) return;
    sessionStorage.setItem(BOOTH_KEY_STORAGE_KEY, next);
    setError("");
    setKey(next);
  }

  function forgetKey() {
    sessionStorage.removeItem(BOOTH_KEY_STORAGE_KEY);
    setKeyInput("");
    setOrders(null);
    setError("");
    setAuthFailed(false);
    setKey("");
  }

  if (!key) {
    return (
      <div className="ops-gate" data-i18n-skip>
        <form className="ops-gate__card" onSubmit={handleKeySubmit}>
          <img src="/images/chito-wave.png" alt="" onError={(e) => { e.currentTarget.src = "/images/chito.png"; }} />
          <h1>요리사 창</h1>
          <p>주방에서 보는 화면이에요. 운영진에게 받은 부스 키를 넣어 주세요.</p>
          <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="부스 키" autoComplete="off" autoFocus />
          <button type="submit" className="ops-btn ops-btn--primary ops-btn--block" disabled={!keyInput.trim()}>
            열기
          </button>
        </form>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="kt" data-i18n-skip>
      <header className="kt__top">
        <Link to={`/ops/booth/${id}`} className="kt__icon" aria-label="주문 콘솔로">
          <IconArrowLeft />
        </Link>
        <div className="kt__title">
          <small>요리사 창 · 입금 확인된 순서</small>
          <strong>{boothName || "주방"}</strong>
        </div>
        <button type="button" className="kt__icon" aria-label="새로고침" onClick={() => load()}>
          <IconRefresh />
        </button>
      </header>

      <section className="kt-sum" aria-label="지금 만들 것">
        <div className="kt-sum__head">
          <strong>지금 만들 것</strong>
          <span>주문 {toMake.length}건</span>
        </div>
        {totals.length ? (
          <div className="kt-totals">
            {totals.map(([name, quantity]) => (
              <span key={name} className="kt-total">
                {name}
                <b>{quantity}</b>
              </span>
            ))}
          </div>
        ) : (
          <p className="kt-sum__none">없어요</p>
        )}
      </section>

      <div className="kt-sound">
        <span>
          {soundOn
            ? "새 주문이 오면 소리가 나요. 기기 소리(미디어 음량)를 끝까지 올려 두세요."
            : "화면을 한 번 누르면 새 주문이 올 때 소리가 나요."}
        </span>
        <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => playChime("kitchen")}>
          소리 듣기
        </button>
      </div>
      {flash && <div className="ops-banner">{flash}</div>}
      {error && (
        <div className="ops-banner ops-banner--red">
          <span>{error}</span>
          {authFailed && (
            <button type="button" className="ops-btn ops-btn--ghost ops-btn--sm" onClick={forgetKey}>
              키 다시 넣기
            </button>
          )}
        </div>
      )}

      {orders == null && !error && <div className="ops-skeleton" style={{ height: 160 }} />}

      {orders != null && queue.length === 0 && (
        <div className="kt-empty">
          <strong>지금 만들 주문이 없어요</strong>
          <p>주문 콘솔에서 입금을 확인하면 여기에 바로 떠요.</p>
        </div>
      )}

      {queue.length > 0 && (
        <div className="kt-orders">
          {queue.map((order) => {
            const waiting = order.id in pending;
            const leaving = sending.includes(order.id);
            // '먼저': 아직 완료를 누르지 않은 주문 가운데 입금이 가장 먼저 확인된 것.
            const first = toMake[0]?.id === order.id;
            const cooking = order.status === "PREPARING";
            const busy = busyId === order.id;
            const minutes = minutesSince(order, now);
            const left = waiting ? Math.max(1, Math.ceil((pending[order.id] - performance.now()) / 1000)) : 0;
            const tone = waiting ? "done" : cooking ? "cooking" : "waiting";
            return (
              <article key={order.id} className={`kt-order kt-order--${tone}${minutes >= LATE_MINUTES && !waiting ? " kt-order--late" : ""}`}>
                <div className="kt-order__head">
                  <div>
                    <strong className="kt-order__table">{order.tableLabel} 테이블</strong>
                    <small className="kt-order__meta">
                      #{order.orderNo || order.id} · 입금 확인 {clock(order.paidAt || order.createdAt)}
                    </small>
                  </div>
                  <div className="kt-order__side">
                    {first ? <em className="kt-first">먼저</em> : null}
                    <span className="kt-order__ago">{minutes < 1 ? "방금" : `${minutes}분 전`}</span>
                  </div>
                </div>
                <ul className="kt-order__items">
                  {(order.items || []).map((item) => (
                    <li key={`${order.id}-${item.name}`}>
                      <span>{item.name}</span>
                      <b>× {item.quantity}</b>
                    </li>
                  ))}
                </ul>
                {order.request && <p className="kt-order__request">요청 · {order.request}</p>}
                <div className="kt-order__foot">
                  <span className={`kt-state kt-state--${tone}`}>
                    {leaving ? "완료로 넘기는 중…" : waiting ? `완료로 넘기는 중 · ${left}초` : cooking ? "조리 중" : "조리 대기"}
                  </span>
                  {leaving ? null : waiting ? (
                    <button type="button" className="kt-btn kt-btn--undo" onClick={() => clearPending(order.id)}>
                      되돌리기
                    </button>
                  ) : cooking ? (
                    <button type="button" className="kt-btn kt-btn--done" disabled={busy} onClick={() => finish(order)}>
                      {busy ? "보내는 중…" : "완료"}
                    </button>
                  ) : (
                    <button type="button" className="kt-btn kt-btn--start" disabled={busy} onClick={() => send(order, "PREPARING")}>
                      {busy ? "보내는 중…" : "조리 시작"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {waitingToServe.length > 0 && (
        <p className="kt-served">
          <strong>다 만든 주문 {waitingToServe.length}건</strong> · 서빙 기다리는 중:{" "}
          {waitingToServe.map((order) => order.tableLabel).join(", ")}
        </p>
      )}
    </div>
  );
}
