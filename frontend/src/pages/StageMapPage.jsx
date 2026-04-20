import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";
import { fetchStageCrowd } from "../api";

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
  const mapping = {
    "?ъ쑀": "여유",
    蹂댄넻: "보통",
    "?쇱옟": "혼잡",
    "留ㅼ슦?쇱옟": "매우혼잡",
  };
  return mapping[level] || level;
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

  return (
    <section className="cyber-page pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">노천극장 실시간 인원</h2>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-teal-700 bg-gradient-to-r from-teal-700 via-cyan-600 to-emerald-600 px-3 py-2 text-sm font-semibold text-white"
        >
          새로고침
        </button>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-teal-50 p-2">
            <p className="text-[10px] text-teal-700">현재 추정 인원</p>
            <p className="text-lg font-bold text-teal-800">
              {theater?.crowdCount ?? 0}명
            </p>
          </div>
          <div className="rounded bg-amber-50 p-2">
            <p className="text-[10px] text-amber-700">혼잡도</p>
            <p className="text-sm font-bold text-amber-800">
              {theater?.level || "-"}
            </p>
          </div>
          <div className="rounded bg-indigo-50 p-2">
            <p className="text-[10px] text-indigo-700">업데이트</p>
            <p className="text-xs font-bold text-indigo-800">
              {formatUpdatedAt(stageData?.updatedAt)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMinutesWindow(option.value)}
              className={`rounded-lg py-2 text-xs font-semibold ${minutesWindow === option.value ? "bg-gradient-to-r from-teal-700 via-cyan-600 to-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </article>

      <div className="rounded-2xl overflow-hidden border border-slate-200">
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
                    <p className="text-xs">
                      현재 추정 인원: {theater.crowdCount}명
                    </p>
                    <p className="text-xs text-slate-600">
                      반경: {theater.radiusMeters}m
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            </>
          )}
        </MapContainer>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-800">
          노천극장 혼잡 게이지
        </p>
        <p className="mt-1 text-xs text-slate-600">
          기준 수용치 {theater?.capacityHint ?? 0}명 대비
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded bg-slate-100">
          <div
            className="h-full rounded"
            style={{
              width: `${theater?.capacityHint ? Math.min(100, Math.round((theater.crowdCount / theater.capacityHint) * 100)) : 0}%`,
              backgroundColor: style.fill,
            }}
          />
        </div>
      </article>

      {loading && (
        <p className="text-sm text-slate-600">
          노천극장 데이터를 불러오는 중...
        </p>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </section>
  );
}
