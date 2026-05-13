import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createBoothStream, fetchBooths, sendGps } from "../api";
import {
  IconBox,
  IconMapPin,
  IconMusic,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShield,
} from "../components/UxIcons";
import { fallbackBooths, mapCategories } from "../data/festivalUiData";
import { AJOU_CENTER } from "../utils/location";

const FALLBACK_PIN_POSITIONS = [
  [18, 28],
  [72, 26],
  [28, 56],
  [58, 54],
  [80, 68],
  [42, 76],
  [16, 72],
  [82, 46],
];

function normalize(value) {
  return `${value || ""}`.toLowerCase();
}

function boothWait(booth) {
  const value = booth?.estimatedWaitMinutes ?? booth?.wait;
  if (value == null || value === "") return "대기 확인 중";
  return `${String(value).replace("분", "")}분`;
}

function boothDistance(booth, index) {
  if (booth?.distance) return booth.distance;
  const lat = Number(booth?.latitude);
  const lng = Number(booth?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const latM = (lat - AJOU_CENTER.latitude) * 111000;
    const lngM = (lng - AJOU_CENTER.longitude) * 88800;
    const meters = Math.round(Math.sqrt(latM * latM + lngM * lngM));
    if (meters > 0) return `${Math.min(999, meters)}m`;
  }
  return `${100 + index * 50}m`;
}

function displayCategory(booth) {
  const category = booth?.category || "";
  if (category.includes("음식") || category.includes("푸드") || category.includes("주점")) return "푸드";
  if (category.includes("공연") || category.includes("무대")) return "공연";
  if (category.includes("체험") || category.includes("이벤트")) return "체험";
  if (category.includes("안내") || category.includes("본부")) return "안내";
  if (category.includes("응급") || category.includes("안전") || category.includes("편의")) return "편의";
  return category || "전체";
}

function categoryMatches(booth, activeCategory) {
  if (activeCategory === "전체") return true;
  return displayCategory(booth).includes(activeCategory);
}

function mapStatus(booth) {
  const wait = Number(booth?.estimatedWaitMinutes ?? String(booth?.wait || "").replace(/[^0-9]/g, ""));
  if (Number.isFinite(wait)) {
    if (wait >= 25) return { label: "혼잡", tone: "danger" };
    if (wait >= 10) return { label: "보통", tone: "warning" };
    return { label: "여유", tone: "good" };
  }
  if (booth?.congestion) return { label: booth.congestion, tone: booth.congestion === "여유" ? "good" : "warning" };
  return { label: "보통", tone: "warning" };
}

function pinTone(booth, index) {
  const category = displayCategory(booth);
  if (category === "푸드") return "orange";
  if (category === "공연") return "violet";
  if (category === "편의") return "green";
  if (category === "안내") return "blue";
  return ["mint", "blue", "orange", "violet", "green"][index % 5];
}

function boothPinPosition(booth, index) {
  const lat = Number(booth?.latitude);
  const lng = Number(booth?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const x = Math.min(88, Math.max(12, 50 + (lng - AJOU_CENTER.longitude) * 60000));
    const y = Math.min(86, Math.max(12, 50 - (lat - AJOU_CENTER.latitude) * 75000));
    return [x, y];
  }
  return FALLBACK_PIN_POSITIONS[index % FALLBACK_PIN_POSITIONS.length];
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

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("query") || "");
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
    return list.length ? list : source;
  }, [activeCategory, query, source]);

  async function handleLocate() {
    if (!navigator.geolocation) {
      setGeoMessage("이 브라우저에서는 위치 확인을 지원하지 않습니다.");
      return;
    }

    setGeoMessage("현재 위치를 확인하는 중입니다.");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await sendGps(position.coords.latitude, position.coords.longitude);
          setGeoMessage("내 위치를 기준으로 주변 부스 정보를 갱신했습니다.");
        } catch (error) {
          setGeoMessage(error.message);
        }
      },
      () => setGeoMessage("위치 권한이 꺼져 있어 기본 캠퍼스 지도를 표시합니다."),
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
          <button type="button" aria-label="필터 초기화" onClick={() => {
            setActiveCategory("전체");
            setQuery("");
          }}>
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

      <section className="campus-map-card" aria-label="아주대 캠퍼스 축제 지도">
        <div className="campus-map-art">
          <span className="map-road map-road-a" />
          <span className="map-road map-road-b" />
          <span className="map-lawn map-lawn-a" />
          <span className="map-lawn map-lawn-b" />
          <span className="map-water" />
          <span className="map-label">노천극장</span>
          {filteredBooths.slice(0, 8).map((booth, index) => {
            const [x, y] = boothPinPosition(booth, index);
            const tone = pinTone(booth, index);
            return (
              <button
                key={booth.id || `${booth.name}-${index}`}
                type="button"
                className={`map-pin map-pin--${tone}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                aria-label={`${booth.name} 위치`}
                onClick={() => navigate(`/booths/${booth.id || 1}`)}
              >
                <IconMapPin className="h-4 w-4" />
              </button>
            );
          })}
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
                  {item.label === "공연" ? (
                    <IconMusic className="h-4 w-4" />
                  ) : item.label === "편의" ? (
                    <IconShield className="h-4 w-4" />
                  ) : item.label === "체험" ? (
                    <IconBox className="h-4 w-4" />
                  ) : (
                    <IconMapPin className="h-4 w-4" />
                  )}
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
        <div className="booth-mini-list">
          {filteredBooths.map((booth, index) => (
            <button
              key={booth.id || booth.name}
              type="button"
              className="booth-mini-row"
              onClick={() => navigate(`/booths/${booth.id || 1}`)}
            >
              <span className={`map-list-icon map-list-icon--${pinTone(booth, index)}`}>
                {displayCategory(booth) === "공연" ? (
                  <IconMusic className="h-4 w-4" />
                ) : displayCategory(booth) === "편의" ? (
                  <IconShield className="h-4 w-4" />
                ) : (
                  <IconMapPin className="h-4 w-4" />
                )}
              </span>
              <span className="booth-mini-main">
                <strong>{booth.name}</strong>
                <small>{boothDistance(booth, index)} · 대기 {boothWait(booth)}</small>
              </span>
              <span className={`map-status-pill map-status-pill--${mapStatus(booth).tone}`}>
                {mapStatus(booth).label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="primary-wide-button" onClick={() => setActiveCategory("전체")}>
        전체 지도 보기
      </button>
    </section>
  );
}
