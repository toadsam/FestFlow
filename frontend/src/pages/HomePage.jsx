import { useEffect, useMemo, useState } from 'react';
import { fetchBooths, fetchCongestion, sendGps } from '../api';
import CongestionBadge from '../components/CongestionBadge';

export default function HomePage() {
  const [booths, setBooths] = useState([]);
  const [congestionMap, setCongestionMap] = useState({});
  const [selectedBoothId, setSelectedBoothId] = useState(null);
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

  const selectedBooth = useMemo(
    () => booths.find((booth) => booth.id === selectedBoothId) ?? null,
    [booths, selectedBoothId]
  );

  async function handleMockGps() {
    if (booths.length === 0) return;
    const firstBooth = booths[0];

    // Add a tiny random offset to simulate nearby user positions.
    const jitter = () => (Math.random() - 0.5) * 0.0005;
    await sendGps(firstBooth.latitude + jitter(), firstBooth.longitude + jitter());

    const updated = await fetchCongestion(firstBooth.id);
    setCongestionMap((prev) => ({ ...prev, [firstBooth.id]: updated }));
    if (selectedBoothId === firstBooth.id) {
      setCongestionMap((prev) => ({ ...prev, [selectedBoothId]: updated }));
    }
  }

  async function refreshSelectedCongestion() {
    if (!selectedBoothId) return;
    const updated = await fetchCongestion(selectedBoothId);
    setCongestionMap((prev) => ({ ...prev, [selectedBoothId]: updated }));
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
                <p>
                  {booth.latitude.toFixed(4)}, {booth.longitude.toFixed(4)}
                </p>
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

      {loading && <p className="text-sm text-slate-500">데이터를 불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="space-y-3">
        {booths.map((booth) => {
          const congestion = congestionMap[booth.id];
          return (
            <button
              key={booth.id}
              type="button"
              onClick={() => setSelectedBoothId(booth.id)}
              className="w-full text-left rounded-xl border border-slate-200 p-3 bg-white active:scale-[0.995]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">{booth.name}</h3>
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{booth.description}</p>
                </div>
                {congestion ? <CongestionBadge level={congestion.level} /> : null}
              </div>
            </button>
          );
        })}
      </div>

      {selectedBooth && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 p-4" onClick={() => setSelectedBoothId(null)}>
          <article
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-full max-w-[430px] rounded-t-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-800">{selectedBooth.name}</h3>
              <button
                type="button"
                className="text-sm text-slate-500"
                onClick={() => setSelectedBoothId(null)}
              >
                닫기
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div>
                <p className="font-semibold">부스 설명</p>
                <p className="mt-1">{selectedBooth.description}</p>
              </div>
              <div>
                <p className="font-semibold">위치</p>
                <p className="mt-1">
                  위도 {selectedBooth.latitude.toFixed(6)} / 경도 {selectedBooth.longitude.toFixed(6)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-semibold">현재 혼잡도</p>
                <div className="flex items-center gap-2">
                  {congestionMap[selectedBooth.id] ? (
                    <>
                      <CongestionBadge level={congestionMap[selectedBooth.id].level} />
                      <span className="text-xs text-slate-500">
                        주변 {congestionMap[selectedBooth.id].nearbyUserCount}명
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">조회 중...</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={refreshSelectedCongestion}
              className="mt-5 w-full rounded-xl border border-teal-700 text-teal-700 py-2.5 font-semibold"
            >
              혼잡도 새로고침
            </button>
          </article>
        </div>
      )}
    </section>
  );
}
