import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

const allTabs = [
  { to: '/', label: '홈', icon: '🏠', end: true },
  { to: '/events', label: '공연', icon: '🎤' },
  { to: '/stage-map', label: '무대지도', icon: '🗺️' },
  { to: '/analytics', label: '분석', icon: '📊' },
  { to: '/chat', label: '챗봇', icon: '💬' },
  { to: '/ops/master', label: '관리', icon: '🛠' },
];

const quickTabs = [
  { to: '/', label: '홈', icon: '🏠', end: true },
  { to: '/stage-map', label: '무대지도', icon: '🗺️' },
  { to: '/events', label: '공연', icon: '🎤' },
];

function mod(n, m) {
  return ((n % m) + m) % m;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [noticeMessage, setNoticeMessage] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const [radialOpen, setRadialOpen] = useState(false);
  const [radialIndex, setRadialIndex] = useState(0);
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
    const active = allTabs.findIndex((tab) => (tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to)));
    if (active >= 0) setRadialIndex(active);
  }, [location.pathname]);

  function skipSplash() {
    setShowSplash(false);
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      setNoticeMessage('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNoticeMessage('브라우저 알림이 활성화되었습니다.');
    } else {
      setNoticeMessage('알림 권한이 거부되어 앱 내 표시만 동작합니다.');
    }

    window.setTimeout(() => setNoticeMessage(''), 1500);
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
    <div className="mx-auto app-shell bg-white/90 backdrop-blur-sm shadow-app border-x border-slate-100 relative">
      <header className="bg-white">
        <img
          src="/images/AUSUM로고모음집/헤더.png"
          alt="헤더 이미지"
          className="w-full h-44 object-cover object-center"
          loading="eager"
          decoding="async"
        />
        <div className="px-5 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs tracking-[0.18em] uppercase text-slate-500">대학교 축제 통합 관리</p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-800">FestFlow</h1>
              <p className="text-xs text-slate-600 mt-1">아주대학교 축제 실시간 부스 혼잡도 · 공연 · 관리자 운영</p>
            </div>
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="text-[11px] px-3 py-1.5 min-h-11 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 whitespace-nowrap"
            >
              알림 권한
            </button>
          </div>
          {noticeMessage && <p className="text-xs mt-2 bg-slate-100 text-slate-700 rounded px-2 py-1 inline-block">{noticeMessage}</p>}
        </div>
      </header>

      <main className="px-4 pb-28 pt-1">
        <Outlet />
      </main>

      {createPortal(
        <>
          {radialOpen && (
            <button
              type="button"
              aria-label="라디얼 메뉴 닫기"
              className="fixed inset-0 z-[1280] bg-slate-900/20"
              onClick={() => setRadialOpen(false)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          )}

          <div className="fixed right-4 bottom-24 z-[1300]">
            {radialOpen && (
              <div className="relative" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                {radialItems.map((item) => (
                  <button
                    key={`radial-${item.tab.to}-${item.index}`}
                    type="button"
                    onClick={() => selectRadial(item.tab)}
                    className={`absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-md transition-all duration-200 radial-item ${item.focused ? 'h-16 w-16 bg-teal-700 border-teal-800 text-white scale-100' : 'h-12 w-12 bg-white border-slate-200 text-slate-700 scale-95'}`}
                    style={{ transform: `translate(${item.x}px, ${item.y}px)`, animationDelay: `${Math.abs(item.index - radialIndex) * 45}ms` }}
                  >
                    <span className="block text-lg" aria-hidden>{item.tab.icon}</span>
                    <span className="block text-[10px] font-semibold leading-tight">{item.tab.label}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setRadialOpen((prev) => !prev)}
              className={`h-14 w-14 rounded-full shadow-lg border text-white font-bold text-lg radial-fab ${radialOpen ? 'bg-rose-600 border-rose-700' : 'bg-teal-700 border-teal-800'}`}
            >
              {radialOpen ? '✕' : '☰'}
            </button>
          </div>
        </>,
        document.body
      )}

      <nav
        className="fixed bottom-0 left-1/2 z-[1200] -translate-x-1/2 w-full max-w-[430px] bg-white/95 backdrop-blur border-t border-slate-200 grid grid-cols-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
      >
        {quickTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `py-2 min-h-11 text-[11px] text-center font-semibold flex flex-col items-center justify-center gap-0.5 ${isActive ? 'text-teal-700 bg-teal-50' : 'text-slate-600'}`
            }
          >
            <span aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {showSplash && (
        <div className={`fixed inset-0 z-[3000] bg-slate-950 transition-opacity duration-500 ${splashFading ? 'opacity-0' : 'opacity-100'}`}>
          <div className="h-full w-full flex items-start justify-center pt-0">
            <img
              src="/images/스플래시화면.png?v=20260406-1"
              alt="스플래시 화면"
              className="w-full max-w-[430px] h-auto object-contain object-top"
            />
            <button
              type="button"
              onClick={skipSplash}
              className="absolute top-4 right-4 rounded-full bg-black/45 px-3 py-2 min-h-11 text-xs font-semibold text-white"
            >
              건너뛰기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
