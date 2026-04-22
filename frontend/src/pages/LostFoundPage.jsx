import { useEffect, useMemo, useState } from "react";
import { createLostItemStream, fetchLostItems } from "../api";

const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "REGISTERED", label: "보관 중" },
  { value: "RETURNED", label: "수령 완료" },
];

export default function LostFoundPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLostItems();
      setItems(data || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const stream = createLostItemStream();
    stream.addEventListener("lost-items", (event) => {
      try {
        const next = JSON.parse(event.data);
        if (Array.isArray(next)) {
          setItems(next);
        }
      } catch {
        // ignore malformed payload
      }
    });
    return () => stream.close();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const byStatus = statusFilter === "ALL" || item.status === statusFilter;
      const q = query.trim().toLowerCase();
      const byQuery =
        q === "" ||
        item.title?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.foundLocation?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q);
      return byStatus && byQuery;
    });
  }, [items, query, statusFilter]);

  return (
    <section className="cyber-page pt-4 pb-24 space-y-4">
      <article className="rounded-2xl border border-cyan-300/60 bg-slate-950/80 p-4 text-cyan-50">
        <p className="text-xs tracking-[0.16em] uppercase text-cyan-300/90">
          Lost & Found
        </p>
        <h2 className="mt-1 text-xl font-extrabold">분실물 센터</h2>
        <p className="mt-1 text-sm text-cyan-100/85">
          누구나 조회할 수 있고, 분실물 등록은 스태프 페이지에서 진행합니다.
        </p>
      </article>

      <article className="rounded-xl border border-cyan-200/70 bg-slate-950/75 p-3 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="분실물명, 위치, 설명으로 검색"
          className="w-full rounded-lg border border-cyan-300/60 bg-slate-900/80 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/55 outline-none focus:border-cyan-200"
        />

        <div className="grid grid-cols-3 gap-2">
          {STATUS_OPTIONS.map((option) => {
            const active = statusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-cyan-200 bg-cyan-500 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.45)]"
                    : "border-cyan-700/70 bg-slate-900/60 text-cyan-100 hover:border-cyan-300"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-cyan-100/80">
          필터 결과 {filteredItems.length}건 / 전체 {items.length}건
        </p>
      </article>

      <article className="rounded-xl border border-cyan-900/70 bg-slate-950/60 p-3 text-xs text-cyan-100/80">
        분실물 등록과 상태 변경은 스태프 페이지에서만 가능합니다.
      </article>

      {message && (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">분실물 목록을 불러오는 중...</p>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.category} · {item.foundLocation}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    item.status === "RETURNED"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {item.statusLabel}
                </span>
              </div>
              {item.imageUrl && (
                <div className="mt-2 overflow-hidden rounded border border-slate-200">
                  <img
                    src={item.imageUrl}
                    alt={`${item.title} 사진`}
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}
              <p className="mt-2 text-sm text-slate-700">{item.description}</p>
              {item.finderContact && (
                <p className="mt-1 text-xs text-slate-600">
                  연락처: {item.finderContact}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                등록: {item.createdAt?.replace("T", " ").slice(5, 16)} · 등록자{" "}
                {item.reporterType} {item.reporterRef}
              </p>
            </article>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-sm text-slate-400">
              조건에 맞는 분실물이 없습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
