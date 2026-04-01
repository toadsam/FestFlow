import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { fetchBoothById, fetchCongestion } from '../api';
import CongestionBadge from '../components/CongestionBadge';
import { getBoothMemo, getFavoriteIds, saveBoothMemo, toggleFavorite } from '../utils/storage';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function boothMeta(id) {
  const categories = ['먹거리', '체험', '굿즈', '게임'];
  const category = categories[id % categories.length];
  const openHour = 10 + (id % 3);
  return {
    category,
    hours: `${String(openHour).padStart(2, '0')}:00 - 22:00`,
  };
}

function getDirectionLinks(booth) {
  const encodedName = encodeURIComponent(booth.name);
  return {
    kakao: `https://map.kakao.com/link/to/${encodedName},${booth.latitude},${booth.longitude}`,
    naver: `https://map.naver.com/v5/search/${encodedName}`,
  };
}

export default function BoothDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booth, setBooth] = useState(null);
  const [congestion, setCongestion] = useState(null);
  const [error, setError] = useState('');
  const [memo, setMemo] = useState('');
  const [favorites, setFavorites] = useState(getFavoriteIds());
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [boothData, congestionData] = await Promise.all([
          fetchBoothById(id),
          fetchCongestion(id),
        ]);
        setBooth(boothData);
        setCongestion(congestionData);
        setMemo(getBoothMemo(id));
      } catch (e) {
        setError(e.message);
      }
    }

    load();
  }, [id]);

  const meta = useMemo(() => boothMeta(Number(id || 0)), [id]);

  async function refreshCongestion() {
    if (!id) return;
    const updated = await fetchCongestion(id);
    setCongestion(updated);
  }

  function handleMemoSave() {
    saveBoothMemo(id, memo);
    setSavedNotice('메모를 저장했습니다.');
    window.setTimeout(() => setSavedNotice(''), 1200);
  }

  function handleFavorite() {
    setFavorites(toggleFavorite(Number(id)));
  }

  if (error) {
    return <p className="pt-4 text-sm text-rose-600">{error}</p>;
  }

  if (!booth || !congestion) {
    return <p className="pt-4 text-sm text-slate-500">부스 정보를 불러오는 중...</p>;
  }

  const isFavorite = favorites.includes(Number(id));
  const links = getDirectionLinks(booth);
  const imageUrl = booth.imageUrl || `https://picsum.photos/seed/festflow-booth-${booth.id}/1200/700`;

  return (
    <section className="pt-4 space-y-4">
      <button type="button" onClick={() => navigate('/')} className="text-sm text-teal-700 font-semibold">
        ← 홈으로 돌아가기
      </button>

      <article className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="aspect-[16/10] bg-slate-100">
          <img src={imageUrl} alt={`${booth.name} 대표 이미지`} className="h-full w-full object-cover" />
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-800">{booth.name}</h2>
            <div className="flex items-center gap-2">
              <CongestionBadge level={congestion.level} />
              <button type="button" onClick={handleFavorite} className="text-xl" aria-label="즐겨찾기">
                {isFavorite ? '⭐' : '☆'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-100 p-2">카테고리: {meta.category}</div>
            <div className="rounded-lg bg-slate-100 p-2">운영시간: {meta.hours}</div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700">부스 설명</p>
            <p className="mt-1 text-sm text-slate-600">{booth.description}</p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">위치 지도</p>
            <p className="mt-1 text-sm text-slate-600">위도 {booth.latitude.toFixed(6)} / 경도 {booth.longitude.toFixed(6)}</p>

            <div className="mt-2 h-44 rounded overflow-hidden">
              <MapContainer center={[booth.latitude, booth.longitude]} zoom={17} className="h-full w-full">
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[booth.latitude, booth.longitude]} icon={markerIcon}>
                  <Popup>{booth.name}</Popup>
                </Marker>
              </MapContainer>
            </div>

            <div className="mt-2 flex gap-2 text-xs">
              <a href={links.kakao} target="_blank" rel="noreferrer" className="rounded-md bg-yellow-100 px-2 py-1 text-yellow-800">
                카카오 길찾기
              </a>
              <a href={links.naver} target="_blank" rel="noreferrer" className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800">
                네이버 지도
              </a>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700">혼잡도 상세</p>
            <p className="mt-1 text-sm text-slate-600">현재 반경 내 사용자 수: {congestion.nearbyUserCount}명</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">내 메모</p>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="기억할 내용 메모"
            />
            <button type="button" onClick={handleMemoSave} className="w-full rounded-xl border border-slate-300 py-2 text-sm font-semibold">
              메모 저장
            </button>
          </div>

          {savedNotice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedNotice}</p>}

          <button type="button" onClick={refreshCongestion} className="w-full rounded-xl border border-teal-700 text-teal-700 py-2.5 font-semibold">
            혼잡도 새로고침
          </button>
        </div>
      </article>
    </section>
  );
}
