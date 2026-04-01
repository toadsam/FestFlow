import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import HomePage from './pages/HomePage';
import EventPage from './pages/EventPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ChatPage from './pages/ChatPage';
import BoothDetailPage from './pages/BoothDetailPage';
import AdminPage from './pages/AdminPage';
import './index.css';
import 'leaflet/dist/leaflet.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // 개발/로컬 환경에서 서비스워커 등록 실패는 앱 동작에 치명적이지 않아서 무시합니다.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="events" element={<EventPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="booths/:id" element={<BoothDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
