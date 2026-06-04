import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  claimLostItem,
  createLostItem,
  createLostItemStream,
  fetchLostItems,
} from "../api";
import { IconBox, IconClock, IconSearch } from "../components/UxIcons";
import { fallbackLostItems } from "../data/festivalUiData";

const CATEGORY_TABS = ["전체", "전자기기", "지갑/카드", "학생증", "기타"];
const EMPTY_FORM = {
  title: "",
  category: "기타",
  foundLocation: "",
  description: "",
  finderContact: "",
};
const STATUS_LABELS = {
  REGISTERED: "보관중",
  FOUND: "보관중",
  STORED: "보관중",
  CLAIM_REQUESTED: "확인 요청",
  OWNER_CLAIMED: "주인 확인",
  RETURNED: "반환 완료",
  EXPIRED: "보관 종료",
};
const STATUS_TEXT_LABELS = {
  registered: "보관중",
  found: "보관중",
  stored: "보관중",
  "owner claimed": "주인 확인",
  "owner-claimed": "주인 확인",
  owner_claimed: "주인 확인",
  returned: "반환 완료",
  claimed: "주인 확인",
};

function statusLabel(item) {
  const rawLabel = `${item.statusLabel || ""}`.trim();
  const normalizedLabel = rawLabel.toLowerCase();
  if (STATUS_TEXT_LABELS[normalizedLabel]) return STATUS_TEXT_LABELS[normalizedLabel];
  if (rawLabel && !/^[a-z_\-\s]+$/i.test(rawLabel)) return rawLabel;
  const rawStatus = `${item.status || ""}`.trim().toUpperCase();
  if (STATUS_LABELS[rawStatus]) return STATUS_LABELS[rawStatus];
  return "보관중";
}

function telHref(value) {
  const raw = `${value || ""}`.trim();
  if (!raw || raw.includes("*")) return "";
  const digits = raw.replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export default function LostFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("query") || "");
  const [tab, setTab] = useState("전체");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState(EMPTY_FORM);
  const [registerFile, setRegisterFile] = useState(null);
  const [saving, setSaving] = useState(false);

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

    let stream = null;
    try {
      stream = createLostItemStream();
      stream.addEventListener("lost-items", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setItems(next);
        } catch {
          // Ignore malformed live payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    return () => stream?.close();
  }, []);

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("query") || "");
  }, [location.search]);

  const visibleItems = useMemo(() => {
    const source = items.length ? items : fallbackLostItems;
    const keyword = query.trim().toLowerCase();
    return source.filter((item) => {
      const matchTab = tab === "전체" || `${item.category || ""}`.includes(tab);
      const matchQuery =
        !keyword ||
        `${item.title || ""}`.toLowerCase().includes(keyword) ||
        `${item.description || ""}`.toLowerCase().includes(keyword) ||
        `${item.foundLocation || ""}`.toLowerCase().includes(keyword) ||
        `${item.category || ""}`.toLowerCase().includes(keyword);
      return matchTab && matchQuery;
    });
  }, [items, query, tab]);

  async function handleRegister(event) {
    event.preventDefault();
    if (!registerForm.title.trim() || !registerForm.foundLocation.trim()) {
      setMessage("분실물명과 발견 위치를 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      await createLostItem(registerForm, registerFile);
      setMessage("분실물이 등록되었습니다.");
      setRegisterForm(EMPTY_FORM);
      setRegisterFile(null);
      setRegisterOpen(false);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

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
      setMessage("내 물건 표시 요청이 접수되었습니다.");
      setClaimOpenId(null);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <section className="uni-page lost-page">
      <header className="plain-page-header">
        <span />
        <h1>분실물</h1>
        <button type="button" aria-label="분실물 검색" onClick={load}>
          <IconSearch className="h-5 w-5" />
        </button>
      </header>

      <label className="search-field">
        <IconSearch className="h-4 w-4" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="분실물명, 색상, 위치 검색"
        />
      </label>

      <div className="uni-tabs uni-tabs--scroll">
        {CATEGORY_TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? "uni-tab uni-tab--active" : "uni-tab"}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {message && <p className="app-inline-note">{message}</p>}

      {loading && <p className="app-inline-note">실시간 분실물 목록을 확인하는 중입니다. 기본 보관 목록을 먼저 표시합니다.</p>}

      <section className="lost-list-card">
        {visibleItems.map((item) => {
            const phone = telHref(item.finderContact);
            const draft = claimDrafts[item.id] || {};
            return (
              <article key={item.id || item.title} className="lost-row lost-row--interactive">
                <img src={item.imageUrl || item.image || "/images/lost-empty.png"} alt="" />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.foundLocation || "축제 본부"}</small>
                  <span>{item.createdAt?.replace("T", " ").slice(5, 16) || "접수 시간 확인 중"}</span>
                  {item.description && <p>{item.description}</p>}
                </div>
                <em>{statusLabel(item)}</em>
                <div className="lost-row-actions">
                  <button
                    type="button"
                    onClick={() => setClaimOpenId((prev) => (prev === item.id ? null : item.id))}
                    disabled={item.status === "RETURNED"}
                  >
                    내 물건
                  </button>
                  {phone ? <a href={phone}>연락</a> : <button type="button" disabled>연락처 없음</button>}
                </div>
                {claimOpenId === item.id && item.status !== "RETURNED" && (
                  <div className="lost-claim-form">
                    <input
                      value={draft.claimantName || ""}
                      onChange={(event) =>
                        setClaimDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], claimantName: event.target.value },
                        }))
                      }
                      placeholder="이름"
                    />
                    <input
                      value={draft.claimantContact || ""}
                      onChange={(event) =>
                        setClaimDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], claimantContact: event.target.value },
                        }))
                      }
                      placeholder="연락처"
                    />
                    <textarea
                      value={draft.claimantNote || ""}
                      onChange={(event) =>
                        setClaimDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], claimantNote: event.target.value },
                        }))
                      }
                      placeholder="확인 메모"
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={() => handleClaim(item.id)}
                      disabled={claimingId === item.id}
                    >
                      {claimingId === item.id ? "요청 중..." : "표시 요청"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        {visibleItems.length === 0 && (
          <p className="empty-copy">조건에 맞는 분실물이 없습니다.</p>
        )}
      </section>

      <div className="bottom-action-row">
        <button type="button" className="primary-wide-button" onClick={() => setRegisterOpen((prev) => !prev)}>
          분실물 등록하기
        </button>
        <button type="button" className="secondary-inline-button" onClick={() => navigate("/staff")}>
          문의하기
        </button>
      </div>

      {registerOpen && (
        <form className="uni-card lost-register-form" onSubmit={handleRegister}>
          <h2>분실물 등록</h2>
          <input
            value={registerForm.title}
            onChange={(event) => setRegisterForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="분실물명"
          />
          <div className="form-grid-2">
            <select
              value={registerForm.category}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, category: event.target.value }))}
            >
              {CATEGORY_TABS.filter((item) => item !== "전체").map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input
              value={registerForm.foundLocation}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, foundLocation: event.target.value }))}
              placeholder="발견 위치"
            />
          </div>
          <textarea
            value={registerForm.description}
            onChange={(event) => setRegisterForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="색상, 특징, 발견 상황"
            rows={3}
          />
          <input
            value={registerForm.finderContact}
            onChange={(event) => setRegisterForm((prev) => ({ ...prev, finderContact: event.target.value }))}
            placeholder="연락처"
          />
          <input type="file" accept="image/*" onChange={(event) => setRegisterFile(event.target.files?.[0] || null)} />
          <button type="submit" className="primary-wide-button" disabled={saving}>
            {saving ? "등록 중..." : "등록 완료"}
          </button>
        </form>
      )}

      <section className="uni-card lost-help-card">
        <IconBox className="h-5 w-5" />
        <p>축제 본부 분실물 센터에서 사진 확인 후 수령할 수 있어요.</p>
        <IconClock className="h-4 w-4" />
      </section>
    </section>
  );
}
