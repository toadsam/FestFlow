import { useEffect, useMemo, useState } from "react";
import { claimLostItem, createLostItemStream, fetchLostItems } from "../api";
import { IconBox, IconClock, IconSearch } from "../components/UxIcons";

const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "REGISTERED", label: "보관 중" },
  { value: "OWNER_CLAIMED", label: "주인 확인" },
  { value: "RETURNED", label: "반환 완료" },
];

const STATUS_LABELS = {
  REGISTERED: "보관 중",
  OWNER_CLAIMED: "주인 확인",
  RETURNED: "반환 완료",
};

function toTelHref(value) {
  const raw = `${value || ""}`.trim();
  if (!raw) return "";
  const digits = raw.replace(/[^0-9+]/g, "");
  if (!digits) return "";
  return `tel:${digits}`;
}

export default function LostFoundPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [claimOpenId, setClaimOpenId] = useState(null);
  const [claimDrafts, setClaimDrafts] = useState({});
  const [claimingId, setClaimingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLostItems();
      setItems(data || []);
      setMessage("");
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

  async function handleClaim(itemId) {
    const draft = claimDrafts[itemId] || {};
    const claimantName = `${draft.claimantName || ""}`.trim();
    const claimantContact = `${draft.claimantContact || ""}`.trim();
    const claimantNote = `${draft.claimantNote || ""}`.trim();

    if (!claimantName || !claimantContact) {
      setMessage("이름과 연락처를 입력해 주세요.");
      return;
    }

    setClaimingId(itemId);
    try {
      await claimLostItem(itemId, { claimantName, claimantContact, claimantNote });
      setMessage("내 물건 표시 요청이 접수되었습니다. 스태프가 확인 후 안내합니다.");
      setClaimOpenId(null);
    } catch (error) {
      setMessage(error?.message || "내 물건 표시 요청에 실패했습니다.");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <section className="cyber-page pt-4 pb-24 space-y-3 scan-enter">
      <article className="rounded-2xl border border-cyan-300/65 bg-gradient-to-br from-[#05345f] via-[#0c5f93] to-[#18b8da] p-4 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.28)]">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100/50 bg-cyan-500/25">
            <IconBox className="h-5 w-5 icon-role-map" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/95">Lost & Found</p>
            <h2 className="mt-1 text-xl font-extrabold text-role-map">분실물 센터</h2>
            <p className="mt-1 text-xs text-cyan-100/90">
              분실물 사진 확인 후 내 물건 표시가 가능합니다. 연락처가 등록된 물품은 바로 연락할 수 있습니다.
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-cyan-300/50 bg-slate-950/75 p-3 space-y-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 icon-role-log" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="분실물명, 위치, 설명으로 검색"
            className="w-full rounded-lg border border-cyan-300/45 bg-slate-900/80 pl-9 pr-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/55 outline-none"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {STATUS_OPTIONS.map((option) => {
            const active = statusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                  active
                    ? "border-cyan-200 bg-cyan-500 text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.38)]"
                    : "border-cyan-700/70 bg-slate-900/60 text-cyan-100"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded border border-cyan-400/35 bg-slate-900/70 p-2">
            <p className="text-[10px] text-cyan-200/80 text-role-log inline-flex items-center gap-1">
              <IconSearch className="h-3.5 w-3.5 icon-role-log" />
              검색 결과
            </p>
            <p className="text-base font-extrabold text-cyan-100">{filteredItems.length}건</p>
          </div>
          <div className="rounded border border-cyan-400/35 bg-slate-900/70 p-2">
            <p className="text-[10px] text-cyan-200/80 text-role-map inline-flex items-center gap-1">
              <IconBox className="h-3.5 w-3.5 icon-role-map" />
              전체 물품
            </p>
            <p className="text-base font-extrabold text-cyan-100">{items.length}건</p>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-cyan-900/70 bg-slate-950/60 p-3 text-xs text-cyan-100/80 text-role-log inline-flex items-center gap-2">
        <IconClock className="h-4 w-4 shrink-0 icon-role-log" />
        사진 확인 후 내 물건 표시를 누르면 스태프가 소유 확인을 진행합니다.
      </article>

      {message && (
        <p className="rounded-lg border border-cyan-300/60 bg-cyan-500/15 px-3 py-2 text-xs text-cyan-100">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-cyan-200/80">분실물 목록을 불러오는 중...</p>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const isReturned = item.status === "RETURNED";
            const isClaimed = item.status === "OWNER_CLAIMED";
            const phoneHref = toTelHref(item.finderContact);
            const draft = claimDrafts[item.id] || {};
            const statusLabel = STATUS_LABELS[item.status] || item.statusLabel || item.status;

            return (
              <article key={item.id} className="rounded-xl border border-cyan-300/35 bg-slate-950/78 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-cyan-100">{item.title}</p>
                    <p className="mt-0.5 text-xs text-cyan-200/80">
                      {item.category} · {item.foundLocation}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isReturned
                        ? "bg-slate-200 text-slate-700"
                        : isClaimed
                          ? "bg-amber-200 text-amber-900"
                          : "bg-emerald-200 text-emerald-900"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                {item.imageUrl && (
                  <div className="mt-2 overflow-hidden rounded border border-cyan-300/30">
                    <img src={item.imageUrl} alt={`${item.title} 사진`} className="h-40 w-full object-cover" />
                  </div>
                )}

                <p className="mt-2 text-sm text-cyan-100/90">{item.description}</p>
                {item.finderContact && <p className="mt-1 text-xs text-cyan-200/80">연락처: {item.finderContact}</p>}
                {item.claimantName && (
                  <p className="mt-1 text-xs text-amber-200/90">
                    주인 요청: {item.claimantName} ({item.claimantContact})
                  </p>
                )}
                <p className="mt-1 text-[11px] text-cyan-200/70">
                  등록: {item.createdAt?.replace("T", " ").slice(5, 16)} · 접수자: {item.reporterType} {item.reporterRef}
                </p>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isReturned}
                    onClick={() => setClaimOpenId((prev) => (prev === item.id ? null : item.id))}
                    className="rounded-lg border border-cyan-300/60 bg-cyan-500/20 px-2 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-40"
                  >
                    내 물건 표시
                  </button>
                  {phoneHref ? (
                    <a
                      href={phoneHref}
                      className="rounded-lg border border-emerald-300/60 bg-emerald-500/20 px-2 py-2 text-center text-xs font-semibold text-emerald-100"
                    >
                      연락하기
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-slate-500/50 bg-slate-800/70 px-2 py-2 text-xs font-semibold text-slate-300"
                    >
                      연락처 없음
                    </button>
                  )}
                </div>

                {claimOpenId === item.id && !isReturned && (
                  <div className="mt-2 space-y-2 rounded-lg border border-cyan-300/40 bg-slate-900/70 p-2">
                    <input
                      value={draft.claimantName || ""}
                      onChange={(e) =>
                        setClaimDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], claimantName: e.target.value },
                        }))
                      }
                      placeholder="이름"
                      className="w-full rounded-lg border border-cyan-400/35 bg-slate-950/80 px-2 py-2 text-xs text-cyan-50"
                    />
                    <input
                      value={draft.claimantContact || ""}
                      onChange={(e) =>
                        setClaimDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], claimantContact: e.target.value },
                        }))
                      }
                      placeholder="연락처"
                      className="w-full rounded-lg border border-cyan-400/35 bg-slate-950/80 px-2 py-2 text-xs text-cyan-50"
                    />
                    <textarea
                      value={draft.claimantNote || ""}
                      onChange={(e) =>
                        setClaimDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], claimantNote: e.target.value },
                        }))
                      }
                      placeholder="확인에 필요한 메모 (선택)"
                      rows={2}
                      className="w-full rounded-lg border border-cyan-400/35 bg-slate-950/80 px-2 py-2 text-xs text-cyan-50"
                    />
                    <button
                      type="button"
                      disabled={claimingId === item.id}
                      onClick={() => handleClaim(item.id)}
                      className="w-full rounded-lg border border-cyan-200/80 bg-gradient-to-r from-cyan-600 to-blue-500 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {claimingId === item.id ? "요청 중..." : "내 물건으로 표시 요청"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {filteredItems.length === 0 && <p className="text-sm text-cyan-200/80">조건에 맞는 분실물이 없습니다.</p>}
        </div>
      )}
    </section>
  );
}
