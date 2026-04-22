import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import HomePage from "./pages/HomePage";
import EventPage from "./pages/EventPage";
import LineupPage from "./pages/LineupPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import StageMapPage from "./pages/StageMapPage";
import ChatPage from "./pages/ChatPage";
import BoothDetailPage from "./pages/BoothDetailPage";
import AdminPage from "./pages/AdminPage";
import OpsMasterPage from "./pages/OpsMasterPage";
import OpsBoothPage from "./pages/OpsBoothPage";
import StaffPage from "./pages/StaffPage";
import LostFoundPage from "./pages/LostFoundPage";
import "./index.css";
import "leaflet/dist/leaflet.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // 개발/로컬 환경에서 서비스워커 등록 실패는 앱 동작에 치명적이지 않아서 무시합니다.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="events" element={<EventPage />} />
          <Route path="events/lineup" element={<LineupPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="stage-map" element={<StageMapPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="lost-found" element={<LostFoundPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="ops/master" element={<OpsMasterPage />} />
          <Route path="ops/booth/:id" element={<OpsBoothPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="booths/:id" element={<BoothDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
