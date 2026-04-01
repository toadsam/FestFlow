import { useMemo, useState } from 'react';
import HomePage from './pages/HomePage';
import EventPage from './pages/EventPage';
import ChatPage from './pages/ChatPage';

const tabs = [
  { id: 'home', label: '홈' },
  { id: 'event', label: '공연' },
  { id: 'chat', label: '챗봇' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');

  const content = useMemo(() => {
    if (activeTab === 'event') return <EventPage />;
    if (activeTab === 'chat') return <ChatPage />;
    return <HomePage />;
  }, [activeTab]);

  return (
    <div className="mx-auto app-shell bg-white/70 backdrop-blur-sm shadow-app border-x border-slate-100">
      <header className="px-5 pt-6 pb-4 bg-gradient-to-r from-teal-700 to-cyan-600 text-white">
        <p className="text-xs tracking-[0.24em] uppercase opacity-80">대학교 축제 MVP</p>
        <h1 className="mt-1 text-2xl font-bold">FestFlow</h1>
      </header>

      <main className="px-4 pb-24">{content}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 grid grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`py-3 text-sm font-semibold ${activeTab === tab.id ? 'text-teal-700 bg-teal-50' : 'text-slate-500'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

