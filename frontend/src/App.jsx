import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "./i18n";
import {
  IconBox,
  IconCalendar,
  IconChart,
  IconChat,
  IconHome,
  IconMapPin,
  IconShield,
  IconUsers,
} from "./components/UxIcons";

const allTabs = [
  { to: "/", label: "홈", icon: IconHome, end: true },
  { to: "/events", label: "공연", icon: IconCalendar },
  { to: "/stage-map", label: "지도", icon: IconMapPin },
  { to: "/analytics", label: "혼잡도", icon: IconChart },
  { to: "/lost-found", label: "분실물", icon: IconBox },
  { to: "/staff", label: "스태프", icon: IconUsers },
  { to: "/chat", label: "챗봇", icon: IconChat },
  { to: "/ops/master", label: "운영", icon: IconShield },
];

const quickTabs = [
  { to: "/", label: "홈", icon: IconHome, end: true },
  { to: "/stage-map", label: "지도", icon: IconMapPin },
  { to: "/events", label: "공연", icon: IconCalendar },
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

  useEffect(() => {
    window.localStorage.setItem(
      DISPLAY_MODE_KEY,
      outdoorMode ? "outdoor" : "default",
    );
  }, [outdoorMode]);

  useEffect(() => {
    setQuickMenuOpen(false);
  }, [location.pathname]);

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setNoticeMessage("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNoticeMessage("브라우저 알림이 켜졌습니다.");
    } else {
      setNoticeMessage(
        "알림 권한이 꺼져 있어 앱 안의 표시만 보여드립니다.",
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
      className="mx-auto app-shell festival-shell relative"
      data-display-mode={outdoorMode ? "outdoor" : "default"}
    >
      <header className="festival-app-header">
        <div className="festival-app-header__main">
          <div>
            <p className="festival-app-kicker">
              2026 아주대학교 축제
            </p>
            <h1
              className="festival-app-title cursor-pointer select-none"
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
              아주대 축제 가이드
            </h1>
            <p className="festival-app-subtitle">
              공연, 부스, 혼잡도를 한눈에 확인하세요
            </p>
          </div>
          <div className="festival-app-meta">
            <span>2026.05.20 - 2026.05.21</span>
            <span>AU:SUM</span>
          </div>
        </div>

        <div className="festival-app-toolbar">
          <div className="festival-app-toolbar__row">
            <p>실시간 축제 안내</p>
            <div className="festival-app-actions">
              <button
                type="button"
                aria-label="언어 변경"
                aria-pressed={language === "en"}
                onClick={toggleLanguage}
                className="festival-control-button"
              >
                {language === "en" ? "한국어" : "English"}
              </button>
              <button
                type="button"
                aria-pressed={outdoorMode}
                onClick={() => setOutdoorMode((current) => !current)}
                className="festival-control-button"
              >
                {outdoorMode ? "기본" : "고대비"}
              </button>
              <button
                type="button"
                onClick={requestNotificationPermission}
                className="festival-control-button"
              >
                알림
              </button>
            </div>
          </div>
          {noticeMessage && (
            <p className="festival-app-toast">
              {noticeMessage}
            </p>
          )}
        </div>
      </header>

      <main className="festival-main">
        <Outlet />
      </main>

      {createPortal(
        <>
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
                  const Icon = tab.icon;
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
                        <Icon className="h-4 w-4" />
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
        className="festival-bottom-nav"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      >
        {quickTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `festival-bottom-nav__item ${isActive ? "festival-bottom-nav__item--active" : ""}`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>

    </div>
  );
}
