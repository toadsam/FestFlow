import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';

const tabs = [
  { to: '/', label: '홈', icon: '🏠', end: true },
  { to: '/events', label: '공연', icon: '🎤' },
  { to: '/analytics', label: '분석', icon: '📊' },
  { to: '/chat', label: '챗봇', icon: '💬' },
  { to: '/admin', label: '관리', icon: '🛠' },
];

export default function App() {
  const [noticeMessage, setNoticeMessage] = useState('');

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

  return (
    <div className="mx-auto app-shell bg-white/90 backdrop-blur-sm shadow-app border-x border-slate-100">
      <header className="px-5 pt-6 pb-5 bg-gradient-to-r from-teal-700 via-cyan-600 to-emerald-600 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs tracking-[0.18em] uppercase opacity-80">대학교 축제 통합 관리</p>
            <h1 className="mt-1 text-2xl font-extrabold">FestFlow</h1>
            <p className="text-xs opacity-85 mt-1">아주대학교 축제 실시간 부스 혼잡도 · 공연 · 관리자 운영</p>
          </div>
          <button
            type="button"
            onClick={requestNotificationPermission}
            className="text-[11px] px-2 py-1.5 rounded-lg bg-white/20 border border-white/40"
          >
            알림 권한
          </button>
        </div>
        {noticeMessage && <p className="text-xs mt-2 bg-white/20 rounded px-2 py-1 inline-block">{noticeMessage}</p>}
      </header>

      <main className="px-4 pb-24 pt-1">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white/95 backdrop-blur border-t border-slate-200 grid grid-cols-5">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `py-2 text-[11px] text-center font-semibold flex flex-col items-center justify-center gap-0.5 ${isActive ? 'text-teal-700 bg-teal-50' : 'text-slate-500'}`
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
