import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./index.css";
import "leaflet/dist/leaflet.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const EventPage = lazy(() => import("./pages/EventPage"));
const LineupPage = lazy(() => import("./pages/LineupPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const StageMapPage = lazy(() => import("./pages/StageMapPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const BoothDetailPage = lazy(() => import("./pages/BoothDetailPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const OpsMasterPage = lazy(() => import("./pages/OpsMasterPage"));
const OpsBoothPage = lazy(() => import("./pages/OpsBoothPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const LostFoundPage = lazy(() => import("./pages/LostFoundPage"));

function PageFallback() {
  return (
    <div className="cyber-page min-h-[240px] flex items-center justify-center">
      <p className="text-sm font-semibold text-cyan-100">
        화면을 불러오는 중...
      </p>
    </div>
  );
}

function lazyElement(Page) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  );
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // 개발/로컬 환경에서 서비스워커 등록 실패는 앱 동작에 치명적이지 않아서 무시합니다.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={lazyElement(HomePage)} />
            <Route path="events" element={lazyElement(EventPage)} />
            <Route path="events/lineup" element={lazyElement(LineupPage)} />
            <Route path="analytics" element={lazyElement(AnalyticsPage)} />
            <Route path="stage-map" element={lazyElement(StageMapPage)} />
            <Route path="chat" element={lazyElement(ChatPage)} />
            <Route path="lost-found" element={lazyElement(LostFoundPage)} />
            <Route path="admin" element={lazyElement(AdminPage)} />
            <Route path="ops/master" element={lazyElement(OpsMasterPage)} />
            <Route path="ops/booth/:id" element={lazyElement(OpsBoothPage)} />
            <Route path="staff" element={lazyElement(StaffPage)} />
            <Route path="booths/:id" element={lazyElement(BoothDetailPage)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
);
