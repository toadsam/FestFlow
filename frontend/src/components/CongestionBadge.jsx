const colorMap = {
  여유: 'bg-emerald-100 text-emerald-700',
  보통: 'bg-amber-100 text-amber-700',
  혼잡: 'bg-orange-100 text-orange-700',
  매우혼잡: 'bg-rose-100 text-rose-700',
};

const iconMap = {
  여유: '🟢',
  보통: '🟡',
  혼잡: '🟠',
  매우혼잡: '🔴',
};

export default function CongestionBadge({ level }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${colorMap[level] || 'bg-slate-100 text-slate-600'}`}>
      <span aria-hidden>{iconMap[level] || '⚪'}</span>
      {level}
    </span>
  );
}
