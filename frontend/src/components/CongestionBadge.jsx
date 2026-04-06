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

function normalizeLevel(level) {
  const mapping = {
    '?ъ쑀': '여유',
    '蹂댄넻': '보통',
    '?쇱옟': '혼잡',
    '留ㅼ슦?쇱옟': '매우혼잡',
  };
  return mapping[level] || level;
}

export default function CongestionBadge({ level }) {
  const normalized = normalizeLevel(level);
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap ${colorMap[normalized] || 'bg-slate-100 text-slate-600'}`}>
      <span aria-hidden>{iconMap[normalized] || '⚪'}</span>
      {normalized}
    </span>
  );
}
