import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./index.css";
import "leaflet/dist/leaflet.css";

const AiMatchPage = lazy(() => import("./pages/AiMatchPage"));
const AiMatchAdminPage = lazy(() => import("./pages/AiMatchAdminPage"));

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
            <Route index element={<Navigate to="/ai-match" replace />} />
            <Route path="ai-match" element={lazyElement(AiMatchPage)} />
            <Route path="ai-match/admin" element={lazyElement(AiMatchAdminPage)} />
            <Route path="*" element={<Navigate to="/ai-match" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
);
