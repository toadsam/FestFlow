// 눌러 보는 운영 매뉴얼 (/guide/live).
// 손님 · 참가자 화면과 스태프 화면을 진짜 그대로 나란히 띄우고, 한쪽에서 누르면 다른 쪽이 어떻게 바뀌는지 바로 보여 준다.
// 화면은 iframe 속의 실제 페이지이고, 서버만 연습용(demo/demoServer.js)으로 바꿔 끼웠다. 실제 주문 · 실제 서버와는 이어져 있지 않다.
// 흐름(주점 주문 · 사주 소개팅)마다 화면 구성과 순서는 demo/*Scenario.js 에 있다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDemoServer } from "../demo/demoServer";
import { aimatchScenario } from "../demo/aimatchScenario";
import { pubScenario } from "../demo/pubScenario";
import "../styles/live-guide.css";

const SCENARIOS = [pubScenario, aimatchScenario];
const ALL_FRAMES = SCENARIOS.flatMap((scenario) => scenario.frames);
const FRAME_BY_ID = Object.fromEntries(ALL_FRAMES.map((frame) => [frame.id, frame]));

function scenarioFromUrl() {
  const wanted = new URLSearchParams(window.location.search).get("flow");
  return SCENARIOS.find((scenario) => scenario.id === wanted) || SCENARIOS[0];
}

/* ---------- 연습용 서버(페이지에 하나) ---------- */
let hostSingleton = null;
function getHost() {
  if (hostSingleton) return hostSingleton;
  const storages = new Map();
  hostSingleton = {
    server: createDemoServer(),
    rules: Object.fromEntries(ALL_FRAMES.map((frame) => [frame.id, { home: frame.home, allow: frame.allow }])),
    // 화면마다 따로 쓰는 임시 저장소. 운영 키 · 로그인 같은 처음 값은 흐름 파일이 정한다.
    storageFor(role) {
      if (!storages.has(role)) {
        const frame = FRAME_BY_ID[role] || {};
        storages.set(role, { local: new Map(frame.local || []), session: new Map(frame.session || []) });
      }
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

/* ---------- iframe 속에서 '지금 누를 곳' 표시 ---------- */
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

function scrollToTarget(doc, element, anchorSelector) {
  const view = doc.defaultView;
  if (!view) return;
  const bottomLimit = view.innerHeight - 72;
  const own = element.getBoundingClientRect();
  // 카드 안의 버튼이면 카드가 통째로 보이게 맞춘다(위쪽 붙박이 머리글에 가리지 않게). 카드가 화면보다 길면 버튼만 맞춘다.
  const anchor = anchorSelector ? element.closest(anchorSelector) : null;
  const box = anchor?.getBoundingClientRect();
  if (box && box.height <= bottomLimit - 132) {
    if (box.top >= 132 && box.bottom <= bottomLimit) return;
    // iframe 안에서만 움직인다(scrollIntoView 는 바깥 페이지까지 끌고 간다).
    view.scrollTo({ top: Math.max(0, view.scrollY + box.top - 144), behavior: "smooth" });
    return;
  }
  if (own.top >= 96 && own.bottom <= bottomLimit) return;
  view.scrollTo({ top: Math.max(0, view.scrollY + own.top - view.innerHeight * 0.38), behavior: "smooth" });
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

const toneOf = (frame) => (frame?.staff ? "staff" : "guest");

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
        <span className={`lg-who lg-who--${toneOf(frame)}`}>{frame.who}</span>
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
  const [scenario, setScenario] = useState(scenarioFromUrl);
  const [generation, setGeneration] = useState(0);
  const [snap, setSnap] = useState(() => host.server.snapshot());
  const [log, setLog] = useState([]);
  const [changed, setChanged] = useState({});
  const [tab, setTab] = useState(() => scenarioFromUrl().frames[0].id);
  const [notice, setNotice] = useState("");
  const [closedResult, setClosedResult] = useState(0);
  const frameRefs = useRef({});
  const logId = useRef(0);
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;

  useEffect(() => {
    document.title = "눌러 보는 운영 매뉴얼 · Fest-A";
    document.documentElement.classList.add("lg-root");
    return () => document.documentElement.classList.remove("lg-root");
  }, []);

  // 연습용 서버에서 일어난 일을 듣는다.
  useEffect(() => {
    const timers = new Set();
    const later = (fn, ms) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };
    const off = host.server.listen((event) => {
      setSnap(host.server.snapshot());
      // 실제 화면은 다시 볼 때(focus) 바로 새로 읽는다. 연습에서도 그 신호를 줘서 다른 화면이 곧바로 따라오게 한다.
      later(() => {
        Object.values(frameRefs.current).forEach((node) => {
          try {
            node?.contentWindow?.dispatchEvent(new Event("focus"));
          } catch {
            // 닫힌 화면
          }
        });
      }, 250);
      const entry = scenarioRef.current.describe(event);
      if (!entry) return;
      logId.current += 1;
      const stampId = logId.current;
      setLog((current) => [{ id: stampId, ...entry }, ...current].slice(0, 6));
      // quiet: 그 화면에서 눈에 보이게 바뀌는 것이 없는 설명. '방금 바뀜' 표시는 붙이지 않는다.
      const touched = entry.effects.filter((effect) => !effect.quiet && effect.frame !== entry.from).map((effect) => effect.frame);
      setChanged(Object.fromEntries(touched.map((id) => [id, stampId])));
      later(() => setChanged((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== stampId))), 6000);
    });
    host.onBlocked = () => {
      setNotice("연습 화면에서는 이 흐름에 쓰는 화면만 열려요.");
      later(() => setNotice(""), 3000);
    };
    return () => {
      off();
      host.onBlocked = null;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [host]);

  // 시간이 흘러야 끝나는 단계(임시 잠금이 풀림 · 채팅 시간 끝)가 있어서, 조용히 한 번씩 상태를 다시 읽는다.
  useEffect(() => {
    const timer = window.setInterval(() => setSnap(host.server.snapshot()), 2000);
    return () => window.clearInterval(timer);
  }, [host]);

  const { done, context, titles = {} } = useMemo(() => scenario.progress(snap), [scenario, snap]);
  const steps = scenario.steps;
  const currentIndex = steps.findIndex((step) => !done[step.key]);
  const current = currentIndex >= 0 ? steps[currentIndex] : null;
  const currentKey = current?.key || "";
  const currentFrame = current?.frame ? FRAME_BY_ID[current.frame] : null;
  const contextRef = useRef(context);
  contextRef.current = context;

  // 지금 누를 곳: iframe 속 진짜 버튼을 찾아(0.35초마다) 그 위에 테두리를 맞춰 얹는다(매 프레임).
  useEffect(() => {
    const step = scenario.steps.find((item) => item.key === currentKey) || null;
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
      scenario.frames.forEach((frame) => {
        const doc = docOf(frame);
        let target = null;
        if (doc && step && step.frame === frame.id) {
          try {
            target = scenario.findTarget(step.key, doc, contextRef.current);
          } catch {
            target = null;
          }
        }
        targets[frame.id] = target;
        if (target && !seen.has(target)) {
          seen.add(target);
          scrollToTarget(doc, target, scenario.scrollAnchor);
        }
      });
    };
    let raf = 0;
    const place = () => {
      scenario.frames.forEach((frame) => {
        const doc = docOf(frame);
        if (!doc) return;
        const ring = ensureRing(doc);
        const target = targets[frame.id];
        const rect = target?.isConnected ? target.getBoundingClientRect() : null;
        if (!rect || !rect.width || !rect.height) {
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
  }, [scenario, currentKey, generation]);

  const start = useCallback(
    (nextScenario) => {
      host.reset();
      setScenario(nextScenario);
      setSnap(host.server.snapshot());
      setLog([]);
      setChanged({});
      setTab(nextScenario.frames[0].id);
      setClosedResult(0);
      setGeneration((value) => value + 1);
      const url = new URL(window.location.href);
      if (nextScenario === SCENARIOS[0]) url.searchParams.delete("flow");
      else url.searchParams.set("flow", nextScenario.id);
      window.history.replaceState(null, "", url);
    },
    [host],
  );
  const restart = () => start(scenario);

  const openTab = (id) => {
    if (!scenario.frames.some((frame) => frame.id === id)) return;
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
            <button type="button" className={`lg-chip lg-chip--${toneOf(FRAME_BY_ID[effect.frame])}`} onClick={() => openTab(effect.frame)}>
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
            <small>{scenario.subtitle}</small>
          </div>
        </div>
        <nav className="lg-flows" aria-label="흐름 고르기">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lg-flow${item === scenario ? " is-on" : ""}`}
              aria-pressed={item === scenario}
              onClick={() => (item === scenario ? undefined : start(item))}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="lg-top__side">
          <span className="lg-badge">연습 화면 · 실제 서버와 이어져 있지 않아요</span>
          <button type="button" className="lg-btn lg-btn--ghost" onClick={restart}>
            처음부터
          </button>
        </div>
      </header>

      <div className="lg-side">
        <section className="lg-coach" aria-live="polite">
          <ol className="lg-steps" aria-label={`${steps.length}단계 중 ${currentIndex < 0 ? steps.length : currentIndex}단계 끝남`}>
            {steps.map((step, index) => (
              <li key={step.key} className={done[step.key] ? "is-done" : index === currentIndex ? "is-current" : ""} />
            ))}
          </ol>

          <div className="lg-coach__body">
            {current ? (
              <div className="lg-now">
                <span className="lg-now__label">
                  지금 할 일 · {currentIndex + 1}/{steps.length}
                </span>
                <h1>
                  {currentFrame ? (
                    <span className={`lg-who lg-who--${toneOf(currentFrame)}`}>
                      {currentFrame.who} · {currentFrame.label}
                    </span>
                  ) : (
                    <span className="lg-who lg-who--coach">연습용 버튼</span>
                  )}
                  {titles[current.key] || current.title}
                </h1>
                <p>{current.body}</p>
                {current.action ? (
                  <button type="button" className="lg-btn lg-btn--point" onClick={() => scenario.runAction?.(host.server, current.action, context)}>
                    ⏩ {current.action.label}
                  </button>
                ) : null}
                {!wide && currentFrame && tab !== current.frame && !sheetOpen && (
                  <button type="button" className="lg-btn lg-btn--primary" onClick={() => openTab(current.frame)}>
                    {currentFrame.label} 화면 보기 →
                  </button>
                )}
              </div>
            ) : (
              <div className="lg-now">
                <span className="lg-now__label">한 바퀴 끝</span>
                <h1>이제 마음대로 눌러 보세요</h1>
                <p>아래처럼 눌러 보면, 그때마다 다른 화면이 어떻게 바뀌는지 알려 줘요.</p>
                <ul className="lg-ideas">
                  {scenario.ideas.map((idea) => (
                    <li key={idea}>{idea}</li>
                  ))}
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
          {scenario.frames.map((frame) => (
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
        {scenario.frames.map((frame) => (
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
