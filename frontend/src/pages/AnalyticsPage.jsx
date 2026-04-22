import { useEffect, useMemo, useState } from "react";
import { fetchHeatmap, fetchPopularBooths, fetchTrafficHourly } from "../api";
import { IconChart, IconFlame, IconRefresh, IconTrophy, IconUsers } from "../components/UxIcons";

function intensityClass(intensity) {
  if (intensity >= 8) return "bg-rose-500";
  if (intensity >= 5) return "bg-orange-400";
  if (intensity >= 3) return "bg-amber-400";
  return "bg-emerald-300";
}

export default function AnalyticsPage() {
  const [traffic, setTraffic] = useState([]);
  const [popular, setPopular] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [error, setError] = useState("");

  async function loadAnalytics() {
    try {
      const [trafficData, popularData, heatmapData] = await Promise.all([
        fetchTrafficHourly(),
        fetchPopularBooths(),
        fetchHeatmap(),
      ]);
      setTraffic(trafficData);
      setPopular(popularData);
      setHeatmap(heatmapData);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const trafficMax = useMemo(
    () => Math.max(1, ...traffic.map((item) => item.count)),
    [traffic],
  );
  const totalTraffic = useMemo(
    () => traffic.reduce((sum, item) => sum + (item.count || 0), 0),
    [traffic],
  );
  const topBooth = useMemo(() => popular[0] || null, [popular]);
  const hottestPoint = useMemo(() => {
    if (!heatmap.length) return null;
    return [...heatmap].sort((a, b) => (b.intensity || 0) - (a.intensity || 0))[0];
  }, [heatmap]);

  return (
    <section className="cyber-page pt-4 space-y-3 scan-enter">
      <article className="rounded-2xl border border-cyan-300/65 bg-gradient-to-br from-[#063463] via-[#0b4f86] to-[#1189be] p-4 text-cyan-50 shadow-[0_0_26px_rgba(34,211,238,0.28)]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100/50 bg-cyan-500/25">
              <IconChart className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/95">Festival Insight</p>
              <h2 className="mt-1 text-xl font-extrabold">데이터 분석 대시보드</h2>
              <p className="mt-1 text-xs text-cyan-100/90">방문량 흐름, 인기 부스, 혼잡 포인트를 한 화면에서 확인합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-cyan-300/60 bg-sky-500/20 px-3 py-1.5 min-h-11 text-cyan-100"
          >
            <IconRefresh className="h-3.5 w-3.5" />
            새로고침
          </button>
        </div>
      </article>

      <div className="grid grid-cols-3 gap-2">
        <article className="rounded-xl border border-cyan-300/50 bg-slate-950/70 p-2.5">
          <p className="text-[10px] text-cyan-200/90 inline-flex items-center gap-1"><IconUsers className="h-3.5 w-3.5" />총 방문 집계</p>
          <p className="mt-0.5 text-base font-extrabold text-cyan-100">{totalTraffic.toLocaleString()}명</p>
        </article>
        <article className="rounded-xl border border-cyan-300/50 bg-slate-950/70 p-2.5">
          <p className="text-[10px] text-cyan-200/90 inline-flex items-center gap-1"><IconTrophy className="h-3.5 w-3.5" />현재 1위 부스</p>
          <p className="mt-0.5 text-sm font-bold text-cyan-100 line-clamp-1">{topBooth?.boothName || "-"}</p>
        </article>
        <article className="rounded-xl border border-cyan-300/50 bg-slate-950/70 p-2.5">
          <p className="text-[10px] text-cyan-200/90 inline-flex items-center gap-1"><IconFlame className="h-3.5 w-3.5" />최고 강도 포인트</p>
          <p className="mt-0.5 text-sm font-bold text-cyan-100">{hottestPoint ? `Lv.${hottestPoint.intensity}` : "-"}</p>
        </article>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <article className="rounded-xl border border-cyan-300/50 bg-slate-950/75 p-3">
        <h3 className="text-sm font-semibold text-cyan-100 inline-flex items-center gap-1.5">
          <IconChart className="h-4 w-4" />
          시간대별 방문량 (최근 24시간)
        </h3>
        <div className="mt-3 h-28 flex items-end gap-1 overflow-x-auto">
          {traffic.length === 0 && (
            <p className="text-xs text-cyan-200/80">집계 데이터가 없습니다. 홈에서 GPS를 전송해 보세요.</p>
          )}
          {traffic.map((item) => (
            <div key={item.hour} className="min-w-7 text-center">
              <div
                className="mx-auto w-5 rounded-t bg-gradient-to-t from-cyan-600 to-sky-300 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
                style={{ height: `${Math.max(6, (item.count / trafficMax) * 100)}px` }}
                title={`${item.hour}: ${item.count}`}
              />
              <p className="mt-1 text-[10px] text-cyan-200/70">{item.hour.slice(-5)}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-cyan-300/50 bg-slate-950/75 p-3">
        <h3 className="text-sm font-semibold text-cyan-100 inline-flex items-center gap-1.5">
          <IconTrophy className="h-4 w-4" />
          인기 부스 랭킹 (최근 1시간)
        </h3>
        <div className="mt-2 space-y-1.5">
          {popular.length === 0 && (
            <p className="text-xs text-cyan-200/80">집계 데이터가 없습니다. 홈에서 GPS를 전송해 보세요.</p>
          )}
          {popular.map((item, idx) => (
            <div key={item.boothId} className="flex items-center justify-between rounded-lg border border-cyan-400/25 bg-slate-900/70 px-2 py-1.5">
              <p className="text-sm text-cyan-100">{idx + 1}. {item.boothName}</p>
              <span className="text-xs font-bold text-cyan-300">{item.score}명</span>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-cyan-300/50 bg-slate-950/75 p-3">
        <h3 className="text-sm font-semibold text-cyan-100 inline-flex items-center gap-1.5">
          <IconFlame className="h-4 w-4" />
          혼잡 히트맵 포인트 (최근 1시간)
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {heatmap.length === 0 && (
            <p className="text-xs text-cyan-200/80">집계 데이터가 없습니다. 홈에서 GPS를 전송해 보세요.</p>
          )}
          {heatmap.slice(0, 12).map((point) => (
            <div key={`${point.latitude}-${point.longitude}`} className="rounded-lg border border-cyan-400/25 bg-slate-900/75 p-2">
              <div className="flex items-center justify-between">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${intensityClass(point.intensity)}`} />
                <span className="text-xs font-semibold text-cyan-200/90">강도 {point.intensity}</span>
              </div>
              <p className="mt-1 text-[11px] text-cyan-200/70">{point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
