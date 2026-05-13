import { useEffect, useMemo, useState } from "react";
import {
  createCongestionStream,
  fetchHeatmap,
  fetchPopularBooths,
  fetchStageCrowd,
  fetchTrafficHourly,
} from "../api";
import { IconChart, IconRefresh } from "../components/UxIcons";
import { crowdZones, trafficPrediction } from "../data/festivalUiData";

function level(percent) {
  if (percent >= 75) return "혼잡";
  if (percent >= 45) return "보통";
  return "여유";
}

export default function AnalyticsPage() {
  const [traffic, setTraffic] = useState([]);
  const [popular, setPopular] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [stageCrowd, setStageCrowd] = useState(null);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  async function load() {
    const [trafficResult, popularResult, heatmapResult, stageResult] = await Promise.allSettled([
      fetchTrafficHourly(),
      fetchPopularBooths(),
      fetchHeatmap(),
      fetchStageCrowd(10),
    ]);
    if (trafficResult.status === "fulfilled") setTraffic(trafficResult.value || []);
    if (popularResult.status === "fulfilled") setPopular(popularResult.value || []);
    if (heatmapResult.status === "fulfilled") setHeatmap(heatmapResult.value || []);
    if (stageResult.status === "fulfilled") setStageCrowd(stageResult.value);
    setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    setMessage(
      [trafficResult, popularResult, heatmapResult].some((item) => item.status === "rejected")
        ? "일부 혼잡 정보는 예시 데이터로 표시 중입니다."
        : "",
    );
  }

  useEffect(() => {
    load();

    let stream = null;
    try {
      stream = createCongestionStream();
      stream.addEventListener("congestion", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (Array.isArray(payload)) setHeatmap(payload);
          setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
        } catch {
          // Ignore malformed stream payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    return () => stream?.close();
  }, []);

  const crowdPercent = useMemo(() => {
    if (stageCrowd?.crowdPercent != null) {
      return Math.min(99, Math.max(1, Math.round(Number(stageCrowd.crowdPercent))));
    }
    if (!traffic.length) return 48;
    const latest = Number(traffic[traffic.length - 1]?.count) || 0;
    const max = Math.max(1, ...traffic.map((item) => Number(item.count) || 0));
    return Math.min(99, Math.max(1, Math.round((latest / max) * 100)));
  }, [stageCrowd, traffic]);

  const zoneData = useMemo(() => {
    if (!heatmap.length) return crowdZones;
    return crowdZones.map((zone, index) => {
      const item = heatmap[index] || {};
      const value = item.percent ?? item.value ?? item.intensity;
      return {
        ...zone,
        name: item.zoneName || item.boothName || zone.name,
        value: Math.min(95, Math.max(10, Math.round(Number(value) || zone.value))),
      };
    });
  }, [heatmap]);

  const prediction = useMemo(() => {
    if (!traffic.length) return trafficPrediction;
    return traffic.slice(-6).map((item, index) => ({
      hour: `${item.hour || index}`.slice(-5),
      value: Math.min(95, Math.max(15, Math.round(Number(item.count) || 0))),
    }));
  }, [traffic]);

  return (
    <section className="uni-page crowd-page">
      <header className="plain-page-header">
        <span />
        <h1>혼잡도</h1>
        <button type="button" aria-label="혼잡도 새로고침" onClick={load}>
          <IconRefresh className="h-5 w-5" />
        </button>
      </header>

      <section className="uni-card crowd-detail-card">
        <div className="crowd-score-row">
          <div>
            <p>축제장 전체 혼잡도</p>
            <span>{level(crowdPercent)}</span>
          </div>
          <strong>{crowdPercent}%</strong>
        </div>
        <div className="crowd-meter crowd-meter--large" aria-hidden="true">
          <span className="meter-green" />
          <span className="meter-yellow" />
          <span className="meter-red" />
        </div>
        <div className="crowd-scale">
          <span>0%</span>
          <span>100%</span>
        </div>
        <p className="crowd-note">
          {updatedAt ? `${updatedAt} 갱신` : "실시간 데이터 연결 중"}
          {popular[0] ? ` · 인기 구역 ${popular[0].boothName || popular[0].name}` : ""}
        </p>
      </section>

      {message && <p className="app-inline-note">{message}</p>}

      <section className="uni-section">
        <h2>구역별 혼잡도</h2>
        <div className="crowd-map-card">
          <div className="crowd-map-art">
            <span className="map-road map-road-a" />
            <span className="map-road map-road-b" />
            <span className="map-lawn map-lawn-a" />
            <span className="map-lawn map-lawn-b" />
            {zoneData.map((zone) => (
              <span
                key={zone.name}
                className={`crowd-zone crowd-zone--${zone.tone}`}
                style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
              >
                <strong>{zone.name}</strong>
                <small>{zone.value}%</small>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="uni-card prediction-card">
        <div className="uni-section-head">
          <h2>혼잡도 예측</h2>
          <IconChart className="h-4 w-4" />
        </div>
        <div className="prediction-chart">
          {prediction.map((item) => (
            <div key={item.hour} className="prediction-bar">
              <strong>{item.value}%</strong>
              <span style={{ height: `${Math.max(22, item.value)}px` }} />
              <small>{item.hour}</small>
            </div>
          ))}
        </div>
        <p>혼잡도가 낮은 시간대를 골라 이동하면 대기 시간을 줄일 수 있어요.</p>
      </section>
    </section>
  );
}
