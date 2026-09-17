// 관리자 페이지의 분실물 관리. 등록·상태 변경·삭제. 관리자 JWT 는 api.js 가 자동으로 붙인다.
// 손님 화면에는 신청자 정보가 안 나가고, 여기(와 /staff)에서만 보인다.
import { useEffect, useMemo, useState } from "react";
import { createLostItem, createLostItemStream, deleteLostItem, fetchLostItems, updateLostItemStatus } from "../../api";

const CATEGORIES = ["전자기기", "지갑/카드", "학생증", "의류", "가방", "파우치", "열쇠", "생활용품", "기타"];
const STATUS_OPTIONS = [
  { value: "REGISTERED", label: "보관 중", tone: "blue" },
  { value: "OWNER_CLAIMED", label: "주인 확인", tone: "amber" },
  { value: "RETURNED", label: "반환 완료", tone: "gray" },
];
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
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
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

  const counts = useMemo(() => {
    const result = { ALL: items.length };
    STATUS_OPTIONS.forEach((option) => {
      result[option.value] = items.filter((item) => statusOf(item).value === option.value).length;
    });
    return result;
  }, [items]);

  const visible = useMemo(
    () => (filter === "ALL" ? items : items.filter((item) => statusOf(item).value === filter)),
    [items, filter],
  );

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
    <div className="admin-lost">
      <article id="admin-lost" className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>분실물 센터</span>
            <h3>주운 물건 등록</h3>
          </div>
          <strong>{counts.REGISTERED}개 보관 중</strong>
        </div>
        <form className="admin-console-form" onSubmit={handleCreate}>
          <div className="admin-console-inline-grid">
            <input className="admin-console-input" placeholder="물건 이름 (예: 검은색 가죽 지갑)" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            <select className="admin-console-input" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="admin-console-inline-grid">
            <input className="admin-console-input" placeholder="발견 위치 (예: 노천극장 입구 계단)" value={form.foundLocation} onChange={(e) => setForm((prev) => ({ ...prev, foundLocation: e.target.value }))} />
            <input className="admin-console-input" placeholder="습득자 연락처 (선택, 손님에겐 가려져요)" value={form.finderContact} onChange={(e) => setForm((prev) => ({ ...prev, finderContact: e.target.value }))} />
          </div>
          <textarea className="admin-console-input" rows={2} placeholder="특징 (색, 브랜드, 안에 든 것)" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
          <label className="admin-console-file-input">
            <span>{file ? file.name : "사진 고르기 (선택)"}</span>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button type="submit" className="admin-console-submit" disabled={saving}>
            {saving ? "등록 중…" : "분실물 등록"}
          </button>
        </form>
      </article>

      <article className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>분실물 센터</span>
            <h3>보관 목록</h3>
          </div>
          <div className="admin-lost__filters">
            {[{ value: "ALL", label: "전체" }, ...STATUS_OPTIONS].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`admin-lost__filter${filter === option.value ? " is-active" : ""}`}
                onClick={() => setFilter(option.value)}
              >
                {option.label} {counts[option.value] ?? 0}
              </button>
            ))}
          </div>
        </div>

        {loading && !items.length ? <p className="admin-console-hint">불러오는 중…</p> : null}
        {!loading && !visible.length ? <p className="admin-console-hint">여기에 해당하는 물건이 없어요.</p> : null}

        <div className="admin-lost__list">
          {visible.map((item) => {
            const status = statusOf(item);
            const busy = busyId === item.id;
            return (
              <div key={item.id} className={`admin-lost__item admin-lost__item--${status.tone}`}>
                <div className="admin-lost__thumb">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span>{item.category?.slice(0, 2) || "물건"}</span>}
                </div>
                <div className="admin-lost__body">
                  <div className="admin-lost__title">
                    <strong>{item.title}</strong>
                    <span className={`admin-lost__badge admin-lost__badge--${status.tone}`}>{status.label}</span>
                  </div>
                  <p className="admin-lost__meta">
                    {item.category || "기타"} · {item.foundLocation || "위치 미상"} · {timeLabel(item.createdAt)}
                    {item.finderContact ? ` · 습득자 ${item.finderContact}` : ""}
                  </p>
                  {item.description ? <p className="admin-lost__desc">{item.description}</p> : null}

                  {item.claimantName || item.claimantContact ? (
                    <div className="admin-lost__claim">
                      <strong>주인 확인 요청</strong>
                      <span>{item.claimantName || "이름 없음"} · {item.claimantContact || "연락처 없음"}</span>
                      {item.claimantNote ? <em>"{item.claimantNote}"</em> : null}
                    </div>
                  ) : null}

                  <div className="admin-lost__actions">
                    <input
                      className="admin-console-input admin-lost__note"
                      placeholder="처리 메모 (예: 본인 확인 후 반환)"
                      value={noteDrafts[item.id] ?? item.resolveNote ?? ""}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <div className="admin-lost__buttons">
                      {STATUS_OPTIONS.filter((option) => option.value !== status.value).map((option) => (
                        <button key={option.value} type="button" className="admin-console-mini-button" disabled={busy} onClick={() => changeStatus(item, option.value)}>
                          {option.label}으로
                        </button>
                      ))}
                      <button type="button" className="admin-console-mini-button admin-lost__delete" disabled={busy} onClick={() => remove(item)}>
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}
