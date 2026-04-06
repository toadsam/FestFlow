import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import {
  createCongestionStream,
  createNoticeStream,
  createBoothStream,
  downloadBoothCsv,
  fetchActiveNotices,
  fetchBooths,
  fetchCongestion,
  sendGps,
} from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { resolveBoothImageUrl } from '../config/boothImages';
import { AJOU_ADDRESS, AJOU_CENTER, reverseGeocodeKoreanShort } from '../utils/location';
import { addRecentBooth, getFavoriteIds, getRecentBoothIds, toggleFavorite } from '../utils/storage';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const levelToScore = { 여유: 1, 보통: 2, 혼잡: 3, 매우혼잡: 4 };
const scoreToLevel = ['여유', '보통', '혼잡', '매우혼잡'];
const noticeColor = {
  긴급: 'border-rose-300 bg-rose-50 text-rose-700',
  분실물: 'border-amber-300 bg-amber-50 text-amber-700',
  우천: 'border-sky-300 bg-sky-50 text-sky-700',
};

function normalizeLevel(level) {
  const mapping = {
    '?ъ쑀': '여유',
    '蹂댄넻': '보통',
    '?쇱옟': '혼잡',
    '留ㅼ슦?쇱옟': '매우혼잡',
  };
  return mapping[level] || level;
}

function normalizeCongestion(item) {
  return item ? { ...item, level: normalizeLevel(item.level) } : item;
}

function ZoomWatcher({ onZoomChange }) {
  useMapEvents({
    zoomend: (event) => onZoomChange(event.target.getZoom()),
  });
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
    const congestionLevel = congestionMap[booth.id]?.level || '여유';

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
    const avgScore = Math.max(1, Math.round(cluster.totalScore / cluster.booths.length));
    return {
      ...cluster,
      level: scoreToLevel[avgScore - 1],
    };
  });
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const [booths, setBooths] = useState([]);
  const [congestionMap, setCongestionMap] = useState({});
  const [mapZoom, setMapZoom] = useState(16);
  const [isGridView, setIsGridView] = useState(true);
  const [activeView, setActiveView] = useState('map');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('displayOrder');
  const [levelFilter, setLevelFilter] = useState('전체');
  const [favorites, setFavorites] = useState(getFavoriteIds());
  const [recentIds, setRecentIds] = useState(getRecentBoothIds());
  const [notices, setNotices] = useState([]);
  const [locationText, setLocationText] = useState('');
  const [gpsSending, setGpsSending] = useState(false);
  const previousCongestionRef = useRef({});

  useEffect(() => {
    async function load() {
      try {
        const [boothData, noticeData] = await Promise.all([fetchBooths(), fetchActiveNotices()]);
        setBooths(boothData);
        setNotices(noticeData);

        const congestionData = await Promise.all(
          boothData.map(async (booth) => [booth.id, normalizeCongestion(await fetchCongestion(booth.id))])
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
    boothStream.addEventListener('booths', (event) => {
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

    stream.addEventListener('congestion', (event) => {
      try {
        const list = JSON.parse(event.data);
        const nextMap = Object.fromEntries(list.map((item) => [item.boothId, normalizeCongestion(item)]));

        Object.values(nextMap).forEach((item) => {
          const prev = previousCongestionRef.current[item.boothId];
          if (!prev) return;

          const prevScore = levelToScore[prev.level] || 1;
          const nextScore = levelToScore[item.level] || 1;
          if (nextScore - prevScore >= 2) {
            notify('혼잡 급상승', `${item.boothName} 혼잡도가 ${prev.level} → ${item.level}로 상승했습니다.`);
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

    noticeStream.addEventListener('notices', (event) => {
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
    let list = booths.filter((booth) => booth.name.toLowerCase().includes(query.toLowerCase()));

    if (levelFilter !== '전체') {
      list = list.filter((booth) => congestionMap[booth.id]?.level === levelFilter);
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'congestion') {
        return (levelToScore[congestionMap[b.id]?.level] || 1) - (levelToScore[congestionMap[a.id]?.level] || 1);
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'ko');
      }
      return (a.displayOrder || 999) - (b.displayOrder || 999);
    });
  }, [booths, congestionMap, levelFilter, query, sortBy]);

  const recentBooths = useMemo(() => {
    const byId = new Map(booths.map((booth) => [booth.id, booth]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [booths, recentIds]);

  const chartData = useMemo(() => {
    const levels = ['여유', '보통', '혼잡', '매우혼잡'];
    return levels.map((level) => ({
      label: level,
      value: Object.values(congestionMap).filter((item) => item.level === level).length,
    }));
  }, [congestionMap]);
  const chartMax = useMemo(
    () => Math.max(1, ...chartData.map((item) => item.value)),
    [chartData]
  );

  const clusters = useMemo(() => buildClusters(booths, congestionMap), [booths, congestionMap]);
  const mapQuickBooths = useMemo(() => {
    return [...booths]
      .sort((a, b) => {
        const scoreDiff = (levelToScore[congestionMap[b.id]?.level] || 1) - (levelToScore[congestionMap[a.id]?.level] || 1);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.displayOrder || 999) - (b.displayOrder || 999);
      })
      .slice(0, 12);
  }, [booths, congestionMap]);

  async function refreshAllCongestion() {
    const updates = await Promise.all(booths.map(async (booth) => [booth.id, await fetchCongestion(booth.id)]));
    const normalized = updates.map(([id, item]) => [id, normalizeCongestion(item)]);
    const nextMap = Object.fromEntries(normalized);
    previousCongestionRef.current = nextMap;
    setCongestionMap(nextMap);
  }

  async function handleMockGpsBatch() {
    if (booths.length === 0) return;

    const picks = Array.from({ length: 10 }, () => booths[Math.floor(Math.random() * booths.length)]);

    await Promise.all(
      picks.map((booth) => {
        const jitter = () => (Math.random() - 0.5) * 0.00045;
        return sendGps(booth.latitude + jitter(), booth.longitude + jitter());
      })
    );
  }

  async function handleSendCurrentGps() {
    if (!navigator.geolocation) {
      setError('현재 브라우저에서 GPS를 지원하지 않습니다.');
      return;
    }

    setGpsSending(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          await sendGps(latitude, longitude);
          const area = await reverseGeocodeKoreanShort(latitude, longitude);
          setLocationText(`${area} (위도 ${latitude.toFixed(4)}, 경도 ${longitude.toFixed(4)})`);
          await refreshAllCongestion();
        } catch (e) {
          setError(e.message);
        } finally {
          setGpsSending(false);
        }
      },
      () => {
        setGpsSending(false);
        setError('위치 권한이 거부되어 GPS를 전송하지 못했습니다.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function openBoothDetail(boothId) {
    setRecentIds(addRecentBooth(boothId));
    navigate(`/booths/${boothId}`);
  }

  function handleFavorite(boothId) {
    setFavorites(toggleFavorite(boothId));
  }

  return (
    <section className="space-y-4 pt-4">
      <article className="rounded-xl border border-teal-100 bg-teal-50/70 p-3">
        <p className="text-sm font-semibold text-teal-900">실시간 운영 안내</p>
        <p className="text-xs text-teal-800 mt-1">기준 위치: {AJOU_ADDRESS}</p>
        {locationText && <p className="text-xs text-teal-700 mt-1">내 위치: {locationText}</p>}
      </article>

      <div className="space-y-2">
        {notices.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">현재 등록된 운영 공지가 없습니다.</div>
        )}
        {notices.slice(0, 2).map((notice) => (
          <article key={notice.id} className={`rounded-lg border px-3 py-2 ${noticeColor[notice.category] || 'border-slate-300 bg-slate-50 text-slate-700'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold">{notice.category}</span>
              <span className="text-[10px] opacity-70">{notice.updatedAt?.replace('T', ' ').slice(5, 16)}</span>
            </div>
            <p className="text-sm font-semibold mt-1">{notice.title}</p>
            <p className="text-xs mt-1">{notice.content}</p>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveView('map')}
          className={`rounded-lg min-h-11 text-sm font-semibold ${activeView === 'map' ? 'bg-teal-700 text-white' : 'text-slate-700'}`}
        >
          지도 보기
        </button>
        <button
          type="button"
          onClick={() => setActiveView('list')}
          className={`rounded-lg min-h-11 text-sm font-semibold ${activeView === 'list' ? 'bg-teal-700 text-white' : 'text-slate-700'}`}
        >
          부스 목록
        </button>
      </div>

      {activeView === 'map' && (
        <>
          <div className="rounded-2xl overflow-hidden border border-slate-200">
            <MapContainer center={[AJOU_CENTER.latitude, AJOU_CENTER.longitude]} zoom={17} maxZoom={22} className="h-64 w-full">
              <TileLayer
                attribution='&copy; OpenStreetMap 기여자'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={22}
                maxNativeZoom={19}
              />
              <ZoomWatcher onZoomChange={setMapZoom} />

              {mapZoom >= 16 &&
                booths.map((booth) => {
                  const links = getDirectionLinks(booth);
                  const congestion = congestionMap[booth.id];

                  return (
                    <Marker key={booth.id} position={[booth.latitude, booth.longitude]} icon={markerIcon}>
                      <Popup>
                        <div className="space-y-1">
                          <p className="font-bold">{booth.name}</p>
                          <p className="text-xs text-slate-700">수원시 영통구 아주대학교</p>
                          <p className="text-xs">혼잡도: {congestion?.level || '집계중'}</p>
                          <div className="flex gap-2 text-xs">
                            <a href={links.kakao} target="_blank" rel="noreferrer">카카오 길찾기</a>
                            <a href={links.naver} target="_blank" rel="noreferrer">네이버 지도</a>
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
                    pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.5 }}
                  >
                    <Popup>
                      <p className="font-semibold">{cluster.booths.length}개 부스 클러스터</p>
                      <p className="text-xs">평균 혼잡도: {cluster.level}</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        {cluster.booths.map((booth) => (
                          <li key={booth.id}>{booth.name}</li>
                        ))}
                      </ul>
                    </Popup>
                  </CircleMarker>
                ))}
            </MapContainer>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-800">빠른 부스 이동</p>
              <button
                type="button"
                onClick={() => setActiveView('list')}
                className="text-xs text-teal-700 font-semibold min-h-11 px-2"
              >
                전체 목록 보기
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
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
                      <img src={resolveBoothImageUrl(booth)} alt={`${booth.name} 이미지`} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-slate-800 line-clamp-1">{booth.name}</p>
                      <div className="mt-1">
                        {congestion ? <CongestionBadge level={congestion.level} /> : <span className="text-[11px] text-slate-600">집계중</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleMockGpsBatch} className="rounded-xl bg-teal-700 text-white min-h-11 py-2.5 font-semibold">GPS 샘플 생성</button>
            <button
              type="button"
              onClick={handleSendCurrentGps}
              className="rounded-xl border border-teal-700 text-teal-700 min-h-11 py-2.5 font-semibold"
              disabled={gpsSending}
            >
              {gpsSending ? 'GPS 전송 중...' : '내 위치 전송'}
            </button>
          </div>
        </>
      )}

      {activeView === 'list' && (
        <>
          <div className="sticky top-2 z-30 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 space-y-2 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setIsGridView((prev) => !prev)} className="rounded-lg border border-teal-700 text-teal-700 min-h-11 py-2 text-sm font-semibold">
                {isGridView ? '세로 카드 보기' : '가로 카드 보기'}
              </button>
              <button type="button" onClick={downloadBoothCsv} className="rounded-lg border border-slate-300 min-h-11 py-2 text-sm font-semibold text-slate-700">부스 CSV</button>
            </div>

            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="부스 이름 검색" className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-11 text-sm" />

            <div className="grid grid-cols-2 gap-2">
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 min-h-11 text-sm">
                <option>전체</option><option>여유</option><option>보통</option><option>혼잡</option><option>매우혼잡</option>
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 min-h-11 text-sm">
                <option value="displayOrder">운영순</option><option value="name">이름순</option><option value="congestion">혼잡도순</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">혼잡도 요약</p>
            <div className="h-24 flex items-end gap-2 overflow-hidden">
              {chartData.map((item) => (
                <div key={item.label} className="flex-1 text-center">
                  <div
                    className="mx-auto w-full rounded-t bg-teal-500/80"
                    style={{ height: `${Math.max(8, Math.round((item.value / chartMax) * 88))}px` }}
                  />
                  <p className="mt-1 text-[10px] text-slate-600">{item.label} ({item.value})</p>
                </div>
              ))}
            </div>
          </div>

          {recentBooths.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-700 mb-2">최근 본 부스</p>
              <div className="flex flex-wrap gap-2">
                {recentBooths.map((booth) => (
                  <button key={booth.id} type="button" onClick={() => openBoothDetail(booth.id)} className="rounded-full bg-slate-100 px-3 py-2 min-h-11 text-sm text-slate-700">{booth.name}</button>
                ))}
              </div>
            </div>
          )}

          {loading && <p className="text-sm text-slate-600">부스와 혼잡도 데이터를 불러오는 중...</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}

          {!loading && filteredBooths.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
              검색 조건에 맞는 부스가 없습니다. 지도 보기 탭에서 GPS를 전송하면 실시간 데이터가 더 정확해집니다.
            </div>
          )}

          <div className={isGridView ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
            {filteredBooths.map((booth) => {
              const congestion = congestionMap[booth.id];
              const isFavorite = favorites.includes(booth.id);

              return (
                <button key={booth.id} type="button" onClick={() => openBoothDetail(booth.id)} className="w-full h-full text-left rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="aspect-[16/9] bg-slate-100">
                    <img src={resolveBoothImageUrl(booth)} alt={`${booth.name} 대표 이미지`} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 leading-tight break-keep">{booth.name}</h3>
                        <p className="text-xs text-slate-700 mt-1">
                          혼잡도 {congestion?.level || '집계중'}
                          {' · '}
                          대기 {booth.estimatedWaitMinutes ?? '-'}분
                        </p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-1">{booth.description}</p>
                      </div>
                      <div className="shrink-0">
                        {congestion ? <CongestionBadge level={congestion.level} /> : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-teal-700 font-semibold">자세히 보기 →</p>
                      <button
                        type="button"
                        aria-label="즐겨찾기"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavorite(booth.id);
                        }}
                        className="text-2xl leading-none min-h-11 min-w-11"
                      >
                        {isFavorite ? '⭐' : '☆'}
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
