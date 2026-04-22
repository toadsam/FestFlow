import { useEffect, useMemo, useState } from "react";
import {
  createLostItem,
  createLostItemStream,
  fetchLostItems,
  updateLostItemStatus,
} from "../api";
import { isLoggedIn } from "../utils/auth";

const STAFF_TOKEN_KEY = "festflow_staff_token_v2";

const initialForm = {
  title: "",
  description: "",
  category: "전자기기",
  foundLocation: "",
  finderContact: "",
};

export default function LostFoundPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  const staffToken = localStorage.getItem(STAFF_TOKEN_KEY) || "";
  const canManage = Boolean(staffToken || isLoggedIn());

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
        // ignore
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

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await createLostItem(form, file, staffToken);
      setForm(initialForm);
      setFile(null);
      setMessage("분실물을 등록했습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(item, status) {
    setResolvingId(item.id);
    setMessage("");
    try {
      await updateLostItemStatus(
        item.id,
        {
          status,
          resolveNote:
            status === "RETURNED"
              ? "수령자 확인 후 반환 처리"
              : "보관 상태로 재설정",
        },
        staffToken,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <section className="cyber-page pt-4 pb-24 space-y-4">
      <article className="rounded-2xl border border-cyan-300/60 bg-slate-950/80 p-4 text-cyan-50">
        <p className="text-xs tracking-[0.16em] uppercase text-cyan-300/90">
          Lost & Found
        </p>
        <h2 className="mt-1 text-xl font-extrabold">분실물 센터</h2>
        <p className="mt-1 text-sm text-cyan-100/85">
          전체 사용자는 조회 가능, 스태프/관리자는 등록과 상태 변경이 가능합니다.
        </p>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="분실물명/위치/설명 검색"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ALL">전체</option>
            <option value="REGISTERED">보관 중</option>
            <option value="RETURNED">수령 완료</option>
          </select>
        </div>
        <p className="text-xs text-slate-500">
          총 {filteredItems.length}건 / 전체 {items.length}건
        </p>
      </article>

      {canManage && (
        <article className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 space-y-2">
          <h3 className="text-sm font-bold text-emerald-900">
            분실물 등록 (스태프/관리자)
          </h3>
          <form className="space-y-2" onSubmit={handleSubmit}>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="분실물명"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              required
            />
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="상세 설명"
              rows={2}
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.foundLocation}
                onChange={(e) =>
                  setForm((p) => ({ ...p, foundLocation: e.target.value }))
                }
                placeholder="발견 위치"
                className="rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                required
              />
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              >
                <option>전자기기</option>
                <option>지갑/카드</option>
                <option>의류/소지품</option>
                <option>학생증</option>
                <option>기타</option>
              </select>
            </div>
            <input
              value={form.finderContact}
              onChange={(e) =>
                setForm((p) => ({ ...p, finderContact: e.target.value }))
              }
              placeholder="담당자 연락처(선택)"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "등록 중..." : "분실물 등록"}
            </button>
          </form>
        </article>
      )}

      {!canManage && (
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          스태프/관리자 로그인 상태에서만 분실물 등록 및 상태 변경이 가능합니다.
        </article>
      )}

      {message && (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">분실물 목록 로딩 중...</p>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
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
                  <img src={item.imageUrl} alt={`${item.title} 사진`} className="h-40 w-full object-cover" />
                </div>
              )}
              <p className="mt-2 text-sm text-slate-700">{item.description}</p>
              {item.finderContact && (
                <p className="mt-1 text-xs text-slate-600">연락처: {item.finderContact}</p>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                등록: {item.createdAt?.replace("T", " ").slice(5, 16)} · 등록자: {item.reporterType} {item.reporterRef}
              </p>

              {canManage && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatus(item, "REGISTERED")}
                    disabled={resolvingId === item.id}
                    className="rounded-lg border border-cyan-300 py-1.5 text-xs font-semibold text-cyan-700 disabled:opacity-60"
                  >
                    보관 중
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatus(item, "RETURNED")}
                    disabled={resolvingId === item.id}
                    className="rounded-lg border border-emerald-300 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                  >
                    수령 완료
                  </button>
                </div>
              )}
            </article>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-sm text-slate-500">조건에 맞는 분실물이 없습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}

