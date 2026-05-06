import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "./i18n";

const allTabs = [
  { to: "/", label: "Home", icon: "H", end: true },
  { to: "/events", label: "Events", icon: "E" },
  { to: "/stage-map", label: "Stage", icon: "S" },
  { to: "/analytics", label: "Data", icon: "D" },
  { to: "/lost-found", label: "Lost", icon: "L" },
  { to: "/staff", label: "Staff", icon: "T" },
  { to: "/chat", label: "Chat", icon: "C" },
  { to: "/ops/master", label: "Ops", icon: "O" },
];

const quickTabs = [
  { to: "/", label: "Home", icon: "H", end: true },
  { to: "/stage-map", label: "Stage", icon: "S" },
  { to: "/events", label: "Events", icon: "E" },
];

const DISPLAY_MODE_KEY = "festflow_display_mode";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();

  const [noticeMessage, setNoticeMessage] = useState("");
  const [outdoorMode, setOutdoorMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPLAY_MODE_KEY) === "outdoor";
  });

  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [globalBursts, setGlobalBursts] = useState([]);

  useEffect(() => {
    window.localStorage.setItem(
      DISPLAY_MODE_KEY,
      outdoorMode ? "outdoor" : "neon",
    );
  }, [outdoorMode]);

  useEffect(() => {
    setQuickMenuOpen(false);
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
      if (shell.dataset.displayMode === "outdoor") return;
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

  function isActiveTab(tab) {
    return tab.end
      ? location.pathname === tab.to
      : location.pathname.startsWith(tab.to);
  }

  function selectQuickTab(tab) {
    setQuickMenuOpen(false);
    navigate(tab.to);
  }

  return (
    <div
      className="mx-auto app-shell neon-shell relative"
      data-display-mode={outdoorMode ? "outdoor" : "neon"}
    >
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
              className="mt-1 text-2xl font-extrabold neon-title glitch-title cursor-pointer select-none"
              data-text="ACENTIA FESTFLOW"
              role="link"
              tabIndex={0}
              aria-label="홈으로 이동"
              onClick={() => navigate("/")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("/");
                }
              }}
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="언어 변경"
                aria-pressed={language === "en"}
                onClick={toggleLanguage}
                className="text-[11px] px-3 py-1.5 min-h-11 rounded-lg neon-btn-outline whitespace-nowrap"
              >
                {language === "en" ? "한국어" : "English"}
              </button>
              <button
                type="button"
                aria-pressed={outdoorMode}
                onClick={() => setOutdoorMode((current) => !current)}
                className="text-[11px] px-3 py-1.5 min-h-11 rounded-lg neon-btn-outline whitespace-nowrap"
              >
                {outdoorMode ? "기본 모드" : "야외 모드"}
              </button>
              <button
                type="button"
                onClick={requestNotificationPermission}
                className="text-[11px] px-3 py-1.5 min-h-11 rounded-lg neon-btn-outline whitespace-nowrap"
              >
                Alerts
              </button>
            </div>
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

          {quickMenuOpen && (
            <button
              type="button"
              aria-label="Close quick menu"
              className="fixed inset-0 z-[1280] neon-backdrop"
              onClick={() => setQuickMenuOpen(false)}
            />
          )}

          <div className={`quick-orbit-root ${quickMenuOpen ? "quick-orbit-root-open" : ""}`}>
            {quickMenuOpen && (
              <div
                id="quick-orbit-menu"
                className="quick-orbit-menu"
                aria-label="Quick navigation"
              >
                {allTabs.map((tab, index) => {
                  const active = isActiveTab(tab);
                  const angle = (index * 45 - 90) * (Math.PI / 180);
                  const radius = 112;
                  return (
                    <button
                      key={`quick-orbit-${tab.to}`}
                      type="button"
                      onClick={() => selectQuickTab(tab)}
                      className={`quick-orbit-item border transition-all ${active ? "quick-orbit-item-active" : ""}`}
                      style={{
                        "--orbit-x": `${Math.cos(angle) * radius}px`,
                        "--orbit-y": `${Math.sin(angle) * radius}px`,
                        animationDelay: `${index * 28}ms`,
                      }}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="quick-orbit-icon" aria-hidden>
                        {tab.icon}
                      </span>
                      <span className="quick-orbit-label">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              aria-expanded={quickMenuOpen}
              aria-controls="quick-orbit-menu"
              aria-label={quickMenuOpen ? "Close quick menu" : "Open quick menu"}
              onClick={() => setQuickMenuOpen((prev) => !prev)}
              className={`h-14 w-14 rounded-full border font-bold text-lg radial-fab ${quickMenuOpen ? "neon-radial-close" : "neon-radial-open"}`}
            >
              {quickMenuOpen ? "X" : "+"}
            </button>
          </div>
        </>,
        document.body,
      )}

      <nav
        className="fixed bottom-0 left-1/2 z-[1200] -translate-x-1/2 w-full max-w-[1120px] neon-bottom-nav grid grid-cols-3"
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

    </div>
  );
}
