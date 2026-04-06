import { useEffect, useMemo, useState } from 'react';
import { fetchHeatmap, fetchPopularBooths, fetchTrafficHourly } from '../api';

function intensityClass(intensity) {
  if (intensity >= 8) return 'bg-rose-500';
  if (intensity >= 5) return 'bg-orange-400';
  if (intensity >= 3) return 'bg-amber-400';
  return 'bg-emerald-300';
}

export default function AnalyticsPage() {
  const [traffic, setTraffic] = useState([]);
  const [popular, setPopular] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [error, setError] = useState('');

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
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const trafficMax = useMemo(() => Math.max(1, ...traffic.map((item) => item.count)), [traffic]);

  return (
    <section className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">데이터 분석</h2>
        <button type="button" onClick={loadAnalytics} className="text-xs rounded-lg border px-2 py-1 min-h-11">
          새로고침
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-800">시간대별 방문량 (최근 24시간)</h3>
        <div className="mt-3 h-28 flex items-end gap-1 overflow-x-auto">
          {traffic.length === 0 && <p className="text-xs text-slate-600">집계 데이터가 없습니다. 홈에서 GPS를 전송해 보세요.</p>}
          {traffic.map((item) => (
            <div key={item.hour} className="min-w-7 text-center">
              <div
                className="mx-auto w-5 rounded-t bg-cyan-500"
                style={{ height: `${Math.max(6, (item.count / trafficMax) * 100)}px` }}
                title={`${item.hour}: ${item.count}`}
              />
              <p className="mt-1 text-[10px] text-slate-500">{item.hour.slice(-5)}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-800">인기 부스 랭킹 (최근 1시간)</h3>
        <div className="mt-2 space-y-1.5">
          {popular.length === 0 && <p className="text-xs text-slate-600">집계 데이터가 없습니다. 홈에서 GPS를 전송해 보세요.</p>}
          {popular.map((item, idx) => (
            <div key={item.boothId} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
              <p className="text-sm text-slate-700">{idx + 1}. {item.boothName}</p>
              <span className="text-xs font-bold text-teal-700">{item.score}명</span>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-800">혼잡 히트맵 포인트 (최근 1시간)</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {heatmap.length === 0 && <p className="text-xs text-slate-600">집계 데이터가 없습니다. 홈에서 GPS를 전송해 보세요.</p>}
          {heatmap.slice(0, 12).map((point) => (
            <div key={`${point.latitude}-${point.longitude}`} className="rounded-lg border border-slate-200 p-2">
              <div className="flex items-center justify-between">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${intensityClass(point.intensity)}`} />
                <span className="text-xs font-semibold text-slate-600">강도 {point.intensity}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
