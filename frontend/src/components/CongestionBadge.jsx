const colorMap = {
  여유: 'bg-emerald-100 text-emerald-700',
  보통: 'bg-amber-100 text-amber-700',
  혼잡: 'bg-orange-100 text-orange-700',
  매우혼잡: 'bg-rose-100 text-rose-700',
};

export default function CongestionBadge({ level }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colorMap[level] || 'bg-slate-100 text-slate-600'}`}>
      {level}
    </span>
  );
}
