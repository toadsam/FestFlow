import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useLocation, useNavigate } from "react-router-dom";
import { createBoothStream, fetchBooths, sendGps } from "../api";
import {
  IconBox,
  IconMapPin,
  IconMusic,
  IconSearch,
  IconSettings,
  IconShield,
} from "../components/UxIcons";
import { fallbackBooths, mapCategories } from "../data/festivalUiData";
import { AJOU_CENTER } from "../utils/location";

const FALLBACK_COORD_OFFSETS = [
  [-0.0009, -0.001],
  [-0.0005, 0.0008],
  [0.00045, -0.00085],
  [0.0002, 0.00015],
  [0.0007, 0.001],
  [-0.0011, 0.00025],
  [0.001, -0.0002],
  [-0.0002, 0.0012],
];
const CAMPUS_RADIUS_METERS = 2500;
const SEARCH_RESULT_MAX_ZOOM = 17;
const DEFAULT_VISIBLE_MAP_PINS = 18;

function normalize(value) {
  return `${value || ""}`.toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function boothWait(booth) {
  const value = booth?.estimatedWaitMinutes ?? booth?.wait;
  if (value == null || value === "") return "확인 중";
  return `${String(value).replace("분", "")}분`;
}

function distanceFromAjou(lat, lng) {
  const latM = (lat - AJOU_CENTER.latitude) * 111000;
  const lngM = (lng - AJOU_CENTER.longitude) * 88800;
  return Math.sqrt(latM * latM + lngM * lngM);
}

function isCampusCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return distanceFromAjou(lat, lng) <= CAMPUS_RADIUS_METERS;
}

function getBoothCoords(booth, index) {
  const lat = Number(booth?.latitude);
  const lng = Number(booth?.longitude);
  if (isCampusCoordinate(lat, lng)) {
    return { latitude: lat, longitude: lng, real: true };
  }
  const [latOffset, lngOffset] = FALLBACK_COORD_OFFSETS[index % FALLBACK_COORD_OFFSETS.length];
  return {
    latitude: AJOU_CENTER.latitude + latOffset,
    longitude: AJOU_CENTER.longitude + lngOffset,
    real: false,
  };
}

function boothDistance(booth, index) {
  if (booth?.distance) return booth.distance;
  const point = getBoothCoords(booth, index);
  const meters = Math.max(30, Math.round(distanceFromAjou(point.latitude, point.longitude)));
  return `${Math.min(999, meters)}m`;
}

function displayCategory(booth) {
  const category = normalize(booth?.category).replace(/\s+/g, "");
  const primaryText = normalize(`${booth?.name || ""} ${booth?.description || ""} ${booth?.locationName || ""} ${booth?.tags || ""}`).replace(/\s+/g, "");
  const allText = `${primaryText}${category}`;

  if (includesAny(primaryText, ["중앙무대", "메인무대", "무대", "스테이지", "노천극장", "공연", "라인업", "dj"])) {
    return "공연";
  }
  if (includesAny(primaryText, ["응급", "케어", "안전", "의무", "구급", "분실물", "화장실", "충전"])) {
    return "편의";
  }
  if (includesAny(primaryText, ["vr", "ai", "캐리커처", "챌린지", "체험", "이벤트", "럭키드로우", "스탬프", "게임", "미션"])) {
    return "체험";
  }
  if (includesAny(primaryText, ["안내", "본부", "스태프", "센터"])) {
    return "안내";
  }
  if (includesAny(allText, ["음식", "푸드", "주점", "먹거리", "트럭", "타코", "야끼", "카페", "분식", "메뉴"])) {
    return "푸드";
  }
  if (includesAny(category, ["공연", "무대"])) return "공연";
  if (includesAny(category, ["체험", "이벤트"])) return "체험";
  if (includesAny(category, ["안내", "본부"])) return "안내";
  if (includesAny(category, ["응급", "안전", "편의"])) return "편의";
  return category || "전체";
}

function categoryMatches(booth, activeCategory) {
  if (activeCategory === "전체") return true;
  return displayCategory(booth).includes(activeCategory);
}

function mapStatus(booth) {
  return statusFromWaitLabel(boothWait(booth), booth?.congestion);
}

function statusFromWaitLabel(waitLabel, fallbackLabel) {
  const wait = Number(String(waitLabel || "").replace(/[^0-9]/g, ""));
  let label = "보통";

  if (Number.isFinite(wait)) {
    if (wait >= 25) label = "혼잡";
    else if (wait >= 10) label = "보통";
    else label = "여유";
  } else if (fallbackLabel) {
    label = fallbackLabel;
  }

  if (label.includes("혼잡")) return { label, tone: "danger", color: "#ef4444" };
  if (label.includes("여유") || label.includes("한산")) return { label, tone: "good", color: "#22c55e" };
  return { label, tone: "warning", color: "#f59e0b" };
}

function pinTone(booth, index) {
  const category = displayCategory(booth);
  if (category === "푸드") return "orange";
  if (category === "공연") return "violet";
  if (category === "편의") return "green";
  if (category === "안내") return "blue";
  return ["mint", "blue", "orange", "violet", "green"][index % 5];
}

function listIconCategory(booth, index) {
  const category = displayCategory(booth);
  if (category !== "푸드") return category;

  const name = normalize(booth?.name).replace(/\s+/g, "");
  if (includesAny(name, ["무대", "스테이지", "공연"])) return "공연";
  if (includesAny(name, ["응급", "케어", "안전", "분실물"])) return "편의";
  if (includesAny(name, ["vr", "ai", "캐리커처", "챌린지", "스탬프", "미션", "럭키드로우"])) return "체험";

  if (index === 1) return "공연";
  if (index === 2) return "편의";
  return category;
}

function categoryIconSvg(category) {
  if (category === "푸드") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7M9 3v7M7.5 10v11M18 3v18M15 3v5.5c0 2 1.2 3.4 3 4.2"/></svg>';
  }
  if (category === "공연") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  }
  if (category === "편의") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.8-2.8 8.3-7 10-4.2-1.7-7-5.2-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
  }
  if (category === "안내") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-4.4 7-11A7 7 0 1 0 5 10c0 6.6 7 11 7 11z"/><path d="M12 10v5"/><path d="M12 7h.01"/></svg>';
  }
  if (category === "체험") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-4.4 7-11A7 7 0 1 0 5 10c0 6.6 7 11 7 11z"/><circle cx="12" cy="10" r="2"/></svg>';
}

function pinIconMarkup(booth) {
  const category = displayCategory(booth);
  return categoryIconSvg(category);
}

function markerIcon(booth, index) {
  return L.divIcon({
    className: `festival-map-pin festival-map-pin--${pinTone(booth, index)}`,
    html: `<span>${pinIconMarkup(booth)}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function CategoryIcon({ category, className = "h-4 w-4" }) {
  if (category === "푸드") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <path d="M6 3v7" />
        <path d="M9 3v7" />
        <path d="M7.5 10v11" />
        <path d="M18 3v18" />
        <path d="M15 3v5.5c0 2 1.2 3.4 3 4.2" />
      </svg>
    );
  }

  if (category === "공연") return <IconMusic className={className} />;
  if (category === "체험") return <IconBox className={className} />;
  if (category === "편의") return <IconShield className={className} />;

  if (category === "안내") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
        <path d="M12 10v5" />
        <path d="M12 7h.01" />
      </svg>
    );
  }

  return <IconMapPin className={className} />;
}

function MapViewport({ points, currentLocation, searchActive }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (searchActive) {
      if (points.length > 1) {
        map.fitBounds(points.map((point) => [point.latitude, point.longitude]), {
          padding: [44, 44],
          maxZoom: SEARCH_RESULT_MAX_ZOOM,
        });
      } else if (points.length === 1) {
        map.flyTo([points[0].latitude, points[0].longitude], SEARCH_RESULT_MAX_ZOOM, { animate: true });
      }
      return;
    }
    if (currentLocation) {
      map.setView([currentLocation.latitude, currentLocation.longitude], 18, { animate: true });
      return;
    }
    if (points.length > 1) {
      map.fitBounds(points.map((point) => [point.latitude, point.longitude]), {
        padding: [28, 28],
        maxZoom: 18,
      });
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 18);
    }
  }, [currentLocation, map, points, searchActive]);

  return null;
}

export default function StageMapPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booths, setBooths] = useState([]);
  const [activeCategory, setActiveCategory] = useState("전체");
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("query") || "");
  const [searchOpen, setSearchOpen] = useState(() => Boolean(new URLSearchParams(location.search).get("query")));
  const [geoMessage, setGeoMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get("query") || "";
    setQuery(nextQuery);
    if (nextQuery) setSearchOpen(true);
  }, [location.search]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchBooths()
      .then((data) => {
        if (mounted) setBooths(data || []);
      })
      .catch(() => {
        if (mounted) setBooths([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    let stream = null;
    try {
      stream = createBoothStream();
      stream.addEventListener("booths", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setBooths(next);
        } catch {
          // Ignore malformed stream payloads.
        }
      });
    } catch {
      // Real-time booth updates are optional.
    }

    return () => {
      mounted = false;
      stream?.close();
    };
  }, []);

  const source = booths.length ? booths : fallbackBooths;

  const filteredBooths = useMemo(() => {
    const keyword = normalize(query.trim());
    const list = source.filter((booth) => {
      const category = booth.category || "";
      const matchCategory = categoryMatches(booth, activeCategory);
      const matchQuery =
        !keyword ||
        normalize(booth.name).includes(keyword) ||
        normalize(booth.description).includes(keyword) ||
        normalize(booth.locationName).includes(keyword) ||
        normalize(booth.tags).includes(keyword) ||
        normalize(category).includes(keyword) ||
        normalize(displayCategory(booth)).includes(keyword);
      return matchCategory && matchQuery;
    });
    return list;
  }, [activeCategory, query, source]);

  const mapBooths = useMemo(
    () =>
      filteredBooths.map((booth, index) => ({
        booth,
        index,
        point: getBoothCoords(booth, index),
      })),
    [filteredBooths],
  );
  const visibleMapBooths = useMemo(() => {
    if (query.trim()) return mapBooths;
    return mapBooths.slice(0, DEFAULT_VISIBLE_MAP_PINS);
  }, [mapBooths, query]);
  const mapPoints = useMemo(() => visibleMapBooths.map((item) => item.point), [visibleMapBooths]);

  async function handleLocate() {
    if (!navigator.geolocation) {
      setGeoMessage("이 브라우저에서는 위치 확인을 지원하지 않습니다.");
      return;
    }

    setGeoMessage("현재 위치를 확인하는 중입니다.");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentLocation(nextLocation);
        try {
          await sendGps(nextLocation.latitude, nextLocation.longitude);
          setGeoMessage("내 위치를 지도와 서버에 반영했습니다.");
        } catch (error) {
          setGeoMessage(error.message);
        }
      },
      () => setGeoMessage("위치 권한이 꺼져 있어 아주대 중심 지도를 표시합니다."),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 2500 },
    );
  }

  return (
    <section className="uni-page map-page reference-map-page">
      <header className="plain-page-header reference-map-header">
        <span />
        <h1>지도</h1>
        <div className="reference-map-actions">
          <button type="button" aria-label="부스 검색" onClick={() => setSearchOpen((prev) => !prev)}>
            <IconSearch className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="필터 초기화"
            onClick={() => {
              setActiveCategory("전체");
              setQuery("");
              setSearchOpen(false);
            }}
          >
            <IconSettings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <label className="search-field map-search-field">
          <IconSearch className="h-4 w-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="부스명, 음식, 키워드 검색"
            autoFocus
          />
        </label>
      )}

      <section className="campus-map-card real-campus-map-card" aria-label="아주대 캠퍼스 축제 지도">
        <MapContainer
          center={[AJOU_CENTER.latitude, AJOU_CENTER.longitude]}
          zoom={17}
          minZoom={15}
          maxZoom={19}
          scrollWheelZoom
          className="real-campus-map"
        >
          <MapViewport points={mapPoints} currentLocation={currentLocation} searchActive={Boolean(query.trim())} />
          <TileLayer
            attribution="&copy; OpenStreetMap"
            maxNativeZoom={19}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {visibleMapBooths.map(({ booth, index, point }) => {
            return (
              <Marker
                key={booth.id || `${booth.name}-${index}`}
                position={[point.latitude, point.longitude]}
                icon={markerIcon(booth, index)}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  <span className="map-tooltip">{booth.name}</span>
                </Tooltip>
                <Popup>
                  <div className="map-popup-card">
                    <strong>{booth.name}</strong>
                    <span>{displayCategory(booth)} · 대기 {boothWait(booth)}</span>
                    <button type="button" onClick={() => navigate(`/booths/${booth.id || 1}`)}>
                      상세 보기
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {currentLocation && (
            <CircleMarker
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={10}
              pathOptions={{
                color: "#ffffff",
                weight: 4,
                fillColor: "#2563eb",
                fillOpacity: 0.95,
              }}
            >
              <Tooltip direction="top" offset={[0, -10]}>내 위치</Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
        <div className="campus-map-overlay" aria-hidden="true">
          <div className="map-purpose-badge">
            <strong>아주대 캠퍼스 축제 지도</strong>
            <span>부스 · 공연 · 편의 위치</span>
          </div>
          <div className="map-mini-legend">
            <span><i className="legend-dot legend-dot--orange" />푸드</span>
            <span><i className="legend-dot legend-dot--violet" />공연</span>
            <span><i className="legend-dot legend-dot--green" />편의</span>
          </div>
        </div>
        <button type="button" className="map-location-button" onClick={handleLocate}>내 위치</button>
      </section>

      {geoMessage && <p className="app-inline-note">{geoMessage}</p>}

      <section className="uni-section">
        <div className="uni-section-head">
          <h2>카테고리</h2>
          <span>{loading ? "갱신 중" : `${filteredBooths.length}곳`}</span>
        </div>
        <div className="category-icon-grid">
          {mapCategories.map((item) => {
            const active = activeCategory === item.label;
            return (
              <button
                key={item.label}
                type="button"
                className={active ? "category-chip category-chip--active" : "category-chip"}
                onClick={() => setActiveCategory(item.label)}
              >
                <span className={`category-chip-icon category-chip-icon--${item.color}`}>
                  <CategoryIcon category={item.label} className="h-4 w-4" />
                </span>
                <strong>{item.label}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="uni-section">
        <div className="uni-section-head">
          <h2>내 주변 부스</h2>
          <span>{filteredBooths.length}곳</span>
        </div>
        <div className="booth-mini-list" data-i18n-skip>
          {filteredBooths.map((booth, index) => {
            const waitLabel = boothWait(booth);
            const status = statusFromWaitLabel(waitLabel, booth?.congestion);
            const iconCategory = listIconCategory(booth, index);

            return (
              <button
                key={booth.id || booth.name}
                type="button"
                className="booth-mini-row"
                onClick={() => navigate(`/booths/${booth.id || 1}`)}
              >
                <span className={`map-list-icon map-list-icon--${pinTone({ ...booth, category: iconCategory }, index)}`}>
                  <CategoryIcon category={iconCategory} className="h-4 w-4" />
                </span>
                <span className="booth-mini-main">
                  <strong>{booth.name}</strong>
                  <small>{boothDistance(booth, index)} · 대기 {waitLabel}</small>
                </span>
                <span
                  className={`map-status-pill map-status-pill--${status.tone}`}
                  data-label={status.label}
                  data-status={status.tone}
                  data-i18n-skip
                >
                  {status.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        className="primary-wide-button"
        onClick={() => {
          setActiveCategory("전체");
          setQuery("");
          setSearchOpen(false);
        }}
      >
        전체 지도 보기
      </button>
    </section>
  );
}
