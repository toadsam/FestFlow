import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./index.css";
import "leaflet/dist/leaflet.css";
import AiMatchPage from "./pages/AiMatchPage";
import AiMatchAdminPage from "./pages/AiMatchAdminPage";
import AdminPage from "./pages/AdminPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import BoothDetailPage from "./pages/BoothDetailPage";
import ChatPage from "./pages/ChatPage";
import EventPage from "./pages/EventPage";
import HomePage from "./pages/HomePage";
import LineupPage from "./pages/LineupPage";
import LostFoundPage from "./pages/LostFoundPage";
import MorePage from "./pages/MorePage";
import OpsBoothPage from "./pages/OpsBoothPage";
import OpsMasterPage from "./pages/OpsMasterPage";
import OpsSimulationPage from "./pages/OpsSimulationPage";
import StaffPage from "./pages/StaffPage";
import StageCrowdPage from "./pages/StageCrowdPage";
import StageMapPage from "./pages/StageMapPage";

function routeElement(Page) {
  return <Page />;
}

const isLocalRuntime =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

if ((!import.meta.env.PROD || isLocalRuntime) && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  }).catch(() => {});

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys
        .filter((key) => key.startsWith("fest-") || key.startsWith("festflow-"))
        .forEach((key) => caches.delete(key));
    }).catch(() => {});
  }
}

if (import.meta.env.PROD && !isLocalRuntime && "serviceWorker" in navigator) {
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
            <Route index element={routeElement(HomePage)} />
            <Route path="stage-map" element={routeElement(StageMapPage)} />
            <Route path="events" element={routeElement(EventPage)} />
            <Route path="events/lineup" element={routeElement(LineupPage)} />
            <Route path="analytics" element={routeElement(AnalyticsPage)} />
            <Route path="analytics/stage" element={routeElement(StageCrowdPage)} />
            <Route path="booths/:id" element={routeElement(BoothDetailPage)} />
            <Route path="lost-found" element={routeElement(LostFoundPage)} />
            <Route path="chat" element={routeElement(ChatPage)} />
            <Route path="staff" element={routeElement(StaffPage)} />
            <Route path="more" element={routeElement(MorePage)} />
            <Route path="admin" element={routeElement(AdminPage)} />
            <Route path="ops/master" element={routeElement(OpsMasterPage)} />
            <Route path="ops/simulation" element={routeElement(OpsSimulationPage)} />
            <Route path="ops/booth/:id" element={routeElement(OpsBoothPage)} />
            <Route path="ai-match" element={routeElement(AiMatchPage)} />
            <Route path="ai-match/admin" element={routeElement(AiMatchAdminPage)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
);
