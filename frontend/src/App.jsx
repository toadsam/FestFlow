import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', label: '홈', end: true },
  { to: '/events', label: '공연' },
  { to: '/chat', label: '챗봇' },
];

export default function App() {
  return (
    <div className="mx-auto app-shell bg-white/70 backdrop-blur-sm shadow-app border-x border-slate-100">
      <header className="px-5 pt-6 pb-4 bg-gradient-to-r from-teal-700 to-cyan-600 text-white">
        <p className="text-xs tracking-[0.24em] uppercase opacity-80">대학교 축제 MVP</p>
        <h1 className="mt-1 text-2xl font-bold">FestFlow</h1>
      </header>

      <main className="px-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 grid grid-cols-3">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `py-3 text-sm text-center font-semibold ${isActive ? 'text-teal-700 bg-teal-50' : 'text-slate-500'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
