// 관리자 페이지의 분실물 관리. 등록·상태 변경·삭제. 관리자 JWT 는 api.js 가 자동으로 붙인다.
// 손님 화면에는 신청자 정보가 안 나가고, 여기(와 /staff)에서만 보인다.
// PC 는 왼쪽 등록 폼 + 오른쪽 목록, 모바일은 등록 폼을 접어 두고 목록을 먼저 보여 준다.
import { useEffect, useMemo, useState } from "react";
import { createLostItem, createLostItemStream, deleteLostItem, fetchLostItems, updateLostItemStatus } from "../../api";
import "../../styles/admin-lost.css";

const CATEGORIES = ["전자기기", "지갑/카드", "학생증", "의류", "가방", "파우치", "열쇠", "생활용품", "기타"];
const STATUS_OPTIONS = [
  { value: "REGISTERED", label: "보관 중", tone: "blue" },
  { value: "OWNER_CLAIMED", label: "주인 확인", tone: "amber" },
  { value: "RETURNED", label: "반환 완료", tone: "gray" },
];
// 지금 상태에서 보통 다음으로 누르는 버튼.
const NEXT_STEP = { REGISTERED: "OWNER_CLAIMED", OWNER_CLAIMED: "RETURNED" };
const EMPTY_FORM = { title: "", category: CATEGORIES[0], foundLocation: "", description: "", finderContact: "" };

function statusOf(item) {
  const raw = `${item?.status || ""}`.toUpperCase().replace(/[\s-]/g, "_");
  return STATUS_OPTIONS.find((option) => option.value === raw) || STATUS_OPTIONS[0];
}

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function AdminLostItems({ onMessage }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});

  const say = (text) => onMessage?.(text);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const data = await fetchLostItems();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      say(error.message || "분실물 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    let stream = null;
    try {
      // 스트림은 손님용(가린 목록)이라 신호로만 쓰고, 관리자 토큰으로 다시 읽는다.
      stream = createLostItemStream();
      stream.addEventListener("lost-items", () => load(true));
    } catch {
      // 스트림은 없어도 된다.
    }
    return () => stream?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const counts = useMemo(() => {
    const result = { ALL: items.length };
    STATUS_OPTIONS.forEach((option) => {
      result[option.value] = items.filter((item) => statusOf(item).value === option.value).length;
    });
    return result;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "ALL" && statusOf(item).value !== filter) return false;
      if (!q) return true;
      return [item.title, item.category, item.foundLocation, item.description, item.claimantName]
        .some((value) => `${value || ""}`.toLowerCase().includes(q));
    });
  }, [items, filter, query]);

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function handleCreate(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.foundLocation.trim()) {
      say("물건 이름과 발견 위치는 꼭 적어 주세요.");
      return;
    }
    setSaving(true);
    try {
      await createLostItem(form, file);
      setForm(EMPTY_FORM);
      setFile(null);
      setFormOpen(false);
      say("분실물을 등록했어요. 손님 화면에 바로 떠요.");
      await load(true);
    } catch (error) {
      say(error.message || "분실물을 등록하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item, status) {
    setBusyId(item.id);
    try {
      await updateLostItemStatus(item.id, { status, resolveNote: noteDrafts[item.id] ?? item.resolveNote ?? "" });
      say(`${item.title} · ${STATUS_OPTIONS.find((option) => option.value === status)?.label}`);
      await load(true);
    } catch (error) {
      say(error.message || "상태를 바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item) {
    if (!window.confirm(`"${item.title}" 을(를) 목록에서 지울까요? 되돌릴 수 없어요.`)) return;
    setBusyId(item.id);
    try {
      await deleteLostItem(item.id);
      say("지웠어요.");
      await load(true);
    } catch (error) {
      say(error.message || "지우지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="alost">
      <section className={`alost-form${formOpen ? " is-open" : ""}`} aria-label="주운 물건 등록">
        <button type="button" className="alost-form__toggle" onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen}>
          <span>
            <b>주운 물건 등록</b>
            <small>등록하면 손님 분실물 화면에 바로 떠요</small>
          </span>
          <i aria-hidden="true">{formOpen ? "−" : "+"}</i>
        </button>
        <div className="alost-form__head">
          <b>주운 물건 등록</b>
          <small>등록하면 손님 분실물 화면에 바로 떠요</small>
        </div>

        <form className="alost-form__body" onSubmit={handleCreate}>
          <label className="alost-field">
            <span>물건 이름 <em>필수</em></span>
            <input value={form.title} onChange={setField("title")} placeholder="예: 검은색 가죽 지갑" />
          </label>

          <div className="alost-field">
            <span>종류</span>
            <div className="alost-cats" role="radiogroup" aria-label="종류">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="radio"
                  aria-checked={form.category === category}
                  className={form.category === category ? "is-on" : ""}
                  onClick={() => setForm((prev) => ({ ...prev, category }))}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <label className="alost-field">
            <span>발견 위치 <em>필수</em></span>
            <input value={form.foundLocation} onChange={setField("foundLocation")} placeholder="예: 노천극장 입구 계단" />
          </label>

          <label className="alost-field">
            <span>특징</span>
            <textarea rows={2} value={form.description} onChange={setField("description")} placeholder="색, 브랜드, 안에 든 것" />
          </label>

          <label className="alost-field">
            <span>습득자 연락처 <small>손님에겐 안 보여요</small></span>
            <input value={form.finderContact} onChange={setField("finderContact")} placeholder="선택" />
          </label>

          <label className="alost-photo">
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {preview ? <img src={preview} alt="" /> : <i aria-hidden="true">+</i>}
            <span>
              <b>{file ? "사진 바꾸기" : "사진 추가"}</b>
              <small>{file ? file.name : "선택 · 물건이 잘 보이게"}</small>
            </span>
          </label>

          <button type="submit" className="alost-submit" disabled={saving}>
            {saving ? "등록 중…" : "등록하기"}
          </button>
        </form>
      </section>

      <section className="alost-list" aria-label="보관 목록">
        <div className="alost-list__top">
          <div className="alost-tabs" role="tablist">
            {[{ value: "ALL", label: "전체" }, ...STATUS_OPTIONS].map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filter === option.value}
                className={filter === option.value ? "is-on" : ""}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <b>{counts[option.value] ?? 0}</b>
              </button>
            ))}
          </div>
          <input
            className="alost-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·위치·특징으로 찾기"
            aria-label="분실물 검색"
          />
        </div>

        {loading && !items.length ? <p className="alost-empty">불러오는 중…</p> : null}
        {!loading && !visible.length ? (
          <p className="alost-empty">{query ? "검색 결과가 없어요." : "여기에 해당하는 물건이 없어요."}</p>
        ) : null}

        <ul className="alost-items">
          {visible.map((item) => {
            const status = statusOf(item);
            const busy = busyId === item.id;
            const next = NEXT_STEP[status.value];
            const others = STATUS_OPTIONS.filter((option) => option.value !== status.value && option.value !== next);
            const hasClaim = item.claimantName || item.claimantContact;
            return (
              <li key={item.id} className={`alost-item alost-item--${status.tone}`}>
                <div className="alost-item__main">
                  <div className="alost-item__thumb">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span>{item.category?.slice(0, 2) || "물건"}</span>}
                  </div>
                  <div className="alost-item__info">
                    <div className="alost-item__title">
                      <strong>{item.title}</strong>
                      <span className={`alost-badge alost-badge--${status.tone}`}>{status.label}</span>
                    </div>
                    <p className="alost-item__meta">
                      <span>{item.category || "기타"}</span>
                      <span>{item.foundLocation || "위치 미상"}</span>
                      <span>{timeLabel(item.createdAt)}</span>
                    </p>
                    {item.description ? <p className="alost-item__desc">{item.description}</p> : null}
                    {item.finderContact ? <p className="alost-item__finder">습득자 {item.finderContact}</p> : null}
                  </div>
                </div>

                {hasClaim ? (
                  <div className="alost-claim">
                    <b>주인이라고 연락 왔어요</b>
                    <span>{item.claimantName || "이름 없음"} · {item.claimantContact || "연락처 없음"}</span>
                    {item.claimantNote ? <em>“{item.claimantNote}”</em> : null}
                  </div>
                ) : null}

                <div className="alost-item__foot">
                  <input
                    className="alost-note"
                    placeholder="처리 메모 (예: 학생증으로 본인 확인)"
                    value={noteDrafts[item.id] ?? item.resolveNote ?? ""}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <div className="alost-item__buttons">
                    {next ? (
                      <button type="button" className="alost-btn alost-btn--primary" disabled={busy} onClick={() => changeStatus(item, next)}>
                        {next === "OWNER_CLAIMED" ? "주인 확인됨" : "반환 완료"}
                      </button>
                    ) : null}
                    {others.map((option) => (
                      <button key={option.value} type="button" className="alost-btn" disabled={busy} onClick={() => changeStatus(item, option.value)}>
                        {option.value === "REGISTERED" ? "보관 중으로 되돌리기" : option.value === "OWNER_CLAIMED" ? "주인 확인으로" : "반환 완료로"}
                      </button>
                    ))}
                    <button type="button" className="alost-btn alost-btn--danger" disabled={busy} onClick={() => remove(item)}>
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
