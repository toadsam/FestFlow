import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCongestionStream,
  fetchAiCongestionPredictions,
  fetchAiDecisionLogs,
  fetchAnalyticsDashboard,
} from "../api";
import { IconChart, IconRefresh } from "../components/UxIcons";

const LEVEL_META = {
  LOW: { label: "한산", tone: "calm" },
  NORMAL: { label: "보통", tone: "normal" },
  BUSY: { label: "혼잡", tone: "busy" },
  PACKED: { label: "매우 혼잡", tone: "packed" },
};

const ZONE_LABELS = {
  "ajou-square": "아주광장",
  "lawn-square": "잔디 광장",
  "gym-front": "체육관 앞",
  "student-hall": "학생회관",
  "seongho-hall": "성호관 주변",
  "rear-gate": "후문 거리",
};

const EMPTY_DASHBOARD = {
  updatedAt: null,
  minutesWindow: 15,
  sampleCount: 0,
  overview: {
    percent: 0,
    level: "LOW",
    deltaPercent: 0,
    currentCount: 0,
    previousCount: 0,
  },
  zones: [],
  trend: [],
  recommendation: {
    startTime: null,
    endTime: null,
    expectedPercent: 0,
    reason: "NO_DATA",
  },
};

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function levelMeta(level) {
  return LEVEL_META[level] || LEVEL_META.LOW;
}

function formatUpdatedAt(value) {
  if (!value) return "업데이트 대기";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "업데이트 대기";
  return `업데이트 ${date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function formatDelta(delta) {
  const value = Math.round(Number(delta) || 0);
  if (value === 0) return "이전과 동일";
  return `이전보다 ${value > 0 ? "+" : ""}${value}%`;
}

function deltaTone(delta) {
  const value = Number(delta) || 0;
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "same";
}

function Gauge({ percent }) {
  const value = clampPercent(percent);
  const radius = 50;
  const length = Math.PI * radius;
  const offset = length - (length * value) / 100;
  const angle = Math.PI - (value / 100) * Math.PI;
  const needleX = 70 + 42 * Math.cos(angle);
  const needleY = 70 - 42 * Math.sin(angle);

  return (
    <svg className="analytics-gauge" viewBox="0 0 140 84" role="img" aria-label={`전체 혼잡도 ${value}%`}>
      <defs>
        <linearGradient id="analyticsGaugeGradient" x1="20" y1="0" x2="120" y2="0">
          <stop offset="0%" stopColor="#19c7bd" />
          <stop offset="55%" stopColor="#37c86b" />
          <stop offset="100%" stopColor="#ffc247" />
        </linearGradient>
      </defs>
      <path className="analytics-gauge__track" d="M20 70 A50 50 0 0 1 120 70" pathLength={length} />
      <path
        className="analytics-gauge__value"
        d="M20 70 A50 50 0 0 1 120 70"
        pathLength={length}
        style={{ strokeDasharray: length, strokeDashoffset: offset }}
      />
      <line className="analytics-gauge__needle" x1="70" y1="70" x2={needleX} y2={needleY} />
      <circle className="analytics-gauge__pin" cx="70" cy="70" r="4" />
    </svg>
  );
}

function TrendChart({ points }) {
  const trend = points.length
    ? points
    : Array.from({ length: 8 }, (_, index) => ({
        label: `${String(index * 3).padStart(2, "0")}시`,
        percent: 0,
        count: 0,
        current: index === 5,
      }));
  const width = 320;
  const height = 150;
  const left = 24;
  const right = 14;
  const top = 14;
  const bottom = 28;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const chartPoints = trend.map((item, index) => {
    const x = left + (trend.length === 1 ? chartWidth / 2 : (chartWidth * index) / (trend.length - 1));
    const y = top + chartHeight - (chartHeight * clampPercent(item.percent)) / 100;
    return { ...item, x, y };
  });
  const path = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const active = chartPoints.find((point) => point.current) || chartPoints[chartPoints.length - 1];

  return (
    <div className="analytics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="시간대별 혼잡 추이">
        <line className="analytics-chart__axis" x1={left} y1={top} x2={left} y2={top + chartHeight} />
        <line className="analytics-chart__axis" x1={left} y1={top + chartHeight} x2={width - right} y2={top + chartHeight} />
        {[0, 50, 100].map((tick) => {
          const y = top + chartHeight - (chartHeight * tick) / 100;
          return (
            <g key={tick}>
              <line className="analytics-chart__grid" x1={left} y1={y} x2={width - right} y2={y} />
              <text className="analytics-chart__tick" x="0" y={y + 4}>{tick}%</text>
            </g>
          );
        })}
        <path className="analytics-chart__line" d={path} />
        {active && (
          <g>
            <line className="analytics-chart__marker-line" x1={active.x} y1={top} x2={active.x} y2={top + chartHeight} />
            <circle className="analytics-chart__marker" cx={active.x} cy={active.y} r="4.5" />
            <foreignObject x={Math.min(width - 78, Math.max(28, active.x - 30))} y={Math.max(2, active.y - 42)} width="60" height="36">
              <div className="analytics-chart__bubble">
                <strong>{active.label}</strong>
                <span>{clampPercent(active.percent)}%</span>
              </div>
            </foreignObject>
          </g>
        )}
        {chartPoints.map((point, index) => (
          index % 2 === 0 || index === chartPoints.length - 1 ? (
            <text key={point.label} className="analytics-chart__label" x={point.x} y={height - 6}>
              {point.label}
            </text>
          ) : null
        ))}
      </svg>
    </div>
  );
}

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [aiPredictions, setAiPredictions] = useState([]);
  const [aiDecisionLogs, setAiDecisionLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextDashboard, nextPredictions, nextDecisionLogs] = await Promise.all([
        fetchAnalyticsDashboard(15),
        fetchAiCongestionPredictions().catch(() => []),
        fetchAiDecisionLogs().catch(() => []),
      ]);
      setDashboard({
        ...EMPTY_DASHBOARD,
        ...nextDashboard,
        overview: { ...EMPTY_DASHBOARD.overview, ...(nextDashboard?.overview || {}) },
        recommendation: {
          ...EMPTY_DASHBOARD.recommendation,
          ...(nextDashboard?.recommendation || {}),
        },
        zones: Array.isArray(nextDashboard?.zones) ? nextDashboard.zones : [],
        trend: Array.isArray(nextDashboard?.trend) ? nextDashboard.trend : [],
      });
      setAiPredictions(Array.isArray(nextPredictions) ? nextPredictions : []);
      setAiDecisionLogs(Array.isArray(nextDecisionLogs) ? nextDecisionLogs : []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "실시간 혼잡도 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    let stream = null;
    try {
      stream = createCongestionStream();
      stream.addEventListener("congestion", () => {
        load();
      });
    } catch {
      // Streaming is optional; manual refresh still works.
    }

    return () => stream?.close();
  }, [load]);

  const overviewMeta = levelMeta(dashboard.overview.level);
  const zones = useMemo(() => {
    return [...dashboard.zones]
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 6);
  }, [dashboard.zones]);
  const recommendation = dashboard.recommendation || EMPTY_DASHBOARD.recommendation;
  const hasMeasurements = Number(dashboard.sampleCount) > 0
    || dashboard.trend.some((point) => Number(point.count) > 0);

  return (
    <section className="uni-page analytics-live-page">
      <header className="analytics-live-header">
        <div>
          <h1>실시간 혼잡도</h1>
          <p>GPS 로그 기반으로 캠퍼스 혼잡도를 집계합니다.</p>
        </div>
        <button type="button" aria-label="혼잡도 새로고침" onClick={load} disabled={loading}>
          <IconRefresh className="h-5 w-5" />
        </button>
      </header>

      {message && <p className="app-inline-note app-inline-note--danger">{message}</p>}

      <section className="analytics-overview-card" aria-label="캠퍼스 전체 혼잡도">
        <div className="analytics-overview-copy">
          <span>캠퍼스 전체</span>
          <strong className={`analytics-level analytics-level--${overviewMeta.tone}`}>
            {overviewMeta.label}
            <b>{clampPercent(dashboard.overview.percent)}%</b>
          </strong>
          <small className={`analytics-delta analytics-delta--${deltaTone(dashboard.overview.deltaPercent)}`}>
            {formatDelta(dashboard.overview.deltaPercent)}
          </small>
          <em>
            최근 {dashboard.minutesWindow}분 실측 {Number(dashboard.sampleCount) || 0}건
          </em>
        </div>
        <Gauge percent={dashboard.overview.percent} />
      </section>

      <section className="uni-card">
        <div className="analytics-section-head">
          <h2>AI 30분 혼잡 예측</h2>
          <span>예약·체크인·GPS·공연 영향 반영</span>
        </div>
        <div className="grid gap-2">
          {aiPredictions.slice(0, 4).map((item) => (
            <article key={item.boothId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-slate-900">{item.boothName}</strong>
                <span className="text-xs font-bold text-cyan-700">{item.riskLevel} · {item.riskScore}점</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                현재 {item.currentLevel} → 30분 뒤 {item.predictedLevel}
              </p>
              <small className="mt-1 block text-xs text-slate-500">
                {(item.reasons || []).slice(0, 2).join(" · ")}
              </small>
            </article>
          ))}
          {!aiPredictions.length && (
            <p className="app-inline-note">AI 예측 데이터를 수집하는 중입니다.</p>
          )}
        </div>
      </section>

      <section className="uni-card">
        <div className="analytics-section-head">
          <h2>AI 판단 이력</h2>
          <span>추천과 경보가 만들어진 근거</span>
        </div>
        <div className="grid gap-2">
          {aiDecisionLogs.slice(0, 3).map((log, index) => (
            <article key={`${log.createdAt}-${index}`} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-blue-950">{log.title}</strong>
                <span className="text-[11px] font-extrabold text-blue-700">{log.type}</span>
              </div>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{log.summary}</p>
              {(log.reasons || []).length > 0 && (
                <small className="mt-1 block text-xs text-blue-800">
                  {(log.reasons || []).slice(0, 3).join(" · ")}
                </small>
              )}
            </article>
          ))}
          {!aiDecisionLogs.length && (
            <p className="app-inline-note">AI 판단 로그가 아직 없습니다. 홈의 AI 가이드를 열면 기록됩니다.</p>
          )}
        </div>
      </section>

      {!hasMeasurements && (
        <p className="analytics-data-note">
          아직 실시간 위치 로그가 부족합니다. 홈이나 지도에서 위치를 허용하면 이 화면이 실제 수집값으로 갱신됩니다.
        </p>
      )}

      <section className="analytics-section">
        <div className="analytics-section-head">
          <h2>구역별 혼잡도</h2>
          <span>{formatUpdatedAt(dashboard.updatedAt)}</span>
        </div>
        <div className="analytics-zone-grid">
          {zones.map((zone) => {
            const meta = levelMeta(zone.level);
            return (
              <article key={zone.zoneKey} className={`analytics-zone-card analytics-zone-card--${meta.tone}`}>
                <span>{ZONE_LABELS[zone.zoneKey] || zone.zoneName}</span>
                <strong>{meta.label} {clampPercent(zone.percent)}%</strong>
                <small className={`analytics-delta analytics-delta--${deltaTone(zone.deltaPercent)}`}>
                  {formatDelta(zone.deltaPercent)}
                </small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="analytics-section analytics-trend-section">
        <div className="analytics-section-head">
          <h2>시간대별 혼잡 추이</h2>
          <button type="button" aria-label="오늘 추이 보기">
            오늘
          </button>
        </div>
        <TrendChart points={dashboard.trend} />
      </section>

      <section className="analytics-recommend-card">
        <div>
          <span>혼잡도 낮은 시간 추천</span>
          <p>
            {recommendation.reason === "NO_DATA"
              ? "위치 데이터가 쌓이면 추천 시간이 표시됩니다."
              : "지금 방문하기 좋은 시간이에요!"}
          </p>
        </div>
        <strong>
          {recommendation.startTime && recommendation.endTime
            ? `${recommendation.startTime} - ${recommendation.endTime}`
            : "수집 중"}
        </strong>
        <small>
          예상 혼잡도 <b>{clampPercent(recommendation.expectedPercent)}%</b> 이하
        </small>
      </section>
    </section>
  );
}
