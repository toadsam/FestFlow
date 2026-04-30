import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";
import { fetchStageCrowd } from "../api";
import { IconClock, IconMapPin, IconRefresh, IconUsers } from "../components/UxIcons";

const OPEN_AIR_THEATER = { latitude: 37.281785, longitude: 127.045501 };

const LEVEL_STYLE = {
  여유: { stroke: "#0f766e", fill: "#14b8a6" },
  보통: { stroke: "#0e7490", fill: "#06b6d4" },
  혼잡: { stroke: "#c2410c", fill: "#fb923c" },
  매우혼잡: { stroke: "#be123c", fill: "#f43f5e" },
};

const WINDOW_OPTIONS = [
  { label: "최근 5분", value: 5 },
  { label: "최근 10분", value: 10 },
  { label: "최근 15분", value: 15 },
];

function normalizeLevel(level) {
  return level;
}

function getLevelStyle(level) {
  return LEVEL_STYLE[level] || LEVEL_STYLE.여유;
}

function formatUpdatedAt(value) {
  if (!value) return "-";
  return value.replace("T", " ").slice(5, 16);
}

export default function StageMapPage() {
  const [minutesWindow, setMinutesWindow] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stageData, setStageData] = useState(null);

  async function load() {
    try {
      const crowdData = await fetchStageCrowd(minutesWindow);
      setStageData(crowdData);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
  }, [minutesWindow]);

  useEffect(() => {
    const timer = window.setInterval(() => load(), 5000);
    return () => window.clearInterval(timer);
  }, [minutesWindow]);

  const theater = useMemo(() => {
    const raw = (stageData?.zones || [])[0] || null;
    return raw ? { ...raw, level: normalizeLevel(raw.level) } : null;
  }, [stageData]);
  const style = getLevelStyle(theater?.level);
  const ratio = theater?.capacityHint
    ? Math.min(1.2, theater.crowdCount / theater.capacityHint)
    : 0;
  const pulseRadius = Math.max(10, Math.round(12 + ratio * 14));
  const occupancyPercent = theater?.capacityHint
    ? Math.min(100, Math.round((theater.crowdCount / theater.capacityHint) * 100))
    : 0;

  return (
    <section className="cyber-page pt-4 space-y-3 scan-enter">
      <article className="rounded-2xl border border-cyan-300/65 bg-gradient-to-br from-[#05345f] via-[#0c5f93] to-[#18b8da] p-4 text-cyan-50 shadow-[0_0_26px_rgba(34,211,238,0.28)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100/50 bg-cyan-500/25">
              <IconMapPin className="h-5 w-5 icon-role-map" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/95">Stage Monitor</p>
              <h2 className="mt-1 text-xl font-extrabold text-role-map">노천극장 실시간 인원</h2>
              <p className="mt-1 text-xs text-cyan-100/90">최근 {minutesWindow}분 기준 군중 밀집도를 시각화합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200/70 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100"
          >
            <IconRefresh className="h-4 w-4 icon-role-log" />
            새로고침
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-cyan-300/50 bg-slate-950/75 p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-cyan-400/35 bg-slate-900/70 p-2">
            <p className="text-[10px] text-cyan-200/80 text-role-ops inline-flex items-center gap-1"><IconUsers className="h-3.5 w-3.5 icon-role-ops" />현재 추정 인원</p>
            <p className="text-lg font-bold text-cyan-100">{theater?.crowdCount ?? 0}명</p>
          </div>
          <div className="rounded border border-cyan-400/35 bg-slate-900/70 p-2">
            <p className="text-[10px] text-cyan-200/80 text-role-map inline-flex items-center gap-1"><IconMapPin className="h-3.5 w-3.5 icon-role-map" />혼잡도</p>
            <p className="text-sm font-bold text-cyan-100">{theater?.level || "-"}</p>
          </div>
          <div className="rounded border border-cyan-400/35 bg-slate-900/70 p-2">
            <p className="text-[10px] text-cyan-200/80 text-role-log inline-flex items-center gap-1"><IconClock className="h-3.5 w-3.5 icon-role-log" />업데이트</p>
            <p className="text-xs font-bold text-cyan-100">{formatUpdatedAt(stageData?.updatedAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMinutesWindow(option.value)}
              className={`rounded-lg py-2 text-xs font-semibold ${
                minutesWindow === option.value
                  ? "bg-gradient-to-r from-cyan-600 to-blue-500 text-white"
                  : "border border-cyan-400/40 bg-slate-900/70 text-cyan-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </article>

      <div className="rounded-2xl overflow-hidden border border-cyan-300/50 shadow-[0_0_18px_rgba(34,211,238,0.2)]">
        <MapContainer
          center={[OPEN_AIR_THEATER.latitude, OPEN_AIR_THEATER.longitude]}
          zoom={18}
          minZoom={18}
          maxZoom={18}
          zoomControl={false}
          dragging={false}
          touchZoom={false}
          doubleClickZoom={false}
          scrollWheelZoom={false}
          boxZoom={false}
          keyboard={false}
          className="h-[74vh] w-full"
        >
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={19}
          />

          {theater && (
            <>
              <Circle
                center={[theater.latitude, theater.longitude]}
                radius={theater.radiusMeters}
                pathOptions={{
                  color: style.stroke,
                  fillColor: style.fill,
                  fillOpacity: 0.22,
                  weight: 2,
                }}
              />
              <CircleMarker
                center={[theater.latitude, theater.longitude]}
                radius={pulseRadius}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: style.fill,
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="space-y-1">
                    <p className="font-bold">{theater.zoneName}</p>
                    <p className="text-xs">혼잡도: {theater.level}</p>
                    <p className="text-xs">현재 추정 인원: {theater.crowdCount}명</p>
                    <p className="text-xs text-slate-600">반경: {theater.radiusMeters}m</p>
                  </div>
                </Popup>
              </CircleMarker>
            </>
          )}
        </MapContainer>
      </div>

      <article className="rounded-xl border border-cyan-300/50 bg-slate-950/75 p-3">
        <p className="text-sm font-semibold text-cyan-100 text-role-ops inline-flex items-center gap-1.5">
          <IconUsers className="h-4 w-4 icon-role-ops" />
          노천극장 혼잡 게이지
        </p>
        <p className="mt-1 text-xs text-cyan-200/80">기준 수용치 {theater?.capacityHint ?? 0}명 대비 {occupancyPercent}%</p>
        <div className="mt-2 h-3 overflow-hidden rounded bg-slate-900/80">
          <div
            className="h-full rounded"
            style={{ width: `${occupancyPercent}%`, backgroundColor: style.fill }}
          />
        </div>
      </article>

      {loading && <p className="text-sm text-cyan-200/80">노천극장 데이터를 불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </section>
  );
}
