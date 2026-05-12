import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  createReservationStream,
  downloadBoothCsv,
  fetchActiveNotices,
  fetchBooths,
  fetchCongestion,
  fetchEvents,
  sendGps,
} from "../api";
import CongestionBadge from "../components/CongestionBadge";
import { IconCalendar, IconClock, IconMapPin, IconSearch } from "../components/UxIcons";
import {
  AJOU_ADDRESS,
  AJOU_CENTER,
  reverseGeocodeKoreanShort,
} from "../utils/location";
import {
  addRecentBooth,
  getFavoriteIds,
  toggleFavorite,
} from "../utils/storage";

const levelToScore = { 여유: 1, 보통: 2, 혼잡: 3, 매우혼잡: 4 };
const scoreToLevel = ["여유", "보통", "혼잡", "매우혼잡"];
const BOOTH_CATEGORY_OPTIONS = ["전체", "주점", "음식", "체험", "이벤트", "굿즈", "안내", "응급", "포토존", "플리마켓", "기타"];
const BOOTH_DAY_PART_OPTIONS = ["전체", "상시", "주간", "야간"];
const categoryMarkerMeta = {
  주점: { icon: "🍺", color: "#f59e0b", shadow: "#f59e0b66", label: "주점" },
  음식: { icon: "🍜", color: "#ef4444", shadow: "#ef444466", label: "음식" },
  푸드: { icon: "🍜", color: "#ef4444", shadow: "#ef444466", label: "음식" },
  체험: { icon: "🎮", color: "#8b5cf6", shadow: "#8b5cf666", label: "체험" },
  이벤트: { icon: "🎪", color: "#06b6d4", shadow: "#06b6d466", label: "이벤트" },
  굿즈: { icon: "🎁", color: "#ec4899", shadow: "#ec489966", label: "굿즈" },
  안내: { icon: "i", color: "#2563eb", shadow: "#2563eb66", label: "안내" },
  응급: { icon: "✚", color: "#dc2626", shadow: "#dc262666", label: "응급" },
  포토존: { icon: "📷", color: "#10b981", shadow: "#10b98166", label: "포토존" },
  포토: { icon: "📷", color: "#10b981", shadow: "#10b98166", label: "포토존" },
  플리마켓: { icon: "🛍️", color: "#14b8a6", shadow: "#14b8a666", label: "플리마켓" },
  기타: { icon: "•", color: "#64748b", shadow: "#64748b66", label: "기타" },
};
const noticeColor = {
  긴급: "border-rose-300 bg-rose-50 text-rose-700",
  분실물: "border-amber-300 bg-amber-50 text-amber-700",
  우천: "border-sky-300 bg-sky-50 text-sky-700",
};

function getBoothCategoryMeta(category) {
  return categoryMarkerMeta[category] || categoryMarkerMeta.기타;
}

function getBoothMarkerIcon(category) {
  const meta = getBoothCategoryMeta(category || "주점");

  return L.divIcon({
    className: "booth-category-marker-wrap",
    html: `
      <div class="booth-category-marker" style="--marker-color: ${meta.color}; --marker-shadow: ${meta.shadow};" title="${meta.label}">
        <span class="booth-category-marker__icon">${meta.icon}</span>
      </div>
    `,
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -42],
  });
}

function normalizeLevel(level) {
  return level;
}

function normalizeCongestion(item) {
  return item ? { ...item, level: normalizeLevel(item.level) } : item;
}

function isBoothOpenNow(booth, now = new Date()) {
  if (!booth.openTime || !booth.closeTime) return true;
  const [openHour, openMinute] = booth.openTime.split(":").map(Number);
  const [closeHour, closeMinute] = booth.closeTime.split(":").map(Number);
  if ([openHour, openMinute, closeHour, closeMinute].some(Number.isNaN)) {
    return true;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  const open = openHour * 60 + openMinute;
  const close = closeHour * 60 + closeMinute;
  if (open === close) return true;
  if (open < close) return current >= open && current <= close;
  return current >= open || current <= close;
}

function boothMetaLabel(booth) {
  const time =
    booth.openTime || booth.closeTime
      ? `${booth.openTime || "--:--"}~${booth.closeTime || "--:--"}`
      : "시간 미정";
  return `${booth.category || "주점"} · ${booth.dayPart || "야간"} · ${time}`;
}

function reservationAvailableSeats(booth) {
  return Math.max(0, Number(booth.reservationAvailableSeats) || 0);
}

function reservationTableCount(booth) {
  return Math.max(0, Number(booth.reservationTableCount) || 0);
}

function boothReservationText(booth) {
  if (booth.reservationEnabled === false) {
    return "현장 이용";
  }
  if (reservationTableCount(booth) === 0) {
    return "테이블 미설정";
  }
  return `예약 가능 ${reservationAvailableSeats(booth)}명`;
}

function boothReservationTone(booth) {
  if (booth.reservationEnabled === false || reservationTableCount(booth) === 0) {
    return "neutral";
  }
  if (reservationAvailableSeats(booth) <= 0) {
    return "full";
  }
  return "available";
}

function boothReservationBadgeClass(booth) {
  switch (boothReservationTone(booth)) {
    case "available":
      return "border-emerald-300/70 bg-emerald-400/15 text-emerald-100";
    case "full":
      return "border-rose-300/70 bg-rose-400/15 text-rose-100";
    default:
      return "border-slate-400/50 bg-slate-800/40 text-slate-100";
  }
}

function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `${value || ""}`.replace("T", " ").slice(11, 16);
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function scheduleIdleTask(callback) {
  if ("requestIdleCallback" in window) {
    return { type: "idle", id: window.requestIdleCallback(callback, { timeout: 2500 }) };
  }
  return { type: "timeout", id: window.setTimeout(callback, 600) };
}

function cancelIdleTask(task) {
  if (!task) return;
  if (task.type === "idle") {
    window.cancelIdleCallback(task.id);
    return;
  }
  window.clearTimeout(task.id);
}

async function fetchCongestionMap(boothList) {
  const pairs = [];
  const batchSize = 4;

  for (let i = 0; i < boothList.length; i += batchSize) {
    const batch = boothList.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (booth) => {
        try {
          return [booth.id, normalizeCongestion(await fetchCongestion(booth.id))];
        } catch {
          return null;
        }
      }),
    );
    pairs.push(...results.filter(Boolean));
  }

  return Object.fromEntries(pairs);
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booths, setBooths] = useState([]);
  const [congestionMap, setCongestionMap] = useState({});
  const [mapZoom, setMapZoom] = useState(16);
  const [activeView, setActiveView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("displayOrder");
  const [levelFilter, setLevelFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [dayPartFilter, setDayPartFilter] = useState("전체");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(getFavoriteIds());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState([]);
  const [locationText, setLocationText] = useState("");
  const [gpsSending, setGpsSending] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [focusedBoothId, setFocusedBoothId] = useState(null);
  const mapRef = useRef(null);
  const mapSectionRef = useRef(null);
  const markerRefs = useRef({});
  const handledFocusParamRef = useRef("");
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
    let mounted = true;
    let idleTask = null;

    async function load() {
      try {
        const boothData = await fetchBooths();
        if (!mounted) return;
        setBooths(boothData);
        setLoading(false);

        idleTask = scheduleIdleTask(async () => {
          const nextMap = await fetchCongestionMap(boothData);
          if (!mounted || Object.keys(nextMap).length === 0) return;
          previousCongestionRef.current = nextMap;
          setCongestionMap(nextMap);
        });

        const [noticeResult, eventResult] = await Promise.allSettled([
          fetchActiveNotices(),
          fetchEvents(),
        ]);
        if (!mounted) return;
        if (noticeResult.status === "fulfilled") {
          setNotices(noticeResult.value);
        }
        if (eventResult.status === "fulfilled") {
          setEvents(eventResult.value);
        }
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
      cancelIdleTask(idleTask);
    };
  }, []);

  useEffect(() => {
    if (loading) return undefined;

    const boothStream = createBoothStream();
    boothStream.addEventListener("booths", (event) => {
      try {
        setBooths(JSON.parse(event.data));
      } catch {
        // ignore parse failure
      }
    });
    return () => boothStream.close();
  }, [loading]);

  useEffect(() => {
    if (loading) return undefined;

    const reservationStream = createReservationStream();
    let refreshTimer = null;

    reservationStream.addEventListener("reservations", () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(async () => {
        try {
          setBooths(await fetchBooths());
        } catch {
          // 목록 요약 갱신 실패는 다음 폴링/이벤트에서 다시 복구한다.
        }
      }, 120);
    });

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      reservationStream.close();
    };
  }, [loading]);

  useEffect(() => {
    if (loading) return undefined;

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
  }, [loading]);

  useEffect(() => {
    if (loading) return undefined;

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
  }, [loading]);

  const filteredBooths = useMemo(() => {
    let list = booths.filter((booth) =>
      booth.name.toLowerCase().includes(query.toLowerCase()),
    );

    if (levelFilter !== "전체") {
      list = list.filter(
        (booth) => congestionMap[booth.id]?.level === levelFilter,
      );
    }

    if (categoryFilter !== "전체") {
      list = list.filter((booth) => (booth.category || "주점") === categoryFilter);
    }

    if (dayPartFilter !== "전체") {
      list = list.filter((booth) => (booth.dayPart || "야간") === dayPartFilter);
    }

    if (openNowOnly) {
      list = list.filter((booth) => isBoothOpenNow(booth));
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
      if (sortBy === "reservation") {
        return reservationAvailableSeats(b) - reservationAvailableSeats(a);
      }
      return (a.displayOrder || 999) - (b.displayOrder || 999);
    });
  }, [
    booths,
    congestionMap,
    favorites,
    favoritesOnly,
    categoryFilter,
    dayPartFilter,
    levelFilter,
    openNowOnly,
    query,
    sortBy,
  ]);

  const clusters = useMemo(
    () => buildClusters(filteredBooths, congestionMap),
    [filteredBooths, congestionMap],
  );
  const mapQuickBooths = useMemo(() => {
    return [...filteredBooths]
      .sort((a, b) => {
        const scoreDiff =
          (levelToScore[congestionMap[b.id]?.level] || 1) -
          (levelToScore[congestionMap[a.id]?.level] || 1);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.displayOrder || 999) - (b.displayOrder || 999);
      })
      .slice(0, 12);
  }, [filteredBooths, congestionMap]);

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

  const visibleReservationSeats = useMemo(
    () =>
      filteredBooths.reduce(
        (total, booth) => total + reservationAvailableSeats(booth),
        0,
      ),
    [filteredBooths],
  );

  const openBoothCount = useMemo(
    () => booths.filter((booth) => isBoothOpenNow(booth)).length,
    [booths],
  );

  const recommendedBooths = useMemo(() => {
    return [...filteredBooths]
      .filter((booth) => isBoothOpenNow(booth))
      .sort((a, b) => {
        const scoreA = levelToScore[congestionMap[a.id]?.level] || 1;
        const scoreB = levelToScore[congestionMap[b.id]?.level] || 1;
        if (scoreA !== scoreB) return scoreA - scoreB;

        const waitA = Number(a.estimatedWaitMinutes) || 0;
        const waitB = Number(b.estimatedWaitMinutes) || 0;
        if (waitA !== waitB) return waitA - waitB;

        return reservationAvailableSeats(b) - reservationAvailableSeats(a);
      })
      .slice(0, 3);
  }, [filteredBooths, congestionMap]);

  const relaxedBooth = useMemo(
    () => recommendedBooths[0] || filteredBooths[0] || null,
    [recommendedBooths, filteredBooths],
  );
  const busyBooth = useMemo(() => {
    return [...filteredBooths]
      .sort((a, b) => {
        const scoreA = levelToScore[congestionMap[a.id]?.level] || 0;
        const scoreB = levelToScore[congestionMap[b.id]?.level] || 0;
        return scoreB - scoreA;
      })[0] || null;
  }, [filteredBooths, congestionMap]);
  const reservationBooth = useMemo(() => {
    return [...filteredBooths]
      .filter((booth) => reservationAvailableSeats(booth) > 0)
      .sort(
        (a, b) =>
          reservationAvailableSeats(b) - reservationAvailableSeats(a),
      )[0] || null;
  }, [filteredBooths]);

  const heroBooth = recommendedBooths[0] || filteredBooths[0] || null;
  const heroBoothCongestion = heroBooth ? congestionMap[heroBooth.id] : null;
  const liveBoothCount = openBoothCount || filteredBooths.length;

  useEffect(() => {
    if (activeView === "list" || !focusedBoothId) return undefined;

    const booth = booths.find((item) => item.id === focusedBoothId);
    if (!booth) return undefined;

    const timer = window.setTimeout(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      if (!mapRef.current) return;

      mapRef.current.flyTo([booth.latitude, booth.longitude], 18, {
        duration: 0.6,
      });

      window.setTimeout(() => {
        markerRefs.current[focusedBoothId]?.openPopup();
      }, 450);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeView, booths, focusedBoothId]);

  useEffect(() => {
    const focusParam = new URLSearchParams(location.search).get("focusBooth");
    if (!focusParam || focusParam === handledFocusParamRef.current || booths.length === 0) {
      return;
    }

    const boothId = Number(focusParam);
    if (!Number.isFinite(boothId) || boothId <= 0) {
      return;
    }

    handledFocusParamRef.current = focusParam;
    focusBoothOnMap(boothId);
  }, [booths, location.search]);

  async function refreshAllCongestion() {
    const nextMap = await fetchCongestionMap(booths);
    previousCongestionRef.current = nextMap;
    setCongestionMap(nextMap);
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
    addRecentBooth(boothId);
    navigate(`/booths/${boothId}`);
  }

  function focusBoothOnMap(boothId) {
    const booth = booths.find((item) => item.id === boothId);
    if (!booth) return;

    setFocusedBoothId(boothId);
    setMapZoom(18);
    setActiveView("split");
  }

  function handleFavorite(boothId) {
    setFavorites(toggleFavorite(boothId));
  }

  return (
    <section className="cyber-page festival-home space-y-4 pt-4 scan-enter">
      <article className="festival-hero festival-hero-premium">
        <div className="festival-hero-media" aria-hidden>
          <img
            src="/images/og-festflow.png"
            alt=""
            loading="eager"
            decoding="async"
          />
        </div>
        <div className="festival-hero-content">
          <div className="festival-live-strip">
            <span>AU:SUM LIVE</span>
            <strong>
              {liveBoothCount > 0
                ? `${liveBoothCount}개 부스 운영 중`
                : "실시간 동선 추천 중"}
            </strong>
          </div>

          <div className="festival-hero-main">
            <div className="festival-hero-copyblock">
              <p className="festival-eyebrow">오늘의 아주대 축제</p>
              <h2 className="festival-hero__title">
                <span>오늘은</span>
                <span>여기부터</span>
              </h2>
              <p className="festival-hero__copy">
                혼잡도, 대기시간, 예약 가능 좌석을 보고 지금 바로 움직일 곳을 골라드릴게요.
              </p>
            </div>

            <button
              type="button"
              className="festival-hero-pick"
              onClick={() =>
                heroBooth ? openBoothDetail(heroBooth.id) : navigate("/events")
              }
            >
              <span>지금 추천</span>
              <strong>
                {heroBooth
                  ? heroBooth.name
                  : nextEvent
                    ? nextEvent.title
                    : "축제 둘러보기"}
              </strong>
              <small>
                {heroBooth
                  ? `${heroBooth.category || "부스"} · ${heroBoothCongestion?.level || "집계중"} · 대기 ${heroBooth.estimatedWaitMinutes ?? 0}분`
                  : nextEvent
                    ? `다음 공연 · ${formatEventTime(nextEvent.startTime)} 시작`
                    : "공연, 부스, 지도를 한 번에 확인"}
              </small>
            </button>
          </div>

          <div className="festival-status-grid">
            <div className="festival-status-card festival-status-card--primary">
              <span>다음 공연</span>
              <strong>{nextEvent ? nextEvent.title : "일정 확인"}</strong>
              <small>
                {nextEvent
                  ? `${formatEventTime(nextEvent.startTime)} 시작`
                  : "전체 라인업을 볼 수 있어요"}
              </small>
            </div>
            <div className="festival-status-card">
              <span>운영 부스</span>
              <strong>{liveBoothCount > 0 ? `${liveBoothCount}곳` : "전체 안내"}</strong>
              <small>
                {visibleReservationSeats > 0
                  ? `예약 가능 ${visibleReservationSeats}명`
                  : "부스 정보를 바로 확인"}
              </small>
            </div>
            <div className="festival-status-card">
              <span>라이브 지도</span>
              <strong>바로 확인</strong>
              <small>부스 위치와 혼잡도</small>
            </div>
          </div>

          <div className="festival-quick-actions">
            <button type="button" onClick={() => navigate("/events")}>
              <IconCalendar className="h-4 w-4" />
              노천극장 라인업
            </button>
            <button type="button" onClick={() => setActiveView("list")}>
              <IconSearch className="h-4 w-4" />
              부스 찾기
            </button>
            <button type="button" onClick={() => setActiveView("split")}>
              <IconMapPin className="h-4 w-4" />
              지도 보기
            </button>
          </div>
        </div>
      </article>

      <section className="festival-section festival-now-board">
        <div className="festival-section__head">
          <div>
            <p className="festival-eyebrow">지금 축제 상황</p>
            <h3>켜자마자 바로 결정하기</h3>
          </div>
          <p className="festival-section__meta">
            친구랑 움직이기 전에 확인할 것들
          </p>
        </div>
        <div className="festival-situation-grid">
          <button
            type="button"
            className="festival-situation-card festival-situation-card--primary"
            onClick={() =>
              relaxedBooth ? openBoothDetail(relaxedBooth.id) : setActiveView("list")
            }
          >
            <span>지금 바로 갈 곳</span>
            <strong>{relaxedBooth ? relaxedBooth.name : "추천 준비 중"}</strong>
            <small>
              {relaxedBooth
                ? `${congestionMap[relaxedBooth.id]?.level || "집계중"} · 대기 ${relaxedBooth.estimatedWaitMinutes ?? 0}분`
                : "부스 운영 정보가 들어오면 추천해드릴게요"}
            </small>
          </button>
          <button
            type="button"
            className="festival-situation-card"
            onClick={() =>
              busyBooth ? focusBoothOnMap(busyBooth.id) : setActiveView("split")
            }
          >
            <span>사람 많은 곳 피하기</span>
            <strong>{busyBooth ? busyBooth.name : "혼잡도 수집 중"}</strong>
            <small>
              {busyBooth
                ? `${congestionMap[busyBooth.id]?.level || "집계중"} 표시 · 지도에서 확인`
                : "위치 데이터가 쌓이면 바로 보여드려요"}
            </small>
          </button>
          <button
            type="button"
            className="festival-situation-card"
            onClick={() =>
              reservationBooth
                ? openBoothDetail(reservationBooth.id)
                : setActiveView("list")
            }
          >
            <span>예약 가능한 부스</span>
            <strong>
              {reservationBooth ? reservationBooth.name : "예약 정보 확인 중"}
            </strong>
            <small>
              {reservationBooth
                ? `${reservationAvailableSeats(reservationBooth)}명 가능 · 바로 보기`
                : "예약 가능 좌석이 생기면 표시됩니다"}
            </small>
          </button>
          <button
            type="button"
            className="festival-situation-card"
            onClick={() => navigate("/events")}
          >
            <span>다음 일정</span>
            <strong>{nextEvent ? nextEvent.title : "라인업 확인"}</strong>
            <small>
              {nextEvent
                ? `${formatEventTime(nextEvent.startTime)} 시작`
                : "노천극장 라인업이 공개되면 바로 볼 수 있어요"}
            </small>
          </button>
        </div>
      </section>

      <section className="festival-section">
        <div className="festival-section__head">
          <div>
            <p className="festival-eyebrow">어디로 갈까?</p>
            <h3>지금 가볼 만한 곳</h3>
          </div>
          <button type="button" onClick={() => setActiveView("list")}>
            전체 보기
          </button>
        </div>
        <div className="festival-recommend-list stagger-list">
          {recommendedBooths.length === 0 && (
            <div className="festival-empty">
              운영 중인 추천 부스를 집계하고 있습니다.
            </div>
          )}
          {recommendedBooths.map((booth) => {
            const congestion = congestionMap[booth.id];
            return (
              <button
                key={`recommend-${booth.id}`}
                type="button"
                onClick={() => openBoothDetail(booth.id)}
                className="festival-recommend-card"
              >
                <span>{booth.category || "부스"}</span>
                <strong>{booth.name}</strong>
                <small>
                  {congestion?.level || "집계중"} · 대기{" "}
                  {booth.estimatedWaitMinutes ?? "-"}분 ·{" "}
                  {boothReservationText(booth)}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="festival-section">
        <div className="festival-section__head">
          <div>
            <p className="festival-eyebrow">놓치면 안 되는 것</p>
            <h3>실시간 공지</h3>
          </div>
          <p className="festival-section__meta">
            <IconClock className="h-4 w-4" />
            {AJOU_ADDRESS}
          </p>
        </div>
        {locationText && (
          <p className="festival-location">내 위치: {locationText}</p>
        )}
        <div className="space-y-2 stagger-list">
          {visibleNotices.length === 0 && (
            <div className="festival-empty">현재 중요한 공지가 없습니다.</div>
          )}
          {visibleNotices.slice(0, 2).map((notice) => (
            <article
              key={notice.id}
              className={`festival-notice rounded-lg border px-3 py-2 ${noticeColor[notice.category] || "border-slate-300 bg-slate-50 text-slate-700"}`}
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
      </section>

      <section className="festival-section festival-booth-finder">
        <div className="festival-section__head">
          <div>
            <p className="festival-eyebrow">부스 찾기</p>
            <h3>목록과 지도로 확인하기</h3>
          </div>
          <p className="festival-section__meta">
            {filteredBooths.length}개 · 예약 {visibleReservationSeats}명
          </p>
        </div>
        <div className="home-view-toggle z-40 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-900/90 backdrop-blur p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveView("split")}
            className={`rounded-lg min-h-11 text-sm font-semibold ${activeView === "split" ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-cyan-50" : "text-slate-300"}`}
          >
            지도와 함께 보기
          </button>
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={`rounded-lg min-h-11 text-sm font-semibold ${activeView === "list" ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-cyan-50" : "text-slate-300"}`}
          >
            부스 목록
          </button>
        </div>
      </section>

      {activeView !== "list" && (
        <>
          <div
            ref={mapSectionRef}
            className="relative scroll-mt-3 rounded-2xl overflow-hidden border border-slate-200"
          >
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
                      ref={(marker) => {
                        if (marker) {
                          markerRefs.current[booth.id] = marker;
                        } else {
                          delete markerRefs.current[booth.id];
                        }
                      }}
                      position={[booth.latitude, booth.longitude]}
                      icon={getBoothMarkerIcon(booth.category)}
                      title={`${booth.category || "부스"} ${booth.name}`}
                      zIndexOffset={focusedBoothId === booth.id ? 1000 : 0}
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
              <p className="text-sm font-semibold text-slate-800 text-role-map">
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
                    className="shrink-0 w-44 rounded-lg border border-slate-200 px-3 py-2 text-left bg-slate-50"
                  >
                    <p className="text-xs font-semibold text-slate-800 line-clamp-1">
                      {booth.name}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-cyan-700 line-clamp-1">
                      {booth.category || "주점"} · {booth.dayPart || "야간"}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-emerald-200 line-clamp-1">
                      {boothReservationText(booth)}
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
                  </button>
                );
              })}
            </div>
          </div>

          {activeView === "split" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800 text-role-map">
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
                      <p className="mt-1 text-[11px] font-semibold text-cyan-700 line-clamp-1">
                        {boothMetaLabel(booth)}
                        {isBoothOpenNow(booth) ? " · 운영중" : " · 운영전/종료"}
                      </p>
                      <p className="mt-1 text-[11px] font-bold text-emerald-200 line-clamp-1">
                        {boothReservationText(booth)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
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
          <div className="booth-list-toolbar">
            <div className="booth-list-toolbar__top">
              <p className="booth-list-toolbar__summary">
                {filteredBooths.length}개 · 예약 {visibleReservationSeats}명
              </p>
              <button
                type="button"
                onClick={() => setFiltersOpen((prev) => !prev)}
                className={`booth-list-toolbar__button ${filtersOpen ? "booth-list-toolbar__button--active" : ""}`}
              >
                필터
              </button>
              <button
                type="button"
                onClick={downloadBoothCsv}
                className="booth-list-toolbar__button"
              >
                CSV
              </button>
            </div>

            <div className="booth-list-toolbar__quick">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="부스 검색"
                className="booth-list-toolbar__search"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="booth-list-toolbar__sort"
              >
                <option value="displayOrder">운영순</option>
                <option value="name">이름순</option>
                <option value="congestion">혼잡도순</option>
                <option value="reservation">예약순</option>
              </select>
            </div>

            {filtersOpen && (
              <div className="booth-list-toolbar__filters">
              <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="booth-list-toolbar__control"
                >
                  {BOOTH_CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category === "전체" ? "전체 유형" : category}
                    </option>
                  ))}
                </select>
                <select
                  value={dayPartFilter}
                  onChange={(e) => setDayPartFilter(e.target.value)}
                  className="booth-list-toolbar__control"
                >
                  {BOOTH_DAY_PART_OPTIONS.map((part) => (
                    <option key={part} value={part}>
                      {part === "전체" ? "전체 시간대" : part}
                    </option>
                  ))}
                </select>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="booth-list-toolbar__control"
                >
                  <option>전체</option>
                  <option>여유</option>
                  <option>보통</option>
                  <option>혼잡</option>
                  <option>매우혼잡</option>
                </select>
                <button
                  type="button"
                  onClick={() => setOpenNowOnly((prev) => !prev)}
                  className={`booth-list-toolbar__control ${openNowOnly ? "booth-list-toolbar__button--active" : ""}`}
                >
                  운영중
                </button>
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((prev) => !prev)}
                  className={`booth-list-toolbar__control ${favoritesOnly ? "booth-list-toolbar__button--active" : ""}`}
                >
                  좋아요
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFavoritesOnly(false);
                    setLevelFilter("전체");
                    setCategoryFilter("전체");
                    setDayPartFilter("전체");
                    setOpenNowOnly(false);
                    setQuery("");
                  }}
                  className="booth-list-toolbar__control"
                >
                  초기화
                </button>
              </div>
            )}
          </div>

          {loading && (
            <p className="text-sm text-slate-600">
              부스와 혼잡도 데이터를 불러오는 중...
            </p>
          )}
          {error && (
            <article className="overflow-hidden rounded-2xl border border-amber-300/40 bg-slate-950/75">
              <img
                src="/images/location-error.png"
                alt=""
                className="h-32 w-full object-cover object-[70%_center]"
                loading="lazy"
                decoding="async"
              />
              <div className="p-3">
                <p className="text-sm font-bold text-amber-100">{error}</p>
                <p className="mt-1 text-xs text-cyan-100/70">
                  지도와 혼잡도 추천은 위치 권한과 네트워크 상태에 따라 달라질 수 있습니다.
                </p>
              </div>
            </article>
          )}

          {!loading && filteredBooths.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
              검색 조건에 맞는 부스가 없습니다. 지도 보기 탭에서 GPS를 전송하면
              실시간 데이터가 더 정확해집니다.
            </div>
          )}

          <div className="booth-list-stack stagger-list">
            {filteredBooths.map((booth) => {
              const congestion = congestionMap[booth.id];
              const isFavorite = favorites.includes(booth.id);
              const reservedTables = Number(booth.reservationReservedTables) || 0;
              const inUseTables = Number(booth.reservationInUseTables) || 0;
              const isOpen = isBoothOpenNow(booth);

              return (
                <article
                  key={booth.id}
                  className="booth-list-row"
                >
                  <button
                    type="button"
                    onClick={() => openBoothDetail(booth.id)}
                    className="booth-list-row__main"
                  >
                    <div className="min-w-0">
                      <div className="booth-list-row__head">
                        <h3 className="booth-list-row__title text-slate-800 break-keep">
                          {booth.name}
                        </h3>
                        <span
                          className={`booth-reservation-badge ${boothReservationBadgeClass(booth)}`}
                        >
                          {boothReservationText(booth)}
                        </span>
                      </div>
                      <p className="booth-list-row__meta">
                        <span>{booth.category || "주점"}</span>
                        <span>{booth.dayPart || "야간"}</span>
                        <span>{congestion?.level || "집계중"}</span>
                        <span>{isOpen ? "운영중" : "종료"}</span>
                        <span>대기 {booth.estimatedWaitMinutes ?? "-"}분</span>
                      </p>
                      <p className="booth-list-row__reservation">
                        테이블 {reservationTableCount(booth)}개
                        {" · 예약중 "}
                        {reservedTables}개
                        {" · 이용중 "}
                        {inUseTables}개
                      </p>
                    </div>
                  </button>
                  <div className="booth-list-row__actions">
                    <button
                      type="button"
                      aria-label={`${booth.name} 지도에서 보기`}
                      title="지도에서 보기"
                      onClick={() => focusBoothOnMap(booth.id)}
                      className="booth-card-action booth-card-action--map"
                    >
                      <IconMapPin className="h-5 w-5 icon-role-map" />
                    </button>
                    <button
                      type="button"
                      aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
                      onClick={() => handleFavorite(booth.id)}
                      className={`booth-card-action booth-card-action--favorite ${isFavorite ? "booth-card-action--favorite-on" : ""}`}
                    >
                      {isFavorite ? "⭐" : "☆"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}



