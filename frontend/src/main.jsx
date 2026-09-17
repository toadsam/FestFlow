import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./index.css";
import "leaflet/dist/leaflet.css";
// ver2 스타일은 index.css 뒤에 와야 전역 !important 규칙을 이긴다.
import "./styles/v2.css";
import "./styles/v2-overrides.css";
import "./styles/v2-aimatch.css";
import "./styles/v2-hero.css";
import "./styles/v2-tables.css";
import "./styles/v2-splash.css";
import "./styles/v2-ops.css";
import "./styles/v2-admin.css";
import "./styles/saju-theme.css";
import AiMatchPage from "./pages/AiMatchPage";
import AiMatchAdminPage from "./pages/AiMatchAdminPage";
import AdminPage from "./pages/AdminPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import BoothDetailPage from "./pages/BoothDetailPage";
import BoothListPage from "./pages/BoothListPage";
import ChatPage from "./pages/ChatPage";
import EventDetailPage from "./pages/EventDetailPage";
import EventPage from "./pages/EventPage";
import FestivalPage from "./pages/FestivalPage";
import HomePage from "./pages/HomePage";
import LineupPage from "./pages/LineupPage";
import LostFoundPage from "./pages/LostFoundPage";
import MorePage from "./pages/MorePage";
import OpsBoothPage from "./pages/OpsBoothPage";
import OpsSimulationPage from "./pages/OpsSimulationPage";
import OpsTableBoardPage from "./pages/OpsTableBoardPage";
import TableOrderPage from "./pages/order/TableOrderPage";
import TablePickPage from "./pages/order/TablePickPage";
import OrderCheckoutPage from "./pages/order/OrderCheckoutPage";
import OrderStatusPage from "./pages/order/OrderStatusPage";
import TableQrPage from "./pages/order/TableQrPage";
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
            {/* ver2: 첫 화면은 축제 살펴보기. 이전 홈은 지우지 않고 /home-v1 로 옮겨 두었다. */}
            <Route index element={routeElement(FestivalPage)} />
            <Route path="home-v1" element={routeElement(HomePage)} />
            <Route path="booths" element={routeElement(BoothListPage)} />
            {/* 이번 축제는 주점이 하나라 /booths 는 총학 주점으로 바로 간다. 전체 목록은 숨겨 두고 여기서만 연다. */}
            <Route path="booths/all" element={routeElement(BoothListPage)} />
            <Route path="stage-map" element={routeElement(StageMapPage)} />
            <Route path="events" element={routeElement(EventPage)} />
            <Route path="events/lineup" element={routeElement(LineupPage)} />
            <Route path="events/:id" element={routeElement(EventDetailPage)} />
            <Route path="analytics" element={routeElement(AnalyticsPage)} />
            <Route path="analytics/stage" element={routeElement(StageCrowdPage)} />
            <Route path="booths/:id" element={routeElement(BoothDetailPage)} />
            <Route path="lost-found" element={routeElement(LostFoundPage)} />
            <Route path="chat" element={routeElement(ChatPage)} />
            <Route path="staff" element={routeElement(StaffPage)} />
            <Route path="more" element={routeElement(MorePage)} />
            <Route path="admin" element={routeElement(AdminPage)} />
            <Route path="admin/simulation" element={routeElement(OpsSimulationPage)} />
            <Route path="ops/master" element={<Navigate to="/admin" replace />} />
            <Route path="ops/simulation" element={<Navigate to="/admin/simulation" replace />} />
            <Route path="ops/booth/:id" element={routeElement(OpsBoothPage)} />
            <Route path="ops/booth/:id/table-qr" element={routeElement(TableQrPage)} />
            <Route path="ops/booth/:id/tables" element={routeElement(OpsTableBoardPage)} />
            {/* 공용 QR: 테이블을 고른 뒤 주문 화면으로 간다. */}
            <Route path="order/:boothId" element={routeElement(TablePickPage)} />
            <Route path="order/:boothId/:table" element={routeElement(TableOrderPage)} />
            <Route path="order/:boothId/:table/checkout" element={routeElement(OrderCheckoutPage)} />
            <Route path="orders/:orderId" element={routeElement(OrderStatusPage)} />
            <Route path="ai-match" element={routeElement(AiMatchPage)} />
            <Route path="ai-match/admin" element={routeElement(AiMatchAdminPage)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
);
