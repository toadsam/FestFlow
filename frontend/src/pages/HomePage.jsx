import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMapEvents,
  CircleMarker,
} from "react-leaflet";
import L from "leaflet";
import {
  createCongestionStream,
  createNoticeStream,
  createBoothStream,
  downloadBoothCsv,
  fetchActiveNotices,
  fetchBooths,
  fetchCongestion,
  fetchEvents,
  sendGps,
} from "../api";
import CongestionBadge from "../components/CongestionBadge";
import { IconCalendar, IconClock, IconMapPin, IconMusic, IconTrophy, IconUsers } from "../components/UxIcons";
import { resolveBoothImageUrl } from "../config/boothImages";
import {
  AJOU_ADDRESS,
  AJOU_CENTER,
  reverseGeocodeKoreanShort,
} from "../utils/location";
import {
  addRecentBooth,
  getFavoriteIds,
  getRecentBoothIds,
  toggleFavorite,
} from "../utils/storage";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const levelToScore = { 여유: 1, 보통: 2, 혼잡: 3, 매우혼잡: 4 };
const scoreToLevel = ["여유", "보통", "혼잡", "매우혼잡"];
const noticeColor = {
  긴급: "border-rose-300 bg-rose-50 text-rose-700",
  분실물: "border-amber-300 bg-amber-50 text-amber-700",
  우천: "border-sky-300 bg-sky-50 text-sky-700",
};

function normalizeLevel(level) {
  const mapping = {
    "?ъ쑀": "여유",
    蹂댄넻: "보통",
    "?쇱옟": "혼잡",
    "留ㅼ슦?쇱옟": "매우혼잡",
  };
  return mapping[level] || level;
}

function normalizeCongestion(item) {
  return item ? { ...item, level: normalizeLevel(item.level) } : item;
}

function ZoomWatcher({ onZoomChange, onMapReady }) {
  const map = useMapEvents({
    zoomend: (event) => onZoomChange(event.target.getZoom()),
  });

  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  return null;
}

function getDirectionLinks(booth) {
  const encodedName = encodeURIComponent(booth.name);
  return {
    kakao: `https://map.kakao.com/link/to/${encodedName},${booth.latitude},${booth.longitude}`,
    naver: `https://map.naver.com/v5/search/${encodedName}`,
  };
}

function buildClusters(booths, congestionMap) {
  const map = new Map();

  booths.forEach((booth) => {
    const key = `${booth.latitude.toFixed(3)}-${booth.longitude.toFixed(3)}`;
    const congestionLevel = congestionMap[booth.id]?.level || "여유";

    if (!map.has(key)) {
      map.set(key, {
        key,
        latitude: Number(booth.latitude.toFixed(3)),
        longitude: Number(booth.longitude.toFixed(3)),
        booths: [],
        totalScore: 0,
      });
    }

    const cluster = map.get(key);
    cluster.booths.push(booth);
    cluster.totalScore += levelToScore[congestionLevel] || 1;
  });

  return Array.from(map.values()).map((cluster) => {
    const avgScore = Math.max(
      1,
      Math.round(cluster.totalScore / cluster.booths.length),
    );
    return {
      ...cluster,
      level: scoreToLevel[avgScore - 1],
    };
  });
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const [booths, setBooths] = useState([]);
  const [congestionMap, setCongestionMap] = useState({});
  const [mapZoom, setMapZoom] = useState(16);
  const [isGridView, setIsGridView] = useState(true);
  const [activeView, setActiveView] = useState("split");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("displayOrder");
  const [levelFilter, setLevelFilter] = useState("전체");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(getFavoriteIds());
  const [recentIds, setRecentIds] = useState(getRecentBoothIds());
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState([]);
  const [locationText, setLocationText] = useState("");
  const [gpsSending, setGpsSending] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const mapRef = useRef(null);
  const previousCongestionRef = useRef({});

  function getPosition(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function getCurrentPositionFast() {
    // 1) 캐시/저정밀로 빠르게 1차 위치 확보
    try {
      return await getPosition({
        enableHighAccuracy: false,
        maximumAge: 120000,
        timeout: 2500,
      });
    } catch {
      // 2) 실패 시 고정밀 fallback
      return getPosition({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      });
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [boothData, noticeData, eventData] = await Promise.all([
          fetchBooths(),
          fetchActiveNotices(),
          fetchEvents(),
        ]);
        setBooths(boothData);
        setNotices(noticeData);
        setEvents(eventData);

        const congestionData = await Promise.all(
          boothData.map(async (booth) => [
            booth.id,
            normalizeCongestion(await fetchCongestion(booth.id)),
          ]),
        );
        const nextMap = Object.fromEntries(congestionData);
        previousCongestionRef.current = nextMap;
        setCongestionMap(nextMap);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    const boothStream = createBoothStream();
    boothStream.addEventListener("booths", (event) => {
      try {
        setBooths(JSON.parse(event.data));
      } catch {
        // ignore parse failure
      }
    });
    return () => boothStream.close();
  }, []);

  useEffect(() => {
    const stream = createCongestionStream();

    stream.addEventListener("congestion", (event) => {
      try {
        const list = JSON.parse(event.data);
        const nextMap = Object.fromEntries(
          list.map((item) => [item.boothId, normalizeCongestion(item)]),
        );

        Object.values(nextMap).forEach((item) => {
          const prev = previousCongestionRef.current[item.boothId];
          if (!prev) return;

          const prevScore = levelToScore[prev.level] || 1;
          const nextScore = levelToScore[item.level] || 1;
          if (nextScore - prevScore >= 2) {
            notify(
              "혼잡 급상승",
              `${item.boothName} 혼잡도가 ${prev.level} → ${item.level}로 상승했습니다.`,
            );
          }
        });

        previousCongestionRef.current = nextMap;
        setCongestionMap(nextMap);
      } catch {
        // SSE 파싱 실패는 무시한다.
      }
    });

    return () => stream.close();
  }, []);

  useEffect(() => {
    const noticeStream = createNoticeStream();

    noticeStream.addEventListener("notices", (event) => {
      try {
        const list = JSON.parse(event.data);
        setNotices(list);
      } catch {
        // SSE 파싱 실패는 무시한다.
      }
    });

    return () => noticeStream.close();
  }, []);

  const filteredBooths = useMemo(() => {
    let list = booths.filter((booth) =>
      booth.name.toLowerCase().includes(query.toLowerCase()),
    );

    if (levelFilter !== "전체") {
      list = list.filter(
        (booth) => congestionMap[booth.id]?.level === levelFilter,
      );
    }

    if (favoritesOnly) {
      list = list.filter((booth) => favorites.includes(booth.id));
    }

    return [...list].sort((a, b) => {
      if (sortBy === "congestion") {
        return (
          (levelToScore[congestionMap[b.id]?.level] || 1) -
          (levelToScore[congestionMap[a.id]?.level] || 1)
        );
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name, "ko");
      }
      return (a.displayOrder || 999) - (b.displayOrder || 999);
    });
  }, [
    booths,
    congestionMap,
    favorites,
    favoritesOnly,
    levelFilter,
    query,
    sortBy,
  ]);

  const recentBooths = useMemo(() => {
    const byId = new Map(booths.map((booth) => [booth.id, booth]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [booths, recentIds]);

  const chartData = useMemo(() => {
    const levels = ["여유", "보통", "혼잡", "매우혼잡"];
    return levels.map((level) => ({
      label: level,
      value: Object.values(congestionMap).filter((item) => item.level === level)
        .length,
    }));
  }, [congestionMap]);
  const chartMax = useMemo(
    () => Math.max(1, ...chartData.map((item) => item.value)),
    [chartData],
  );

  const clusters = useMemo(
    () => buildClusters(booths, congestionMap),
    [booths, congestionMap],
  );
  const mapQuickBooths = useMemo(() => {
    return [...booths]
      .sort((a, b) => {
        const scoreDiff =
          (levelToScore[congestionMap[b.id]?.level] || 1) -
          (levelToScore[congestionMap[a.id]?.level] || 1);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.displayOrder || 999) - (b.displayOrder || 999);
      })
      .slice(0, 12);
  }, [booths, congestionMap]);

  const nextEvent = useMemo(() => {
    const now = new Date();
    return (
      (events || [])
        .filter((event) => event.startTime && new Date(event.startTime) > now)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] ||
      null
    );
  }, [events]);

  const visibleNotices = useMemo(() => {
    return (notices || []).filter(
      (notice) => !dismissedNoticeIds.includes(notice.id),
    );
  }, [notices, dismissedNoticeIds]);

  const recommendedBooths = useMemo(() => {
    return [...booths]
      .sort((a, b) => {
        const scoreDiff =
          (levelToScore[congestionMap[a.id]?.level] || 1) -
          (levelToScore[congestionMap[b.id]?.level] || 1);
        if (scoreDiff !== 0) return scoreDiff;
        return (
          (a.estimatedWaitMinutes ?? 999) - (b.estimatedWaitMinutes ?? 999)
        );
      })
      .slice(0, 3);
  }, [booths, congestionMap]);

  async function refreshAllCongestion() {
    const updates = await Promise.all(
      booths.map(async (booth) => [booth.id, await fetchCongestion(booth.id)]),
    );
    const normalized = updates.map(([id, item]) => [
      id,
      normalizeCongestion(item),
    ]);
    const nextMap = Object.fromEntries(normalized);
    previousCongestionRef.current = nextMap;
    setCongestionMap(nextMap);
  }

  async function handleMockGpsBatch() {
    if (booths.length === 0) return;

    const picks = Array.from(
      { length: 10 },
      () => booths[Math.floor(Math.random() * booths.length)],
    );

    await Promise.all(
      picks.map((booth) => {
        const jitter = () => (Math.random() - 0.5) * 0.00045;
        return sendGps(booth.latitude + jitter(), booth.longitude + jitter());
      }),
    );
  }

  async function handleSendCurrentGps() {
    if (!navigator.geolocation) {
      setError("현재 브라우저에서 GPS를 지원하지 않습니다.");
      return;
    }

    setGpsSending(true);
    try {
      const position = await getCurrentPositionFast();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      await sendGps(latitude, longitude);
      const area = await reverseGeocodeKoreanShort(latitude, longitude);
      setLocationText(
        `${area} (위도 ${latitude.toFixed(4)}, 경도 ${longitude.toFixed(4)})`,
      );
      await refreshAllCongestion();
    } catch (e) {
      setError(e.message || "위치 권한이 거부되어 GPS를 전송하지 못했습니다.");
    } finally {
      setGpsSending(false);
    }
  }

  function handleMoveToMyLocation() {
    if (!navigator.geolocation) {
      setError("현재 브라우저에서 GPS를 지원하지 않습니다.");
      return;
    }

    setLocatingMe(true);
    getCurrentPositionFast()
      .then(async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setMyLocation({ latitude, longitude });

        try {
          const area = await reverseGeocodeKoreanShort(latitude, longitude);
          setLocationText(
            `${area} (위도 ${latitude.toFixed(4)}, 경도 ${longitude.toFixed(4)})`,
          );
        } catch {
          // reverse geocode 실패는 지도 이동에는 영향 없음
        }

        if (mapRef.current) {
          const nextZoom = Math.max(mapRef.current.getZoom(), 18);
          mapRef.current.flyTo([latitude, longitude], nextZoom, {
            duration: 0.6,
          });
        }
      })
      .catch(() => {
        setError("위치 권한이 거부되어 내 위치로 이동할 수 없습니다.");
      })
      .finally(() => {
        setLocatingMe(false);
      });
  }

  function openBoothDetail(boothId) {
    setRecentIds(addRecentBooth(boothId));
    navigate(`/booths/${boothId}`);
  }

  function handleFavorite(boothId) {
    setFavorites(toggleFavorite(boothId));
  }

  return (
    <section className="cyber-page space-y-4 pt-4 scan-enter">
      <article className="rounded-2xl border border-cyan-300/60 bg-gradient-to-br from-[#05305b] via-[#0a6ea8] to-[#19c6e8] px-4 py-4 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.42)]">
        <p className="text-xs tracking-[0.03em] text-cyan-200/95 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]">
          아주대학교 축제 메인
        </p>
        <h2 className="mt-1 text-xl font-extrabold text-cyan-100 drop-shadow-[0_0_12px_rgba(125,249,255,0.65)] inline-flex items-center gap-2">
          <IconMusic className="h-5 w-5 icon-role-ops" />
          지금 축제를 바로 즐겨보세요
        </h2>
        <p className="mt-1 text-xs text-cyan-200/95 drop-shadow-[0_0_7px_rgba(34,211,238,0.4)]">
          {nextEvent
            ? `다음 공연: ${nextEvent.title} (${nextEvent.startTime?.replace("T", " ").slice(11, 16)})`
            : "곧 시작하는 공연 정보를 확인해보세요."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate("/stage-map")}
            className="rounded-xl border border-cyan-300/60 bg-sky-500/20 px-3 py-2.5 min-h-11 text-sm font-semibold text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.45)] inline-flex items-center justify-center gap-1.5"
          >
            <IconUsers className="h-4 w-4 icon-role-ops" />
            노천극장 인원 보기
          </button>
          <button
            type="button"
            onClick={() => navigate("/events")}
            className="rounded-xl border border-cyan-200/70 bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 px-3 py-2.5 min-h-11 text-sm font-bold text-cyan-50 shadow-[0_0_24px_rgba(56,189,248,0.55)] inline-flex items-center justify-center gap-1.5"
          >
            <IconCalendar className="h-4 w-4 icon-role-schedule" />
            공연 일정 보기
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">
            <IconTrophy className="mr-1.5 inline h-4 w-4 icon-role-ops" />지금 덜 붐비는 추천 부스
          </p>
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className="text-xs text-teal-700 font-semibold"
          >
            전체 보기
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 stagger-list">
          {recommendedBooths.map((booth) => (
            <button
              key={`recommended-${booth.id}`}
              type="button"
              onClick={() => openBoothDetail(booth.id)}
              className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left"
            >
              <p className="text-xs font-semibold text-slate-800 line-clamp-1">
                {booth.name}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                대기 {booth.estimatedWaitMinutes ?? "-"}분
              </p>
              <div className="mt-1">
                <CongestionBadge
                  level={congestionMap[booth.id]?.level || "여유"}
                />
              </div>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-teal-100 bg-teal-50/70 p-3">
        <p className="text-sm font-semibold text-teal-900 inline-flex items-center gap-1.5"><IconClock className="h-4 w-4 icon-role-log" />실시간 운영 안내</p>
        <p className="text-xs text-teal-800 mt-1">기준 위치: {AJOU_ADDRESS}</p>
        {locationText && (
          <p className="text-xs text-teal-700 mt-1">내 위치: {locationText}</p>
        )}
      </article>

      <div className="space-y-2 stagger-list">
        {visibleNotices.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            현재 등록된 운영 공지가 없습니다.
          </div>
        )}
        {visibleNotices.slice(0, 2).map((notice) => (
          <article
            key={notice.id}
            className={`rounded-lg border px-3 py-2 ${noticeColor[notice.category] || "border-slate-300 bg-slate-50 text-slate-700"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold">{notice.category}</span>
                <span className="text-[10px] opacity-70">
                  {notice.updatedAt?.replace("T", " ").slice(5, 16)}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDismissedNoticeIds((prev) => [...prev, notice.id])
                }
                className="rounded-full px-2 py-1 text-[11px] font-bold opacity-70 hover:opacity-100"
                aria-label="공지 닫기"
              >
                ✕
              </button>
            </div>
            <p className="text-sm font-semibold mt-1">{notice.title}</p>
            <p className="text-xs mt-1">{notice.content}</p>
          </article>
        ))}
      </div>

      <div className="home-view-toggle z-40 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-900/90 backdrop-blur p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveView("split")}
          className={`rounded-lg min-h-11 text-sm font-semibold ${activeView === "split" ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-cyan-50" : "text-slate-300"}`}
        >
          동시 보기
        </button>
        <button
          type="button"
          onClick={() => setActiveView("list")}
          className={`rounded-lg min-h-11 text-sm font-semibold ${activeView === "list" ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-cyan-50" : "text-slate-300"}`}
        >
          부스 목록
        </button>
      </div>

      {activeView !== "list" && (
        <>
          <div className="relative rounded-2xl overflow-hidden border border-slate-200">
            <MapContainer
              center={[AJOU_CENTER.latitude, AJOU_CENTER.longitude]}
              zoom={17}
              maxZoom={22}
              className="h-64 w-full"
            >
              <TileLayer
                attribution="&copy; OpenStreetMap 기여자"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={22}
                maxNativeZoom={19}
              />
              <ZoomWatcher
                onZoomChange={setMapZoom}
                onMapReady={(map) => {
                  mapRef.current = map;
                }}
              />

              {mapZoom >= 16 &&
                booths.map((booth) => {
                  const links = getDirectionLinks(booth);
                  const congestion = congestionMap[booth.id];

                  return (
                    <Marker
                      key={booth.id}
                      position={[booth.latitude, booth.longitude]}
                      icon={markerIcon}
                    >
                      <Popup>
                        <div className="space-y-1">
                          <p className="font-bold">{booth.name}</p>
                          <p className="text-xs text-slate-700">
                            수원시 영통구 아주대학교
                          </p>
                          <p className="text-xs">
                            혼잡도: {congestion?.level || "집계중"}
                          </p>
                          <div className="flex gap-2 text-xs">
                            <a
                              href={links.kakao}
                              target="_blank"
                              rel="noreferrer"
                            >
                              카카오 길찾기
                            </a>
                            <a
                              href={links.naver}
                              target="_blank"
                              rel="noreferrer"
                            >
                              네이버 지도
                            </a>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

              {mapZoom < 16 &&
                clusters.map((cluster) => (
                  <CircleMarker
                    key={cluster.key}
                    center={[cluster.latitude, cluster.longitude]}
                    radius={10 + Math.min(cluster.booths.length * 2, 12)}
                    pathOptions={{
                      color: "#0f766e",
                      fillColor: "#14b8a6",
                      fillOpacity: 0.5,
                    }}
                  >
                    <Popup>
                      <p className="font-semibold">
                        {cluster.booths.length}개 부스 클러스터
                      </p>
                      <p className="text-xs">평균 혼잡도: {cluster.level}</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        {cluster.booths.map((booth) => (
                          <li key={booth.id}>{booth.name}</li>
                        ))}
                      </ul>
                    </Popup>
                  </CircleMarker>
                ))}

              {myLocation && (
                <CircleMarker
                  center={[myLocation.latitude, myLocation.longitude]}
                  radius={8}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#0ea5e9",
                    fillOpacity: 0.95,
                  }}
                >
                  <Popup>
                    <p className="text-xs font-semibold">내 위치</p>
                  </Popup>
                </CircleMarker>
              )}
            </MapContainer>
            <div className="pointer-events-none absolute inset-0 z-[500]">
              <div className="pointer-events-auto absolute right-3 top-3">
                <button
                  type="button"
                  onClick={handleMoveToMyLocation}
                  disabled={locatingMe}
                  className="rounded-lg border border-cyan-300/80 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.35)] backdrop-blur disabled:opacity-60"
                >
                  {locatingMe ? "위치 찾는 중..." : "내 위치로 가기"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-800">
                <IconMapPin className="mr-1.5 inline h-4 w-4 icon-role-map" />빠른 부스 이동
              </p>
              <button
                type="button"
                onClick={() => setActiveView("list")}
                className="text-xs text-teal-700 font-semibold min-h-11 px-2"
              >
                전체 목록 보기
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 stagger-list">
              {mapQuickBooths.map((booth) => {
                const congestion = congestionMap[booth.id];
                return (
                  <button
                    key={`quick-${booth.id}`}
                    type="button"
                    onClick={() => openBoothDetail(booth.id)}
                    className="shrink-0 w-36 rounded-lg border border-slate-200 overflow-hidden text-left bg-slate-50"
                  >
                    <div className="h-20 bg-slate-200">
                      <img
                        src={resolveBoothImageUrl(booth)}
                        alt={`${booth.name} 이미지`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-slate-800 line-clamp-1">
                        {booth.name}
                      </p>
                      <div className="mt-1">
                        {congestion ? (
                          <CongestionBadge level={congestion.level} />
                        ) : (
                          <span className="text-[11px] text-slate-600">
                            집계중
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {activeView === "split" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800">
                  <IconMapPin className="mr-1.5 inline h-4 w-4 icon-role-map" />지도 아래 부스 리스트
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView("list")}
                  className="text-xs text-teal-700 font-semibold"
                >
                  전체 목록으로
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-auto pr-1 stagger-list">
                {filteredBooths.slice(0, 8).map((booth) => {
                  const congestion = congestionMap[booth.id];
                  return (
                    <button
                      key={`split-${booth.id}`}
                      type="button"
                      onClick={() => openBoothDetail(booth.id)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 line-clamp-1">
                          {booth.name}
                        </p>
                        {congestion ? (
                          <CongestionBadge level={congestion.level} />
                        ) : (
                          <span className="text-xs text-slate-500">집계중</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 line-clamp-1">
                        {booth.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleMockGpsBatch}
              className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-cyan-50 min-h-11 py-2.5 font-semibold shadow-[0_0_22px_rgba(34,211,238,0.5)]"
            >
              GPS 샘플 생성
            </button>
            <button
              type="button"
              onClick={handleSendCurrentGps}
              className="rounded-xl border border-cyan-300/70 bg-sky-500/15 text-cyan-100 min-h-11 py-2.5 font-semibold shadow-[0_0_18px_rgba(34,211,238,0.35)]"
              disabled={gpsSending}
            >
              {gpsSending ? "GPS 전송 중..." : "내 위치 전송"}
            </button>
          </div>
        </>
      )}

      {activeView === "list" && (
        <>
          <div className="sticky top-2 z-30 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 space-y-2 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsGridView((prev) => !prev)}
                className="rounded-lg border border-teal-700 text-teal-700 min-h-11 py-2 text-sm font-semibold"
              >
                {isGridView ? "세로 카드 보기" : "가로 카드 보기"}
              </button>
              <button
                type="button"
                onClick={downloadBoothCsv}
                className="rounded-lg border border-slate-300 min-h-11 py-2 text-sm font-semibold text-slate-700"
              >
                부스 CSV
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFavoritesOnly((prev) => !prev)}
                className={`rounded-lg min-h-11 py-2 text-sm font-semibold ${favoritesOnly ? "bg-gradient-to-r from-teal-700 via-cyan-600 to-emerald-600 text-white" : "border border-slate-300 text-slate-700"}`}
              >
                {favoritesOnly ? "좋아요만 보는 중" : "좋아요만 보기"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFavoritesOnly(false);
                  setLevelFilter("전체");
                  setQuery("");
                }}
                className="rounded-lg border border-slate-300 min-h-11 py-2 text-sm font-semibold text-slate-700"
              >
                필터 초기화
              </button>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="부스 이름 검색"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-11 text-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-2 min-h-11 text-sm"
              >
                <option>전체</option>
                <option>여유</option>
                <option>보통</option>
                <option>혼잡</option>
                <option>매우혼잡</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-2 min-h-11 text-sm"
              >
                <option value="displayOrder">운영순</option>
                <option value="name">이름순</option>
                <option value="congestion">혼잡도순</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              <IconUsers className="mr-1.5 inline h-4 w-4 icon-role-ops" />혼잡도 요약
            </p>
            <div className="h-24 flex items-end gap-2 overflow-hidden">
              {chartData.map((item) => (
                <div key={item.label} className="flex-1 text-center">
                  <div
                    className="mx-auto w-full rounded-t bg-teal-500/80"
                    style={{
                      height: `${Math.max(8, Math.round((item.value / chartMax) * 88))}px`,
                    }}
                  />
                  <p className="mt-1 text-[10px] text-slate-600">
                    {item.label} ({item.value})
                  </p>
                </div>
              ))}
            </div>
          </div>

          {recentBooths.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-700 mb-2">
                <IconClock className="mr-1.5 inline h-4 w-4 icon-role-log" />최근 본 부스
              </p>
              <div className="flex flex-wrap gap-2">
                {recentBooths.map((booth) => (
                  <button
                    key={booth.id}
                    type="button"
                    onClick={() => openBoothDetail(booth.id)}
                    className="rounded-full bg-slate-100 px-3 py-2 min-h-11 text-sm text-slate-700"
                  >
                    {booth.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <p className="text-sm text-slate-600">
              부스와 혼잡도 데이터를 불러오는 중...
            </p>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}

          {!loading && filteredBooths.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
              검색 조건에 맞는 부스가 없습니다. 지도 보기 탭에서 GPS를 전송하면
              실시간 데이터가 더 정확해집니다.
            </div>
          )}

          <div
            className={
              isGridView
                ? "grid grid-cols-2 gap-3 stagger-list"
                : "space-y-3 stagger-list"
            }
          >
            {filteredBooths.map((booth) => {
              const congestion = congestionMap[booth.id];
              const isFavorite = favorites.includes(booth.id);

              return (
                <button
                  key={booth.id}
                  type="button"
                  onClick={() => openBoothDetail(booth.id)}
                  className="w-full h-full text-left rounded-2xl border border-slate-200 bg-white overflow-hidden"
                >
                  <div className="aspect-[16/9] bg-slate-100">
                    <img
                      src={resolveBoothImageUrl(booth)}
                      alt={`${booth.name} 대표 이미지`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 leading-tight break-keep">
                          {booth.name}
                        </h3>
                        <p className="text-xs text-slate-700 mt-1">
                          혼잡도 {congestion?.level || "집계중"}
                          {" · "}
                          대기 {booth.estimatedWaitMinutes ?? "-"}분
                        </p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                          {booth.description}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {congestion ? (
                          <CongestionBadge level={congestion.level} />
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-teal-700 font-semibold">
                        자세히 보기 →
                      </p>
                      <button
                        type="button"
                        aria-label="즐겨찾기"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavorite(booth.id);
                        }}
                        className="text-2xl leading-none min-h-11 min-w-11"
                      >
                        {isFavorite ? "⭐" : "☆"}
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}



