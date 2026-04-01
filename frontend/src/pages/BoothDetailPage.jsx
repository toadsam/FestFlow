import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchBoothById, fetchCongestion } from '../api';
import CongestionBadge from '../components/CongestionBadge';

function getBoothImageUrl(boothId) {
  return `https://picsum.photos/seed/festflow-booth-${boothId}/1200/700`;
}

export default function BoothDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booth, setBooth] = useState(null);
  const [congestion, setCongestion] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [boothData, congestionData] = await Promise.all([
          fetchBoothById(id),
          fetchCongestion(id),
        ]);
        setBooth(boothData);
        setCongestion(congestionData);
      } catch (e) {
        setError(e.message);
      }
    }
    load();
  }, [id]);

  async function refreshCongestion() {
    if (!id) return;
    const updated = await fetchCongestion(id);
    setCongestion(updated);
  }

  if (error) {
    return <p className="pt-4 text-sm text-rose-600">{error}</p>;
  }

  if (!booth || !congestion) {
    return <p className="pt-4 text-sm text-slate-500">부스 정보를 불러오는 중...</p>;
  }

  return (
    <section className="pt-4 space-y-4">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="text-sm text-teal-700 font-semibold"
      >
        ← 홈으로 돌아가기
      </button>

      <article className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="aspect-[16/10] bg-slate-100">
          <img
            src={getBoothImageUrl(booth.id)}
            alt={`${booth.name} 대표 이미지`}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-800">{booth.name}</h2>
            <CongestionBadge level={congestion.level} />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700">부스 설명</p>
            <p className="mt-1 text-sm text-slate-600">{booth.description}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700">위치</p>
            <p className="mt-1 text-sm text-slate-600">
              위도 {booth.latitude.toFixed(6)} / 경도 {booth.longitude.toFixed(6)}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700">혼잡도 상세</p>
            <p className="mt-1 text-sm text-slate-600">현재 반경 내 사용자 수: {congestion.nearbyUserCount}명</p>
          </div>

          <button
            type="button"
            onClick={refreshCongestion}
            className="w-full rounded-xl border border-teal-700 text-teal-700 py-2.5 font-semibold"
          >
            혼잡도 새로고침
          </button>
        </div>
      </article>
    </section>
  );
}
