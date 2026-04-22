import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createEventStream, downloadEventCsv, fetchEvents } from "../api";
import { IconCalendar, IconDownload, IconMusic, IconTrophy } from "../components/UxIcons";

const statusClassName = {
  예정: "bg-sky-500/20 text-sky-200 border border-sky-300/50",
  진행중: "bg-cyan-400/20 text-cyan-200 border border-cyan-300/50",
  종료: "bg-slate-700/30 text-slate-200 border border-slate-400/40",
};

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export default function EventPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selectedId, setSelectedId] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [bursts, setBursts] = useState([]);
  const [arenaShock, setArenaShock] = useState(false);
  const notifiedRef = useRef(new Set());
  const arenaRef = useRef(null);
  const cursorGlowRef = useRef(null);
  const cursorRafRef = useRef(null);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (cursorRafRef.current) {
        cancelAnimationFrame(cursorRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const stream = createEventStream();

    stream.addEventListener("events", (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents(data);
      } catch {
        // SSE 파싱 오류는 무시합니다.
      }
    });

    return () => stream.close();
  }, []);

  useEffect(() => {
    const now = new Date();
    events.forEach((event) => {
      const diff = new Date(event.startTime) - now;
      const key = `${event.id}-imminent`;

      if (
        event.status === "예정" &&
        diff > 0 &&
        diff <= 15 * 60 * 1000 &&
        !notifiedRef.current.has(key)
      ) {
        notify("공연 임박", `${event.title} 공연이 15분 이내 시작됩니다.`);
        notifiedRef.current.add(key);
      }
    });
  }, [events]);

  const filtered = useMemo(() => {
    if (statusFilter === "전체") return events;
    return events.filter((event) => event.status === statusFilter);
  }, [events, statusFilter]);

  const statusStats = useMemo(() => {
    const counters = { 전체: events.length, 예정: 0, 진행중: 0, 종료: 0 };
    events.forEach((event) => {
      counters[event.status] = (counters[event.status] || 0) + 1;
    });
    return counters;
  }, [events]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return events.find((event) => {
      const diff = new Date(event.startTime) - now;
      return event.status === "예정" && diff > 0 && diff < 60 * 60 * 1000;
    });
  }, [events]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      filtered.some((item) => item.id === prev) ? prev : filtered[0].id,
    );
  }, [filtered]);

  const selectedEvent = useMemo(
    () => filtered.find((event) => event.id === selectedId) || null,
    [filtered, selectedId],
  );

  function triggerShock() {
    setArenaShock(true);
    window.setTimeout(() => setArenaShock(false), 220);
  }

  function spawnBurst(nativeEvent, intensity = 1) {
    const arena = arenaRef.current;
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    const x =
      (nativeEvent?.clientX ?? rect.left + rect.width * 0.6) - rect.left;
    const y = (nativeEvent?.clientY ?? rect.top + 84) - rect.top;
    const id = `${Date.now()}-${Math.random()}`;
    const sparks = Array.from({ length: 10 }, (_, idx) => ({
      angle: idx * 36 + Math.round(Math.random() * 18),
      distance: Math.round(28 + Math.random() * 34 * intensity),
      hue: Math.round(180 + Math.random() * 150),
      delay: Math.round(Math.random() * 120),
    }));
    setBursts((prev) => [...prev.slice(-14), { id, x, y, sparks }]);
    window.setTimeout(
      () => setBursts((prev) => prev.filter((item) => item.id !== id)),
      900,
    );
    triggerShock();
  }

  function handleArenaMouseMove(e) {
    const arena = arenaRef.current;
    const glow = cursorGlowRef.current;
    if (!arena || !glow) return;
    const rect = arena.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (cursorRafRef.current) {
      cancelAnimationFrame(cursorRafRef.current);
    }
    cursorRafRef.current = requestAnimationFrame(() => {
      glow.style.left = `${x}px`;
      glow.style.top = `${y}px`;
      glow.style.opacity = "1";
    });
  }

  function handleArenaMouseLeave() {
    const glow = cursorGlowRef.current;
    if (!glow) return;
    glow.style.opacity = "0";
  }

  function progressPercent(event) {
    const start = new Date(event.startTime).getTime();
    const end = new Date(event.endTime).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || start >= end) return 0;
    if (nowMs <= start) return 0;
    if (nowMs >= end) return 100;
    return Math.round(((nowMs - start) / (end - start)) * 100);
  }

  function countdownLabel(event) {
    const diff = new Date(event.startTime).getTime() - nowMs;
    if (diff <= 0) return "곧 시작";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return (
    <section
      ref={arenaRef}
      data-burst-scope="local"
      className={`cyber-page pt-4 space-y-3 scan-enter events-arena ${arenaShock ? "events-arena-shock" : ""}`}
      onMouseMove={handleArenaMouseMove}
      onMouseLeave={handleArenaMouseLeave}
    >
      <div className="event-grid-noise" aria-hidden />
      <div ref={cursorGlowRef} className="event-cursor-glow" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold glitch-title inline-flex items-center gap-2" data-text="LIVE LINEUP">
          <IconMusic className="h-5 w-5 icon-role-ops" />
          LIVE LINEUP
        </h2>
        <div className="flex items-center gap-1.5">
          <Link
            to="/events/lineup"
            className="event-cta text-xs rounded-lg border border-cyan-300/60 bg-sky-500/15 text-cyan-100 px-2 py-1 min-h-11 shadow-[0_0_16px_rgba(34,211,238,0.35)] inline-flex items-center"
            onClick={(e) => spawnBurst(e.nativeEvent, 1.3)}
          >
            <IconCalendar className="mr-1 h-3.5 w-3.5 icon-role-schedule" />
            라인업 보기
          </Link>
          <button
            type="button"
            onClick={(e) => {
              spawnBurst(e.nativeEvent, 1.35);
              downloadEventCsv();
            }}
            className="event-cta text-xs rounded-lg border border-cyan-300/60 bg-sky-500/15 text-cyan-100 px-2 py-1 min-h-11 shadow-[0_0_16px_rgba(34,211,238,0.35)]"
          >
            <IconDownload className="mr-1 inline h-3.5 w-3.5 icon-role-log" />
            CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {["전체", "예정", "진행중", "종료"].map((label) => (
          <div
            key={`metric-${label}`}
            className="event-metric rounded-lg p-2 text-center"
          >
            <p className="text-[10px] uppercase tracking-[0.12em]">{label}</p>
            <p className="mt-1 text-base font-bold">
              {statusStats[label] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {upcoming && (
        <div className="rounded-xl border border-cyan-300/40 bg-slate-900/80 p-3 text-sm text-cyan-100 event-alert">
          <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-200 inline-flex items-center gap-1">
            <IconCalendar className="h-3.5 w-3.5 icon-role-schedule" />
            Next On Stage
          </p>
          <p className="mt-1 font-semibold">{upcoming.title}</p>
          <p className="text-xs mt-1">
            {upcoming.startTime.replace("T", " ")} · {countdownLabel(upcoming)}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-900/80 p-1">
        {["전체", "예정", "진행중", "종료"].map((status) => (
          <button
            key={status}
            type="button"
            onClick={(e) => {
              spawnBurst(e.nativeEvent, 1.1);
              setStatusFilter(status);
            }}
            className={`event-cta rounded-md py-1.5 min-h-11 text-xs font-semibold ${statusFilter === status ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-cyan-50 shadow-sm" : "text-slate-300"}`}
          >
            {status}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {selectedEvent && (
        <article className="event-highlight rounded-xl border border-cyan-300/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-sm inline-flex items-center gap-1.5">
              <IconTrophy className="h-4 w-4 icon-role-ops" />
              {selectedEvent.title}
            </h3>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusClassName[selectedEvent.status] || "bg-slate-100 text-slate-600"}`}
            >
              {selectedEvent.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-cyan-200">
            {selectedEvent.startTime.replace("T", " ")} ~{" "}
            {selectedEvent.endTime.replace("T", " ")}
          </p>
          <div className="mt-2 h-2 rounded bg-slate-900/70 overflow-hidden">
            <div
              className="h-full event-progress"
              style={{ width: `${progressPercent(selectedEvent)}%` }}
            />
          </div>
        </article>
      )}

      <div className="space-y-2 stagger-list">
        {filtered.map((event, index) => (
          <article
            key={event.id}
            className={`rounded-xl border border-slate-200 p-3 bg-white event-card ${selectedId === event.id ? "event-card-active" : ""}`}
            onClick={(e) => {
              setSelectedId(event.id);
              spawnBurst(e.nativeEvent, 1.2);
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-6 flex justify-center text-slate-400 text-xs">
                {index + 1}
              </div>
              <div className="w-1 h-12 bg-teal-200 rounded" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">{event.title}</h3>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusClassName[event.status] || "bg-slate-100 text-slate-600"}`}
                  >
                    {event.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {event.startTime.replace("T", " ")} ~{" "}
                  {event.endTime.replace("T", " ")}
                </p>
                <div className="mt-2 h-1.5 rounded bg-slate-900/60 overflow-hidden">
                  <div
                    className="event-progress h-full"
                    style={{ width: `${progressPercent(event)}%` }}
                  />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
          선택한 상태의 공연이 없습니다. 관리자에서 공연을 등록하거나, 잠시 후
          새로고침해 주세요.
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {bursts.map((burst) => (
          <span
            key={burst.id}
            className="fx-burst"
            style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
          >
            <span className="fx-ring" />
            <span className="fx-core" />
            {burst.sparks.map((spark, idx) => (
              <span
                key={`${burst.id}-${idx}`}
                className="fx-spark"
                style={{
                  "--a": `${spark.angle}deg`,
                  "--d": `${spark.distance}px`,
                  "--h": spark.hue,
                  animationDelay: `${spark.delay}ms`,
                }}
              />
            ))}
          </span>
        ))}
      </div>
    </section>
  );
}


