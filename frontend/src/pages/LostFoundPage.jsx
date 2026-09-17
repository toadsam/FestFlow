// 분실물. 목록을 보고, 눌러서 자세히 보고, 내 물건이면 바텀시트에서 바로 요청한다.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { claimLostItem, createLostItem, createLostItemStream, fetchLostItems } from "../api";
import { FESTIVAL } from "../config/festival";
import { IconCamera, IconSearch, IconX } from "../components/UxIcons";
import { BottomSheet, IconPhone, IconPlus, Mascot, useToast } from "../components/v2/V2Kit";
import { fallbackLostItems } from "../data/festivalUiData";

const CATEGORY_TABS = ["전체", "전자기기", "지갑/카드", "학생증", "기타"];
const EMPTY_FORM = {
  title: "",
  category: "기타",
  foundLocation: "",
  description: "",
  finderContact: "",
};
const EMPTY_CLAIM = { claimantName: "", claimantContact: "", claimantNote: "" };
const STATUS_LABELS = {
  REGISTERED: "보관 중",
  FOUND: "보관 중",
  STORED: "보관 중",
  CLAIM_REQUESTED: "확인 요청",
  OWNER_CLAIMED: "주인 확인",
  RETURNED: "반환 완료",
  EXPIRED: "보관 종료",
};
const STATUS_TEXT_LABELS = {
  registered: "보관 중",
  found: "보관 중",
  stored: "보관 중",
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
  return "보관 중";
}

function statusTone(item) {
  const label = statusLabel(item);
  if (label === "반환 완료" || label === "보관 종료") return "";
  if (label === "확인 요청" || label === "주인 확인") return "v2-badge--yellow";
  return "v2-badge--green";
}

function isReturned(item) {
  return `${item.status || ""}`.toUpperCase() === "RETURNED" || statusLabel(item) === "반환 완료";
}

function telHref(value) {
  const raw = `${value || ""}`.trim();
  if (!raw || raw.includes("*")) return "";
  const digits = raw.replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : "";
}

function timeLabel(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMinutes = Math.round((now - date) / 60000);
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 60 * 24) return `${Math.floor(diffMinutes / 60)}시간 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function LostFoundPage() {
  const location = useLocation();
  const [showToast, toastNode] = useToast();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("query") || "");
  const [tab, setTab] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState(EMPTY_FORM);
  const [registerFile, setRegisterFile] = useState(null);
  const [registerError, setRegisterError] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [claimMode, setClaimMode] = useState(false);
  const [claimForm, setClaimForm] = useState(EMPTY_CLAIM);
  const [claimError, setClaimError] = useState("");
  const [claiming, setClaiming] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLostItems();
      setItems(Array.isArray(data) ? data : []);
      setFailed(false);
    } catch {
      setFailed(true);
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
          // 잘못된 페이로드는 무시한다.
        }
      });
    } catch {
      // 스트림은 없어도 된다.
    }
    return () => stream?.close();
  }, []);

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("query") || "");
  }, [location.search]);

  const source = items.length ? items : failed ? fallbackLostItems : [];

  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return source.filter((item) => {
      const matchTab = tab === "전체" || `${item.category || ""}`.includes(tab);
      const matchQuery =
        !keyword ||
        [item.title, item.description, item.foundLocation, item.category].some((field) =>
          `${field || ""}`.toLowerCase().includes(keyword),
        );
      return matchTab && matchQuery;
    });
  }, [source, query, tab]);

  const selected = useMemo(() => source.find((item) => item.id === selectedId) || null, [source, selectedId]);
  const storedCount = source.filter((item) => !isReturned(item)).length;

  function openItem(item) {
    setSelectedId(item.id);
    setClaimMode(false);
    setClaimError("");
  }

  function closeItem() {
    setSelectedId(null);
    setClaimMode(false);
    setClaimError("");
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (!registerForm.title.trim() || !registerForm.foundLocation.trim()) {
      setRegisterError("물건 이름과 발견한 곳은 꼭 적어 주세요.");
      return;
    }
    setSaving(true);
    setRegisterError("");
    try {
      await createLostItem(registerForm, registerFile);
      setRegisterForm(EMPTY_FORM);
      setRegisterFile(null);
      setRegisterOpen(false);
      showToast("분실물을 등록했어요. 고마워요!");
      await load();
    } catch (saveError) {
      setRegisterError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClaim() {
    if (!selected) return;
    const claimantName = claimForm.claimantName.trim();
    const claimantContact = claimForm.claimantContact.trim();
    const claimantNote = claimForm.claimantNote.trim();
    if (!claimantName || !claimantContact) {
      setClaimError("이름과 연락처를 적어 주세요.");
      return;
    }
    setClaiming(true);
    setClaimError("");
    try {
      await claimLostItem(selected.id, { claimantName, claimantContact, claimantNote });
      setClaimForm(EMPTY_CLAIM);
      closeItem();
      showToast("요청을 보냈어요. 본부에서 확인 후 연락드릴게요.");
      await load();
    } catch (claimErr) {
      setClaimError(claimErr.message);
    } finally {
      setClaiming(false);
    }
  }

  // 공개 응답은 연락처를 가려 보내므로(*), 가려진 번호로는 전화 버튼을 만들지 않는다.
  const selectedPhone = selected && !`${selected.finderContact || ""}`.includes("*") ? telHref(selected.finderContact) : "";

  return (
    <section className="v2-page" data-i18n-skip>
      <div className="v2-title">
        <h1>분실물</h1>
        <p>{loading && !source.length ? "보관 목록을 불러오는 중이에요" : `지금 ${storedCount}개를 보관하고 있어요`}</p>
      </div>

      <label className="v2-search">
        <IconSearch />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="물건 이름, 색상, 잃어버린 곳"
          aria-label="분실물 검색"
        />
        {query ? (
          <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>
            <IconX />
          </button>
        ) : null}
      </label>

      <div className="v2-chips" style={{ marginTop: "0.85rem" }}>
        {CATEGORY_TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={`v2-chip${tab === item ? " v2-chip--active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {failed && <p className="v2-note">실시간 목록을 불러오지 못해 기본 목록을 보여드려요.</p>}

      <div className="v2-lost-list" style={{ marginTop: "1rem" }}>
        {loading && !source.length
          ? [0, 1, 2].map((index) => <div key={index} className="v2-skeleton" style={{ height: "5.9rem", borderRadius: 18 }} />)
          : visibleItems.map((item, index) => (
              <button
                key={item.id || item.title}
                type="button"
                className="v2-lost v2-rise"
                style={{ "--i": Math.min(index, 8) }}
                onClick={() => openItem(item)}
              >
                <span className="v2-lost__thumb">
                  <img src={item.imageUrl || item.image || "/images/lost-empty.png"} alt="" loading="lazy" />
                </span>
                <span className="v2-lost__body">
                  <span className="v2-lost__head">
                    <strong>{item.title}</strong>
                    <span className={`v2-badge ${statusTone(item)}`}>{statusLabel(item)}</span>
                  </span>
                  <small>{item.foundLocation || "축제 본부"}{item.category ? ` · ${item.category}` : ""}</small>
                  <small>{timeLabel(item.createdAt) || "접수 시간 확인 중"}</small>
                </span>
              </button>
            ))}
        {!loading && visibleItems.length === 0 && (
          <div className="v2-empty">
            <Mascot kind="flame" className="v2-empty__mascot" />
            <strong>{query || tab !== "전체" ? "조건에 맞는 물건이 없어요" : "보관 중인 분실물이 없어요"}</strong>
            <p>{query || tab !== "전체" ? "검색어나 분류를 바꿔 보세요." : "주운 물건은 축제 본부(총학생회 부스)에 맡겨 주세요."}</p>
          </div>
        )}
      </div>

      <div className="v2-card" style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <Mascot style={{ width: "3.2rem", height: "auto", flex: "0 0 auto" }} />
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--v2-text-2)", lineHeight: 1.45 }}>
          축제 본부 분실물 센터에서 사진을 확인한 뒤 받아 갈 수 있어요.
        </p>
      </div>

      {FESTIVAL.lostFoundPublicRegister !== false && (
      <button type="button" className="v2-fab" onClick={() => setRegisterOpen(true)}>
        <IconPlus />
        주운 물건 등록
      </button>
      )}

      <BottomSheet
        open={Boolean(selected)}
        onClose={closeItem}
        title={selected?.title || ""}
        description={selected ? `${selected.foundLocation || "축제 본부"} · ${timeLabel(selected.createdAt) || "접수 시간 확인 중"}` : ""}
      >
        {selected ? (
          <>
            <img className="v2-lost-detail__img" src={selected.imageUrl || selected.image || "/images/lost-empty.png"} alt="" />
            <div className="v2-kv">
              <span>상태</span>
              <strong>
                <span className={`v2-badge ${statusTone(selected)}`}>{statusLabel(selected)}</span>
              </strong>
            </div>
            {selected.category ? (
              <div className="v2-kv">
                <span>분류</span>
                <strong>{selected.category}</strong>
              </div>
            ) : null}
            {selected.description ? (
              <p style={{ margin: "0.5rem 0 1rem", fontSize: "0.92rem", lineHeight: 1.55, color: "var(--v2-text-2)" }}>
                {selected.description}
              </p>
            ) : null}

            {claimMode ? (
              <div className="v2-pop">
                <label className="v2-field">
                  <span>이름</span>
                  <input
                    value={claimForm.claimantName}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, claimantName: event.target.value }))}
                    placeholder="본부에서 확인할 이름"
                    autoFocus
                  />
                </label>
                <label className="v2-field">
                  <span>연락처</span>
                  <input
                    type="tel"
                    value={claimForm.claimantContact}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, claimantContact: event.target.value }))}
                    placeholder="010-0000-0000"
                  />
                </label>
                <label className="v2-field">
                  <span>내 물건이라는 증거 (선택)</span>
                  <textarea
                    value={claimForm.claimantNote}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, claimantNote: event.target.value }))}
                    placeholder="예) 케이스 안쪽에 스티커가 붙어 있어요"
                    rows={2}
                  />
                </label>
                {claimError && <p className="v2-note v2-note--danger">{claimError}</p>}
                <div className="v2-btn-row">
                  <button type="button" className="v2-btn v2-btn--gray" onClick={() => setClaimMode(false)}>
                    뒤로
                  </button>
                  <button type="button" className="v2-btn" onClick={handleClaim} disabled={claiming}>
                    {claiming ? "보내는 중..." : "요청 보내기"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="v2-btn-row" style={{ marginTop: "0.75rem" }}>
                {selectedPhone ? (
                  <a className="v2-btn v2-btn--gray" href={selectedPhone}>
                    <IconPhone style={{ width: 18, height: 18 }} />
                    연락하기
                  </a>
                ) : null}
                <button type="button" className="v2-btn" onClick={() => setClaimMode(true)} disabled={isReturned(selected)}>
                  {isReturned(selected) ? "반환이 끝난 물건이에요" : "내 물건이에요"}
                </button>
              </div>
            )}
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={registerOpen}
        onClose={() => {
          if (!saving) setRegisterOpen(false);
        }}
        title="주운 물건 등록"
        description="본부에 맡기기 전에 먼저 올려 두면 주인이 더 빨리 찾아요."
      >
        <form onSubmit={handleRegister}>
          <label className="v2-field">
            <span>물건 이름</span>
            <input
              value={registerForm.title}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="예) 검정 에어팟 케이스"
            />
          </label>
          <div className="v2-field-grid">
            <label className="v2-field">
              <span>분류</span>
              <select
                value={registerForm.category}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                {CATEGORY_TABS.filter((item) => item !== "전체").map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="v2-field">
              <span>발견한 곳</span>
              <input
                value={registerForm.foundLocation}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, foundLocation: event.target.value }))}
                placeholder="예) 노천극장 앞"
              />
            </label>
          </div>
          <label className="v2-field">
            <span>특징 (선택)</span>
            <textarea
              value={registerForm.description}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="색상, 스티커, 발견 상황"
              rows={2}
            />
          </label>
          <label className="v2-field">
            <span>내 연락처 (선택)</span>
            <input
              type="tel"
              value={registerForm.finderContact}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, finderContact: event.target.value }))}
              placeholder="주인이 연락할 번호"
            />
          </label>
          <label className={`v2-file${registerFile ? " v2-file--filled" : ""}`} style={{ marginBottom: "1rem" }}>
            <IconCamera style={{ width: 18, height: 18 }} />
            {registerFile ? registerFile.name : "사진 추가"}
            <input type="file" accept="image/*" onChange={(event) => setRegisterFile(event.target.files?.[0] || null)} />
          </label>
          {registerError && <p className="v2-note v2-note--danger">{registerError}</p>}
          <button type="submit" className="v2-btn" disabled={saving}>
            {saving ? "등록하는 중..." : "등록하기"}
          </button>
        </form>
      </BottomSheet>

      {toastNode}
    </section>
  );
}
