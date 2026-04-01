import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBooths, fetchCongestion, sendGps } from '../api';
import CongestionBadge from '../components/CongestionBadge';

function getBoothImageUrl(boothId) {
  return `https://picsum.photos/seed/festflow-booth-${boothId}/800/450`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [booths, setBooths] = useState([]);
  const [congestionMap, setCongestionMap] = useState({});
  const [isGridView, setIsGridView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const boothData = await fetchBooths();
        setBooths(boothData);

        const congestionData = await Promise.all(
          boothData.map(async (booth) => [booth.id, await fetchCongestion(booth.id)])
        );
        setCongestionMap(Object.fromEntries(congestionData));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleMockGps() {
    if (booths.length === 0) return;
    const firstBooth = booths[0];
    const jitter = () => (Math.random() - 0.5) * 0.0005;

    await sendGps(firstBooth.latitude + jitter(), firstBooth.longitude + jitter());
    const updated = await fetchCongestion(firstBooth.id);
    setCongestionMap((prev) => ({ ...prev, [firstBooth.id]: updated }));
  }

  return (
    <section className="space-y-4 pt-4">
      <div className="rounded-2xl overflow-hidden border border-slate-200">
        <div className="h-48 bg-gradient-to-br from-cyan-100 via-teal-100 to-emerald-100 p-4">
          <p className="text-sm font-semibold text-slate-700">축제 맵 (더미 지도)</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {booths.slice(0, 4).map((booth) => (
              <div key={booth.id} className="rounded-lg bg-white/80 p-2 text-xs text-slate-700">
                <p className="font-bold">{booth.name}</p>
                <p>{booth.latitude.toFixed(4)}, {booth.longitude.toFixed(4)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleMockGps}
        className="w-full rounded-xl bg-teal-700 text-white py-2.5 font-semibold active:scale-[0.99]"
      >
        내 위치 전송(샘플)
      </button>

      <p className="text-xs text-slate-500">
        아래 부스 카드를 누르면 상세 페이지(설명/위치/혼잡도)로 이동합니다.
      </p>

      <button
        type="button"
        onClick={() => setIsGridView((prev) => !prev)}
        className="w-full rounded-xl border border-teal-700 text-teal-700 py-2.5 font-semibold"
      >
        {isGridView ? '카드 1열 보기' : '카드 2열 보기'}
      </button>

      {loading && <p className="text-sm text-slate-500">데이터를 불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={isGridView ? 'grid grid-cols-2 gap-3' : 'space-y-4'}>
        {booths.map((booth) => {
          const congestion = congestionMap[booth.id];
          return (
            <button
              key={booth.id}
              type="button"
              onClick={() => navigate(`/booths/${booth.id}`)}
              className="w-full h-full text-left rounded-2xl border border-slate-200 bg-white overflow-hidden active:scale-[0.995]"
            >
              <div className="aspect-[16/9] bg-slate-100">
                <img
                  src={getBoothImageUrl(booth.id)}
                  alt={`${booth.name} 대표 이미지`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800">{booth.name}</h3>
                    <p className={`text-slate-600 mt-1 ${isGridView ? 'text-xs line-clamp-2' : 'text-sm'}`}>
                      {booth.description}
                    </p>
                  </div>
                  {congestion ? <CongestionBadge level={congestion.level} /> : null}
                </div>
                <p className="text-xs text-teal-700 font-semibold mt-3">자세히 보기 →</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
