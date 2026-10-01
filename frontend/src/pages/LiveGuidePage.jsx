// 눌러 보는 운영 매뉴얼 (/guide/live).
// 손님 화면과 스태프 화면을 진짜 그대로 나란히 띄우고, 한쪽에서 누르면 다른 쪽이 어떻게 바뀌는지 바로 보여 준다.
// 화면은 iframe 속의 실제 페이지이고, 서버만 연습용(demo/demoServer.js)으로 바꿔 끼웠다. 실제 주문 · 실제 서버와는 이어져 있지 않다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_BOOTH_ID, DEMO_OPS_KEY, createDemoServer } from "../demo/demoServer";
import "../styles/live-guide.css";

const TABLE = "3번";
const BOOTH = DEMO_BOOTH_ID;
const OPS_KEY_STORAGE = "festflow_ops_booth_key";

const FRAMES = [
  {
    id: "guest",
    who: "손님",
    label: "손님 폰",
    sub: `${TABLE} 테이블 QR을 찍은 화면`,
    home: `/order/${BOOTH}/${encodeURIComponent(TABLE)}`,
    allow: [new RegExp(`^/order/${BOOTH}(/|$)`), /^\/orders\/\d+$/],
  },
  {
    id: "console",
    who: "스태프",
    label: "주문 콘솔",
    sub: "주문을 받는 스태프 화면",
    home: `/ops/booth/${BOOTH}`,
    allow: [new RegExp(`^/ops/booth/${BOOTH}(/|$)`)],
    staff: true,
  },
  {
    id: "board",
    who: "스태프",
    label: "자리 현황판",
    sub: "입구 스태프가 보는 화면",
    home: `/ops/booth/${BOOTH}/tables`,
    allow: [new RegExp(`^/ops/booth/${BOOTH}(/|$)`)],
    staff: true,
  },
];
const FRAME_BY_ID = Object.fromEntries(FRAMES.map((frame) => [frame.id, frame]));

/* ---------- 연습용 서버(페이지에 하나) ---------- */
let hostSingleton = null;
function getHost() {
  if (hostSingleton) return hostSingleton;
  const storages = new Map();
  const seed = (frame) => ({
    local: new Map(),
    session: new Map(frame.staff ? [[OPS_KEY_STORAGE, DEMO_OPS_KEY]] : []),
  });
  hostSingleton = {
    server: createDemoServer(),
    rules: Object.fromEntries(FRAMES.map((frame) => [frame.id, { home: frame.home, allow: frame.allow }])),
    storageFor(role) {
      if (!storages.has(role)) storages.set(role, seed(FRAME_BY_ID[role] || {}));
      return storages.get(role);
    },
    onBlocked: null,
    reset() {
      storages.clear();
      this.server.reset();
    },
  };
  // iframe 속 화면(demo/demoFrame.js)이 이 값을 보고 연습 화면으로 켜진다.
  window.__ffDemoHost = hostSingleton;
  return hostSingleton;
}

/* ---------- 순서 ---------- */
const STATUS_INDEX = { PENDING_PAYMENT: 0, PAID: 1, PREPARING: 2, READY: 3, COMPLETED: 4 };

const STEPS = [
  {
    key: "order",
    frame: "guest",
    title: "메뉴를 담아 주문하기",
    body: "메뉴를 누르고 담은 뒤 ‘주문하기’. 입금자명과 휴대폰 번호를 넣고 한 번 더 ‘주문하기’를 눌러요.",
  },
  {
    key: "paid",
    frame: "console",
    title: "‘입금 확인’ 누르기",
    body: "통장에 입금자명으로 돈이 들어왔는지 보고, 새로 뜬 주문 카드의 ‘입금 확인’을 눌러요.",
  },
  {
    key: "cook",
    frame: "console",
    title: "‘조리 시작’ 누르기",
    body: "주방에 주문을 넘기면서 눌러요.",
  },
  {
    key: "ready",
    frame: "console",
    title: "‘준비 완료’ 누르기",
    body: "음식이 다 되면 눌러요. 손님 화면에 준비됐다고 떠요.",
  },
  {
    key: "complete",
    frame: "console",
    title: "‘완료’ 누르기",
    body: "테이블에 가져다준 뒤 눌러요. 주문은 처리 중 목록에서 빠져요.",
  },
  {
    key: "release",
    frame: "board",
    title: `손님이 나가면 ${TABLE}을 눌러 비우기`,
    body: "주문이 끝나도 자리는 저절로 비지 않아요. 손님이 일어난 걸 보고 직접 눌러요.",
  },
];

function stepsDone(order, table) {
  const index = order ? STATUS_INDEX[order.status] ?? -1 : -1;
  const canceled = order?.status === "CANCELED";
  return {
    order: Boolean(order),
    paid: canceled || index >= 1,
    cook: canceled || index >= 2,
    ready: canceled || index >= 3,
    complete: canceled || index >= 4,
    release: Boolean(order) && (canceled || index >= 4) && table?.occupancyStatus === "AVAILABLE",
  };
}

/* ---------- 방금 일어난 일을 글로 ---------- */
const won = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

function describe(event) {
  const from = FRAME_BY_ID[event.role] ? event.role : "console";
  switch (event.type) {
    case "order.created":
      return {
        from,
        cause: `손님이 ${event.order.tableLabel} 테이블에서 주문했어요 (${won(event.order.totalAmount)})`,
        effects: [
          { frame: "guest", text: "‘주문이 완료되었어요’ 화면으로 넘어가고 입금 계좌가 보여요." },
          { frame: "console", text: `‘새 주문 · ${event.order.tableLabel} 테이블’ 띠가 뜨고, 주문 카드가 ‘입금 대기’로 생겨요.` },
          {
            frame: "board",
            text: event.seated
              ? `${event.order.tableLabel}이 빨간 ‘이용 중 · 방금 앉음’으로 바뀌어요.`
              : `${event.order.tableLabel}은 이미 이용 중이라 앉은 시간이 그대로예요.`,
          },
        ],
      };
    case "order.status": {
      const table = event.order.tableLabel;
      const map = {
        PAID: {
          cause: `스태프가 ${table} 주문의 ‘입금 확인’을 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘입금이 확인됐어요’로 바뀌고 입금 계좌 안내가 사라져요." },
            { frame: "console", text: "주문 카드가 ‘입금 확인’으로 바뀌고 다음 버튼이 ‘조리 시작’이 돼요." },
          ],
        },
        PREPARING: {
          cause: `스태프가 ${table} 주문의 ‘조리 시작’을 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘조리 중이에요’로 바뀌어요." },
            { frame: "console", text: "주문 카드가 ‘조리 중’으로 바뀌어요." },
          ],
        },
        READY: {
          cause: `스태프가 ${table} 주문의 ‘준비 완료’를 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘준비가 끝났어요!’로 바뀌어요." },
            { frame: "console", text: "주문 카드가 ‘준비 완료’로 바뀌어요." },
          ],
        },
        COMPLETED: {
          cause: `스태프가 ${table} 주문의 ‘완료’를 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘맛있게 드세요!’로 바뀌어요." },
            { frame: "console", text: "‘처리 중’ 목록에서 빠져요. ‘오늘 전체’를 누르면 다시 볼 수 있어요." },
            { frame: "board", quiet: true, text: `${table}은 그대로 ‘이용 중’이에요. 자리는 저절로 비지 않아요.` },
          ],
        },
        CANCELED: {
          cause: `스태프가 ${table} 주문을 취소했어요`,
          effects: [
            { frame: "guest", text: "‘주문이 취소되었어요’로 바뀌어요." },
            { frame: "console", text: "‘처리 중’ 목록에서 빠져요." },
            { frame: "board", quiet: true, text: `${table}은 그대로 ‘이용 중’이에요. 손님이 나갔으면 직접 비워요.` },
          ],
        },
      };
      return map[event.order.status] ? { from, ...map[event.order.status] } : null;
    }
    case "table.occupied":
      return {
        from,
        cause: `스태프가 ${event.table.tableName}을 ‘이용 중’으로 바꿨어요`,
        effects: [
          { frame: "board", text: `${event.table.tableName}이 빨간 ‘이용 중 · 방금 앉음’이 돼요.` },
          { frame: "console", text: `‘자리’의 ${event.table.tableName}도 이용 중으로 바뀌어요.` },
          { frame: "guest", quiet: true, text: "손님이 보는 주점 화면의 ‘남은 자리’가 하나 줄어요." },
        ],
      };
    case "table.released":
      return {
        from,
        cause: `스태프가 ${event.table.tableName}을 비웠어요`,
        effects: [
          { frame: "board", text: `${event.table.tableName}이 초록 ‘빈 자리’로 돌아와요.` },
          { frame: "console", text: `‘자리’의 ${event.table.tableName}도 빈 자리로 바뀌어요.` },
          { frame: "guest", quiet: true, text: "손님이 보는 주점 화면의 ‘남은 자리’가 하나 늘어요." },
        ],
      };
    case "booth.updated": {
      if (!event.soldOut?.length) return null;
      const item = event.soldOut[0];
      return {
        from,
        cause: `스태프가 ‘${item.name}’을 ${item.soldOut ? "품절" : "다시 판매"}로 바꿨어요`,
        effects: [
          {
            frame: "guest",
            quiet: true,
            text: item.soldOut
              ? `메뉴 화면을 다시 열면 ‘${item.name}’이 품절로 보이고 담을 수 없어요.`
              : `메뉴 화면을 다시 열면 ‘${item.name}’을 다시 담을 수 있어요.`,
          },
        ],
      };
    }
    case "order.config":
      if (!event.toggled) return null;
      return {
        from,
        cause: `스태프가 ‘QR 주문 받기’를 ${event.orderEnabled ? "켰어요" : "껐어요"}`,
        effects: [
          {
            frame: "guest",
            quiet: true,
            text: event.orderEnabled
              ? "메뉴 화면을 다시 열면 주문할 수 있어요."
              : "메뉴 화면을 다시 열면 ‘지금은 주문을 받지 않아요’가 뜨고 담을 수 없어요.",
          },
        ],
      };
    default:
      return null;
  }
}

/* ---------- iframe 속에서 '지금 누를 곳' 찾기 ---------- */
const RING_ID = "ffdemo-ring";
// 진짜 화면의 버튼은 건드리지 않는다. 버튼 자리에 맞춰 테두리만 따로 얹는다.
const RING_STYLE = `
#${RING_ID} {
  position: fixed;
  z-index: 2147483000;
  display: none;
  pointer-events: none;
  border: 3px solid #ff6a3d;
  box-shadow: 0 0 0 0 rgba(255, 106, 61, 0.55);
  animation: ffdemo-ring 1.2s ease-in-out infinite;
}
@keyframes ffdemo-ring {
  50% { box-shadow: 0 0 0 11px rgba(255, 106, 61, 0); }
}`;

function ensureRing(doc) {
  let ring = doc.getElementById(RING_ID);
  if (ring) return ring;
  const style = doc.createElement("style");
  style.textContent = RING_STYLE;
  doc.head.appendChild(style);
  ring = doc.createElement("div");
  ring.id = RING_ID;
  ring.setAttribute("aria-hidden", "true");
  doc.body.appendChild(ring);
  return ring;
}

function findTarget(stepKey, doc, order) {
  const pick = (selector) => doc.querySelector(selector);
  const path = decodeURIComponent(doc.location?.pathname || "");
  if (stepKey === "order") {
    if (path.startsWith("/orders/")) return pick(".od-fixed .od-ghost");
    if (path.endsWith("/checkout")) {
      const name = pick("#od-depositor");
      if (name && !name.value.trim()) return name;
      const phone = pick("#od-phone");
      if (phone && !/^0\d{9,10}$/.test(phone.value.replace(/\D/g, ""))) return phone;
      return pick(".od-fixed .od-cta:not(:disabled)");
    }
    if (pick(".od-sheet")) return pick(".od-sheet .od-cta");
    return pick(".od-cartbar") || pick(".od-menu-item:not(:disabled)");
  }
  if (stepKey === "release") {
    return [...doc.querySelectorAll(".tb-table")].find((button) => button.querySelector("strong")?.textContent.trim() === TABLE) || null;
  }
  if (!order) return null;
  const card = [...doc.querySelectorAll(".ops-order")].find((node) =>
    node.querySelector(".ops-order__meta")?.textContent.includes(`#${order.orderNo}`),
  );
  return card?.querySelector(".ops-btn--primary") || null;
}

function scrollToTarget(doc, element) {
  const view = doc.defaultView;
  if (!view) return;
  // 주문 카드 안의 버튼이면 카드가 통째로 보이게 맞춘다(위쪽 붙박이 머리글에 가리지 않게).
  const card = element.closest(".ops-order");
  const rect = (card || element).getBoundingClientRect();
  const top = card ? 132 : 96;
  if (rect.top >= top && rect.bottom <= view.innerHeight - 72) return;
  // iframe 안에서만 움직인다(scrollIntoView 는 바깥 페이지까지 끌고 간다).
  const offset = card ? top + 12 : view.innerHeight * 0.38;
  view.scrollTo({ top: Math.max(0, view.scrollY + rect.top - offset), behavior: "smooth" });
}

function useWide() {
  const query = "(min-width: 1080px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}

/* ---------- 폰 화면 한 개 ---------- */
function Phone({ frame, generation, wide, hidden, changed, isNext, frameRef }) {
  const screenRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 700 });

  // 넓은 화면에서는 폰 폭(390)으로 그린 화면을 칸에 맞게 줄여 보여 준다.
  useEffect(() => {
    if (!wide || !screenRef.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const scale = Math.min(1, entry.contentRect.width / 390);
      setFit({ scale, height: Math.round(entry.contentRect.height / scale) });
    });
    observer.observe(screenRef.current);
    return () => observer.disconnect();
  }, [wide]);

  return (
    <section
      className={`lg-phone${hidden ? " lg-phone--hidden" : ""}${changed ? " lg-phone--changed" : ""}${isNext ? " lg-phone--next" : ""}`}
      aria-hidden={hidden ? "true" : undefined}
    >
      <header className="lg-phone__head">
        <span className={`lg-who lg-who--${frame.staff ? "staff" : "guest"}`}>{frame.who}</span>
        <div>
          <strong>{frame.label}</strong>
          <small>{frame.sub}</small>
        </div>
        {changed ? <em className="lg-phone__flag">방금 바뀜</em> : isNext ? <em className="lg-phone__flag lg-phone__flag--next">여기를 눌러요</em> : null}
      </header>
      <div className="lg-phone__screen" ref={screenRef}>
        <iframe
          key={generation}
          ref={frameRef}
          name={`ffdemo:${frame.id}`}
          title={`${frame.who} · ${frame.label}`}
          src={frame.home}
          style={wide ? { transform: `scale(${fit.scale})`, height: fit.height } : undefined}
        />
      </div>
    </section>
  );
}

/* ---------- 페이지 ---------- */
export default function LiveGuidePage() {
  const host = useMemo(getHost, []);
  const wide = useWide();
  const [generation, setGeneration] = useState(0);
  const [snap, setSnap] = useState(() => host.server.snapshot());
  const [log, setLog] = useState([]);
  const [changed, setChanged] = useState({});
  const [tab, setTab] = useState("guest");
  const [notice, setNotice] = useState("");
  const [closedResult, setClosedResult] = useState(0);
  const frameRefs = useRef({});
  const logId = useRef(0);

  useEffect(() => {
    document.title = "눌러 보는 운영 매뉴얼 · Fest-A";
    document.documentElement.classList.add("lg-root");
    return () => document.documentElement.classList.remove("lg-root");
  }, []);

  // 연습용 서버에서 일어난 일을 듣는다.
  useEffect(() => {
    const timers = new Set();
    const off = host.server.listen((event) => {
      setSnap(host.server.snapshot());
      const entry = describe(event);
      if (!entry) return;
      logId.current += 1;
      setLog((current) => [{ id: logId.current, ...entry }, ...current].slice(0, 6));
      // quiet: 그 화면을 다시 열어야 보이는 변화. '방금 바뀜' 표시는 붙이지 않는다.
      const touched = entry.effects.filter((effect) => !effect.quiet && effect.frame !== entry.from).map((effect) => effect.frame);
      setChanged(Object.fromEntries(touched.map((id) => [id, logId.current])));
      const stamp = logId.current;
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setChanged((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== stamp)));
      }, 6000);
      timers.add(timer);
    });
    host.onBlocked = () => {
      setNotice("연습 화면에서는 주문 · 운영 화면만 열려요.");
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setNotice("");
      }, 3000);
      timers.add(timer);
    };
    return () => {
      off();
      host.onBlocked = null;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [host]);

  const order = useMemo(
    () => snap.orders.filter((item) => !item.seed).sort((a, b) => b.id - a.id)[0] || null,
    [snap],
  );
  const table = useMemo(() => snap.tables.find((item) => item.tableName === TABLE) || null, [snap]);
  const done = stepsDone(order, table);
  const currentIndex = STEPS.findIndex((step) => !done[step.key]);
  const current = currentIndex >= 0 ? STEPS[currentIndex] : null;
  const canceled = order?.status === "CANCELED";

  // 지금 누를 곳: iframe 속 진짜 버튼을 찾아(0.35초마다) 그 위에 테두리를 맞춰 얹는다(매 프레임).
  useEffect(() => {
    const targets = {};
    const seen = new WeakSet();
    const docOf = (frame) => {
      try {
        const doc = frameRefs.current[frame.id]?.contentDocument;
        return doc?.body ? doc : null;
      } catch {
        return null;
      }
    };
    const find = () => {
      FRAMES.forEach((frame) => {
        const doc = docOf(frame);
        const target = doc && current && current.frame === frame.id ? findTarget(current.key, doc, order) : null;
        targets[frame.id] = target;
        if (target && !seen.has(target)) {
          seen.add(target);
          scrollToTarget(doc, target);
        }
      });
    };
    let raf = 0;
    const place = () => {
      FRAMES.forEach((frame) => {
        const doc = docOf(frame);
        if (!doc) return;
        const ring = ensureRing(doc);
        const target = targets[frame.id];
        if (!target || !target.isConnected) {
          ring.style.display = "none";
          return;
        }
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          ring.style.display = "none";
          return;
        }
        const radius = parseFloat(doc.defaultView.getComputedStyle(target).borderTopLeftRadius) || 10;
        ring.style.display = "block";
        ring.style.left = `${rect.left - 5}px`;
        ring.style.top = `${rect.top - 5}px`;
        ring.style.width = `${rect.width + 10}px`;
        ring.style.height = `${rect.height + 10}px`;
        ring.style.borderRadius = `${Math.min(radius + 5, (rect.height + 10) / 2)}px`;
      });
      raf = window.requestAnimationFrame(place);
    };
    find();
    place();
    const timer = window.setInterval(find, 350);
    return () => {
      window.clearInterval(timer);
      window.cancelAnimationFrame(raf);
    };
  }, [current, order, generation]);

  const restart = useCallback(() => {
    host.reset();
    setSnap(host.server.snapshot());
    setLog([]);
    setChanged({});
    setTab("guest");
    setClosedResult(0);
    setGeneration((value) => value + 1);
  }, [host]);

  const openTab = (id) => {
    setTab(id);
    setClosedResult(logId.current);
    setChanged((currentChanged) => Object.fromEntries(Object.entries(currentChanged).filter(([key]) => key !== id)));
  };

  const latest = log[0] || null;
  // 폰에서 '방금 일어난 일' 카드가 권하는 다음 화면: 다음에 누를 화면, 아니면 방금 바뀐 다른 화면.
  const peekFrame = latest
    ? [current?.frame, ...latest.effects.filter((effect) => !effect.quiet).map((effect) => effect.frame)].find((id) => id && id !== tab) || null
    : null;

  const sheetOpen = !wide && Boolean(latest) && closedResult !== latest.id;

  const resultBody = latest && (
    <>
      <span className="lg-result__label">방금 일어난 일</span>
      <strong>{latest.cause}</strong>
      <ul>
        {latest.effects.map((effect) => (
          <li key={`${latest.id}-${effect.frame}`}>
            <button
              type="button"
              className={`lg-chip lg-chip--${FRAME_BY_ID[effect.frame].staff ? "staff" : "guest"}`}
              onClick={() => openTab(effect.frame)}
            >
              {FRAME_BY_ID[effect.frame].label}
            </button>
            <span>{effect.text}</span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className={`lg-page${wide ? " lg-page--wide" : ""}`}>
      <header className="lg-top">
        <div className="lg-top__title">
          <a href="/guide/" className="lg-top__back" aria-label="운영 매뉴얼로">
            ←
          </a>
          <div>
            <strong>눌러 보는 운영 매뉴얼</strong>
            <small>주점 · 테이블 QR 주문</small>
          </div>
        </div>
        <div className="lg-top__side">
          <span className="lg-badge">연습 화면 · 실제 주문이 아니에요</span>
          <button type="button" className="lg-btn lg-btn--ghost" onClick={restart}>
            처음부터
          </button>
        </div>
      </header>

      <div className="lg-side">
      <section className="lg-coach" aria-live="polite">
        <ol className="lg-steps">
          {STEPS.map((step, index) => (
            <li
              key={step.key}
              className={done[step.key] ? "is-done" : index === currentIndex ? "is-current" : ""}
              aria-label={`${index + 1}단계 ${step.title}`}
            >
              {done[step.key] ? "✓" : index + 1}
            </li>
          ))}
        </ol>

        <div className="lg-coach__body">
          {current ? (
            <div className="lg-now">
              <span className="lg-now__label">
                지금 할 일 · {currentIndex + 1}/{STEPS.length}
              </span>
              <h1>
                <span className={`lg-who lg-who--${FRAME_BY_ID[current.frame].staff ? "staff" : "guest"}`}>
                  {FRAME_BY_ID[current.frame].who} · {FRAME_BY_ID[current.frame].label}
                </span>
                {canceled && current.key === "release" ? `취소된 주문이에요. ${current.title}` : current.title}
              </h1>
              <p>{current.body}</p>
              {!wide && tab !== current.frame && !sheetOpen && (
                <button type="button" className="lg-btn lg-btn--primary" onClick={() => openTab(current.frame)}>
                  {FRAME_BY_ID[current.frame].label} 화면 보기 →
                </button>
              )}
            </div>
          ) : (
            <div className="lg-now">
              <span className="lg-now__label">한 바퀴 끝</span>
              <h1>이제 마음대로 눌러 보세요</h1>
              <p>아래처럼 눌러 보면, 그때마다 다른 화면이 어떻게 바뀌는지 알려 줘요.</p>
              <ul className="lg-ideas">
                <li>주문 콘솔에서 주문을 ‘취소’하면 손님 화면은?</li>
                <li>주문 콘솔 ‘메뉴판’에서 품절로 바꾸면 손님 메뉴는?</li>
                <li>자리 현황판에서 빈 자리를 누르면? (주문 없이 앉은 손님)</li>
              </ul>
              <button type="button" className="lg-btn lg-btn--primary" onClick={restart}>
                처음부터 다시 해 보기
              </button>
            </div>
          )}

          {wide && latest && <div className="lg-result">{resultBody}</div>}
        </div>
      </section>

      {log.length > 1 && (
        <section className="lg-log">
          <h2>지금까지 눌러 본 것</h2>
          <ol>
            {log.slice(1).map((entry) => (
              <li key={entry.id}>
                <strong>{entry.cause}</strong>
                <span>
                  {entry.effects
                    .filter((effect) => effect.frame !== entry.from)
                    .map((effect) => `${FRAME_BY_ID[effect.frame].label}: ${effect.text}`)
                    .join(" ")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      </div>

      {!wide && (
        <nav className="lg-tabs" aria-label="화면 고르기">
          {FRAMES.map((frame) => (
            <button
              key={frame.id}
              type="button"
              className={`lg-tab${tab === frame.id ? " is-on" : ""}`}
              aria-pressed={tab === frame.id}
              onClick={() => openTab(frame.id)}
            >
              <small>{frame.who}</small>
              {frame.label}
              {changed[frame.id] && tab !== frame.id ? <i aria-label="방금 바뀜" /> : null}
            </button>
          ))}
        </nav>
      )}

      <div className="lg-stage">
        {FRAMES.map((frame) => (
          <Phone
            key={frame.id}
            frame={frame}
            generation={generation}
            wide={wide}
            hidden={!wide && tab !== frame.id}
            changed={Boolean(changed[frame.id])}
            isNext={Boolean(current) && current.frame === frame.id && !changed[frame.id]}
            frameRef={(node) => {
              frameRefs.current[frame.id] = node;
            }}
          />
        ))}
        {sheetOpen && (
          <div className="lg-sheet" key={latest.id}>
            {resultBody}
            <div className="lg-sheet__actions">
              {peekFrame && (
                <button type="button" className="lg-btn lg-btn--primary" onClick={() => openTab(peekFrame)}>
                  {FRAME_BY_ID[peekFrame].label} 화면 보기 →
                </button>
              )}
              <button type="button" className="lg-btn lg-btn--ghost" onClick={() => setClosedResult(latest.id)}>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>

      {notice && (
        <div className="lg-toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
