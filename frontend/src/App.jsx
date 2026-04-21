import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

const allTabs = [
  { to: "/", label: "Home", icon: "H", end: true },
  { to: "/events", label: "Events", icon: "E" },
  { to: "/stage-map", label: "Stage", icon: "S" },
  { to: "/analytics", label: "Data", icon: "D" },
  { to: "/chat", label: "Chat", icon: "C" },
  { to: "/ops/master", label: "Ops", icon: "O" },
];

const quickTabs = [
  { to: "/", label: "Home", icon: "H", end: true },
  { to: "/stage-map", label: "Stage", icon: "S" },
  { to: "/events", label: "Events", icon: "E" },
];

function mod(n, m) {
  return ((n % m) + m) % m;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [noticeMessage, setNoticeMessage] = useState("");
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const [radialOpen, setRadialOpen] = useState(false);
  const [radialIndex, setRadialIndex] = useState(0);
  const [globalBursts, setGlobalBursts] = useState([]);
  const touchStartX = useRef(null);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setSplashFading(true), 1500);
    const hideTimer = window.setTimeout(() => setShowSplash(false), 2000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    setRadialOpen(false);
    const active = allTabs.findIndex((tab) =>
      tab.end
        ? location.pathname === tab.to
        : location.pathname.startsWith(tab.to),
    );
    if (active >= 0) setRadialIndex(active);
  }, [location.pathname]);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    function makeSparks(intensity = 1) {
      return Array.from({ length: 9 }, (_, idx) => ({
        angle: idx * 40 + Math.round(Math.random() * 16),
        distance: Math.round(20 + Math.random() * 26 * intensity),
        hue: Math.round(180 + Math.random() * 140),
        delay: Math.round(Math.random() * 120),
      }));
    }

    function onPointerDown(event) {
      const shell = document.querySelector(".app-shell");
      if (!shell || !shell.contains(event.target)) return;
      if (event.target.closest('[data-burst-scope="local"]')) return;
      const interactive = event.target.closest(
        "button, a, article, .rounded-xl, .rounded-2xl, .rounded-lg",
      );
      if (!interactive) return;

      const burstId = `${Date.now()}-${Math.random()}`;
      const waveId = `wave-${burstId}`;
      const x = event.clientX;
      const y = event.clientY;

      setGlobalBursts((prev) => [
        ...prev.slice(-18),
        {
          id: burstId,
          x,
          y,
          sparks: makeSparks(1),
          wave: { id: waveId, size: 180 },
        },
      ]);
      window.setTimeout(
        () =>
          setGlobalBursts((prev) => prev.filter((item) => item.id !== burstId)),
        760,
      );

      const card = event.target.closest(
        "article, .event-card, .cyber-selectable",
      );
      if (card) {
        const parent = card.parentElement;
        if (parent) {
          parent
            .querySelectorAll(".cyber-selected")
            .forEach((node) => node.classList.remove("cyber-selected"));
        }
        card.classList.add("cyber-selected");
      }
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function skipSplash() {
    setShowSplash(false);
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setNoticeMessage("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNoticeMessage("Browser notifications are enabled.");
    } else {
      setNoticeMessage(
        "Notification permission denied. In-app indicators only.",
      );
    }

    window.setTimeout(() => setNoticeMessage(""), 1500);
  }

  const radialItems = useMemo(() => {
    const len = allTabs.length;
    const offsets = [-2, -1, 0, 1, 2];
    return offsets.map((offset) => {
      const index = mod(radialIndex + offset, len);
      const tab = allTabs[index];

      const angle = 180 + offset * 28;
      const radius = offset === 0 ? 124 : 104;
      const rad = (angle * Math.PI) / 180;
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;

      return { tab, index, x, y, focused: offset === 0 };
    });
  }, [radialIndex]);

  function rotateRadial(delta) {
    setRadialIndex((prev) => mod(prev + delta, allTabs.length));
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchMove(e) {
    if (touchStartX.current == null) return;
    const currentX = e.touches[0]?.clientX ?? touchStartX.current;
    const diff = currentX - touchStartX.current;

    if (Math.abs(diff) > 24) {
      rotateRadial(diff > 0 ? -1 : 1);
      touchStartX.current = currentX;
    }
  }

  function handleTouchEnd() {
    touchStartX.current = null;
  }

  function selectRadial(tab) {
    setRadialOpen(false);
    navigate(tab.to);
  }

  return (
    <div className="mx-auto app-shell neon-shell relative">
      <div className="hud-vignette" aria-hidden />
      <div className="hud-scan" aria-hidden />
      <div className="hud-particles" aria-hidden />
      <header className="neon-header">
        <div className="neon-header-hud">
          <div className="neon-header-grid" aria-hidden />
          <div className="neon-header-core">
            <p className="text-xs tracking-[0.22em] uppercase neon-kicker">
              2026 Ajou Culture Festival
            </p>
            <h1
              className="mt-1 text-2xl font-extrabold neon-title glitch-title"
              data-text="ACENTIA FESTFLOW"
            >
              ACENTIA FESTFLOW
            </h1>
            <p className="text-xs neon-sub mt-1">
              Live Crowd Intel · Stage Signal · Ops Command
            </p>
          </div>
          <div className="neon-header-meta">
            <span>2026.05.20 - 2026.05.21</span>
            <span>AU:SUM</span>
          </div>
        </div>

        <div className="px-5 py-3 neon-divider">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs neon-sub">Festival Control Interface</p>
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="text-[11px] px-3 py-1.5 min-h-11 rounded-lg neon-btn-outline whitespace-nowrap"
            >
              Alerts
            </button>
          </div>
          {noticeMessage && (
            <p className="text-xs mt-2 neon-chip rounded px-2 py-1 inline-block">
              {noticeMessage}
            </p>
          )}
        </div>
      </header>

      <main className="px-4 pb-28 pt-1 cyber-main">
        <Outlet />
      </main>

      {createPortal(
        <>
          <div className="pointer-events-none fixed inset-0 z-[1400] overflow-hidden">
            {globalBursts.map((burst) => (
              <span
                key={burst.id}
                className="fx-burst global-fx"
                style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
              >
                <span className="fx-ring" />
                <span className="fx-core" />
                <span
                  className="fx-wave-lite"
                  style={{ "--wave-size": `${burst.wave.size}px` }}
                />
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

          {radialOpen && (
            <button
              type="button"
              aria-label="Close radial menu"
              className="fixed inset-0 z-[1280] neon-backdrop"
              onClick={() => setRadialOpen(false)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          )}

          <div className="fixed right-4 bottom-24 z-[1300]">
            {radialOpen && (
              <div
                className="relative"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {radialItems.map((item) => (
                  <button
                    key={`radial-${item.tab.to}-${item.index}`}
                    type="button"
                    onClick={() => selectRadial(item.tab)}
                    className={`absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-200 radial-item ${item.focused ? "h-16 w-16 neon-radial-focus scale-100" : "h-12 w-12 neon-radial-item scale-95"}`}
                    style={{
                      transform: `translate(${item.x}px, ${item.y}px)`,
                      animationDelay: `${Math.abs(item.index - radialIndex) * 45}ms`,
                    }}
                  >
                    <span className="block text-base font-bold" aria-hidden>
                      {item.tab.icon}
                    </span>
                    <span className="block text-[10px] font-semibold leading-tight">
                      {item.tab.label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setRadialOpen((prev) => !prev)}
              className={`h-14 w-14 rounded-full border font-bold text-lg radial-fab ${radialOpen ? "neon-radial-close" : "neon-radial-open"}`}
            >
              {radialOpen ? "X" : "+"}
            </button>
          </div>
        </>,
        document.body,
      )}

      <nav
        className="fixed bottom-0 left-1/2 z-[1200] -translate-x-1/2 w-full max-w-[430px] neon-bottom-nav grid grid-cols-3"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      >
        {quickTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `py-2 min-h-11 text-[11px] text-center font-semibold flex flex-col items-center justify-center gap-0.5 ${isActive ? "neon-nav-active" : "neon-nav-idle"}`
            }
          >
            <span aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {showSplash && (
        <div
          className={`fixed inset-0 z-[3000] bg-slate-950 transition-opacity duration-500 ${splashFading ? "opacity-0" : "opacity-100"}`}
        >
          <div className="h-full w-full flex items-start justify-center pt-0">
            <img
              src="/images/스플래시화면.png?v=20260406-1"
              alt="Splash"
              className="w-full max-w-[430px] h-auto object-contain object-top"
            />
            <button
              type="button"
              onClick={skipSplash}
              className="absolute top-4 right-4 rounded-full bg-black/45 px-3 py-2 min-h-11 text-xs font-semibold text-white"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
