import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./index.css";
import "leaflet/dist/leaflet.css";

const AiMatchPage = lazy(() => import("./pages/AiMatchPage"));
const AiMatchAdminPage = lazy(() => import("./pages/AiMatchAdminPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const BoothDetailPage = lazy(() => import("./pages/BoothDetailPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const EventPage = lazy(() => import("./pages/EventPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const LineupPage = lazy(() => import("./pages/LineupPage"));
const LostFoundPage = lazy(() => import("./pages/LostFoundPage"));
const MorePage = lazy(() => import("./pages/MorePage"));
const OpsBoothPage = lazy(() => import("./pages/OpsBoothPage"));
const OpsMasterPage = lazy(() => import("./pages/OpsMasterPage"));
const OpsSimulationPage = lazy(() => import("./pages/OpsSimulationPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const StageMapPage = lazy(() => import("./pages/StageMapPage"));

function PageFallback() {
  return (
    <div className="uni-page min-h-[240px] flex items-center justify-center">
      <p className="text-sm font-semibold text-slate-500">화면을 불러오는 중...</p>
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
      // Service worker registration failure should not block the app.
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
            <Route path="stage-map" element={lazyElement(StageMapPage)} />
            <Route path="events" element={lazyElement(EventPage)} />
            <Route path="events/lineup" element={lazyElement(LineupPage)} />
            <Route path="analytics" element={lazyElement(AnalyticsPage)} />
            <Route path="booths/:id" element={lazyElement(BoothDetailPage)} />
            <Route path="lost-found" element={lazyElement(LostFoundPage)} />
            <Route path="chat" element={lazyElement(ChatPage)} />
            <Route path="staff" element={lazyElement(StaffPage)} />
            <Route path="more" element={lazyElement(MorePage)} />
            <Route path="admin" element={lazyElement(AdminPage)} />
            <Route path="ops/master" element={lazyElement(OpsMasterPage)} />
            <Route path="ops/simulation" element={lazyElement(OpsSimulationPage)} />
            <Route path="ops/booth/:id" element={lazyElement(OpsBoothPage)} />
            <Route path="ai-match" element={lazyElement(AiMatchPage)} />
            <Route path="ai-match/admin" element={lazyElement(AiMatchAdminPage)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
);
