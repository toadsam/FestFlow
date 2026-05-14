import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconArrowLeft,
  IconCamera,
  IconChevronRight,
  IconClipboard,
  IconHeart,
  IconHeartFilled,
  IconHome,
  IconMapPin,
  IconRefresh,
  IconSend,
  IconShield,
  IconSparkles,
  IconUsers,
  IconX,
} from "../components/UxIcons";
import {
  createAiMatchImagePreview,
  createAiMatchProfile,
  createAiMatchRequest,
  fetchAiMatchProfiles,
  fetchAiMatchRequests,
  resolveApiAssetUrl,
} from "../api";

const MEET_PLACES = ["중앙무대 앞", "푸드트럭 존", "종합 안내 데스크", "네온 포토 터널"];
const SCREEN_COPY = {
  intro: "AI 소개팅 부스",
  register: "프로필 등록하기",
  people: "등록된 사람들",
  requests: "데이트 신청 현황",
};
const NAV_ITEMS = [
  { id: "intro", label: "홈", icon: IconHome },
  { id: "people", label: "사람들", icon: IconUsers },
  { id: "requests", label: "신청함", icon: IconClipboard },
  { id: "register", label: "등록하기", icon: IconSparkles },
];
const PROFILE_FILTERS = ["전체", "남자", "여자", "신청 가능"];
const REGISTRATION_TAGS = ["운동", "음악", "영화", "여행", "맛집", "독서", "게임", "보드게임", "사진", "공연", "기타"];
const STEP_ITEMS = [
  { number: "01", title: "QR 스캔", copy: "부스 QR을 스캔해요" },
  { number: "02", title: "사진 업로드", copy: "정면 사진을 올려요" },
  { number: "03", title: "AI 변환", copy: "웹툰 스타일로 바꿔요" },
  { number: "04", title: "소개 등록", copy: "설명을 적고 공개해요" },
];
const QR_PATTERN = [
  "111111001111",
  "100001001001",
  "101101001111",
  "101101000101",
  "101101011101",
  "100001010001",
  "111111010111",
  "000100111001",
  "111011001101",
  "101010111001",
  "111110100111",
  "100011001111",
].join("");

function cleanTagValue(tag) {
  return `${tag || ""}`.replace(/^#/, "").trim().slice(0, 8);
}

function parseProfileCopy(rawIntro) {
  const source = `${rawIntro || ""}`.trim();
  if (!source) {
    return {
      summary: "따뜻한 분위기의 축제 메이트를 찾고 있어요.",
      tags: [],
    };
  }

  const tags = [];
  const summaryParts = [];

  source.split(/\n+/).forEach((line) => {
    const matches = [...line.matchAll(/#([^\s#]+)/g)].map((match) => cleanTagValue(match[1]));
    if (matches.length) {
      tags.push(...matches);
    }

    const cleanedLine = line.replace(/#([^\s#]+)/g, "").replace(/\s+/g, " ").trim();
    if (cleanedLine) {
      summaryParts.push(cleanedLine);
    }
  });

  return {
    summary: summaryParts.join(" ").trim() || "따뜻한 분위기의 축제 메이트를 찾고 있어요.",
    tags: [...new Set(tags)].filter(Boolean).slice(0, 6),
  };
}

function serializeProfileCopy(summary, tags) {
  const cleanSummary = `${summary || ""}`.trim();
  const cleanTags = [...new Set((tags || []).map(cleanTagValue))].filter(Boolean).slice(0, 6);
  if (!cleanTags.length) return cleanSummary;
  return `${cleanSummary}\n${cleanTags.map((tag) => `#${tag}`).join(" ")}`;
}

function getFallbackTags(profile) {
  const byPlace = {
    "중앙무대 앞": ["공연", "산책"],
    "푸드트럭 존": ["맛집", "수다"],
    "종합 안내 데스크": ["첫만남", "안전"],
    "네온 포토 터널": ["사진", "야경"],
  };

  return byPlace[profile.meetPlace] || ["축제", "만남"];
}

function getProfileGenderLabel(gender) {
  if (gender === "남성") return "남자";
  if (gender === "여성") return "여자";
  return "비공개";
}

function getProfileTone(gender) {
  if (gender === "남성") return "blue";
  if (gender === "여성") return "pink";
  return "mint";
}

function getFilterTone(filter) {
  if (filter === "남자") return "blue";
  if (filter === "여자") return "pink";
  if (filter === "신청 가능") return "green";
  return "violet";
}

function getGenderButtonTone(gender) {
  if (gender === "남성") return "blue";
  if (gender === "여성") return "pink";
  return "neutral";
}

function formatRequestTime(createdAt) {
  if (!createdAt) return "방금";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "방금";

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildDecoratedProfiles(profiles) {
  return profiles.map((profile) => {
    const parsed = parseProfileCopy(profile.intro);
    return {
      ...profile,
      summary: parsed.summary,
      tags: parsed.tags.length ? parsed.tags.slice(0, 4) : getFallbackTags(profile).slice(0, 4),
      tone: getProfileTone(profile.gender),
      genderLabel: getProfileGenderLabel(profile.gender),
      isRequestable: Boolean(profile.generatedImageUrl),
    };
  });
}

function matchesProfileFilter(filter, profile) {
  if (filter === "남자") return profile.gender === "남성";
  if (filter === "여자") return profile.gender === "여성";
  if (filter === "신청 가능") return profile.isRequestable;
  return true;
}

export default function AiMatchPage() {
  const [activeScreen, setActiveScreen] = useState("intro");
  const [profiles, setProfiles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("여성");
  const [intro, setIntro] = useState("");
  const [place, setPlace] = useState(MEET_PLACES[0]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [originalImageUrl, setOriginalImageUrl] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertSeconds, setConvertSeconds] = useState(0);
  const [consent, setConsent] = useState(false);
  const [requesterNickname, setRequesterNickname] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestPlace, setRequestPlace] = useState(MEET_PLACES[0]);
  const [activeFilter, setActiveFilter] = useState("전체");
  const [favoriteProfileIds, setFavoriteProfileIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canRegister = Boolean(
    nickname.trim() && intro.trim() && generatedImageUrl && consent && !submitting && !converting,
  );
  const bannerText = errorMessage
    ? errorMessage
    : converting
      ? "웹툰 이미지로 변환 중입니다. 보통 20~60초 정도 걸립니다."
      : successMessage;
  const isDetailScreen = Boolean(selectedProfile);
  const decoratedProfiles = buildDecoratedProfiles(profiles);
  const filteredProfiles = decoratedProfiles.filter((profile) => matchesProfileFilter(activeFilter, profile));
  const selectedDetailProfile = selectedProfile
    ? buildDecoratedProfiles([selectedProfile])[0]
    : null;

  async function loadData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextProfiles, nextRequests] = await Promise.all([
        fetchAiMatchProfiles(),
        fetchAiMatchRequests(),
      ]);
      setProfiles(Array.isArray(nextProfiles) ? nextProfiles : []);
      setRequests(Array.isArray(nextRequests) ? nextRequests : []);
    } catch (error) {
      setErrorMessage(error.message || "AI 매칭 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!converting) return undefined;

    const intervalId = window.setInterval(() => {
      setConvertSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [converting]);

  useEffect(() => {
    if (!selectedProfile) return;
    setRequestPlace(selectedProfile.meetPlace || MEET_PLACES[0]);
  }, [selectedProfile]);

  function toggleTag(tag) {
    setSelectedTags((current) => {
      if (current.includes(tag)) {
        return current.filter((item) => item !== tag);
      }
      if (current.length >= 6) {
        return current;
      }
      return [...current, tag];
    });
  }

  function toggleFavorite(profileId) {
    setFavoriteProfileIds((current) =>
      current.includes(profileId) ? current.filter((item) => item !== profileId) : [...current, profileId],
    );
  }

  function openProfile(profile) {
    setSelectedProfile(profile);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function closeDetail() {
    setSelectedProfile(null);
  }

  function resetRegistrationForm() {
    setNickname("");
    setGender("여성");
    setIntro("");
    setPlace(MEET_PLACES[0]);
    setSelectedTags([]);
    setPreviewUrl("");
    setOriginalImageUrl("");
    setGeneratedImageUrl("");
    setConsent(false);
    setConvertSeconds(0);
  }

  async function handleImageChange(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    setOriginalImageUrl("");
    setGeneratedImageUrl("");
    setPreviewUrl("");
    setConvertSeconds(0);
    setErrorMessage("");
    setSuccessMessage("");
    setConverting(true);

    try {
      const preview = await createAiMatchImagePreview(nextFile);
      const nextGeneratedImageUrl = preview.generatedImageUrl || "";
      setOriginalImageUrl(preview.originalImageUrl || "");
      setGeneratedImageUrl(nextGeneratedImageUrl);
      setPreviewUrl(resolveApiAssetUrl(nextGeneratedImageUrl));
      setSuccessMessage("웹툰 스타일 이미지가 준비되었습니다. 설명을 입력하고 등록하세요.");
    } catch (error) {
      setErrorMessage(error.message || "웹툰 이미지 변환에 실패했습니다.");
    } finally {
      setConverting(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (!canRegister) return;

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const nextProfile = await createAiMatchProfile(
        {
          nickname: nickname.trim(),
          gender,
          intro: serializeProfileCopy(intro, selectedTags),
          meetPlace: place,
          consent,
          originalImageUrl,
          generatedImageUrl,
        },
        null,
      );

      setProfiles((current) => [nextProfile, ...current]);
      resetRegistrationForm();
      setActiveScreen("people");
      setSuccessMessage("AI 프로필이 등록되었습니다. 등록된 사람들 화면에서 바로 확인해 보세요.");
    } catch (error) {
      setErrorMessage(error.message || "AI 프로필 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequest(event) {
    event.preventDefault();
    if (!selectedProfile) return;

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const nextRequest = await createAiMatchRequest(selectedProfile.id, {
        requesterNickname: requesterNickname.trim() || "익명",
        meetPlace: requestPlace,
        message: requestMessage.trim() || "축제에서 잠깐 만나고 싶어요.",
      });

      setRequests((current) => [nextRequest, ...current]);
      setRequesterNickname("");
      setRequestMessage("");
      setRequestPlace(MEET_PLACES[0]);
      setSelectedProfile(null);
      setActiveScreen("requests");
      setSuccessMessage("데이트 신청이 전송되었습니다.");
    } catch (error) {
      setErrorMessage(error.message || "데이트 신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderIntroScreen() {
    return (
      <div className="ai-match-flow">
        <section className="ai-match-hero-card">
          <div className="ai-match-hero-copy">
            <p>QR을 스캔하고 AI 프로필을 만들어보세요!</p>
            <h2>AI 소개팅 부스</h2>
            <span>축제에서 같이 걸을 사람을 빠르게 찾는 현장 매칭</span>
          </div>
          <div className="ai-match-float-heart ai-match-float-heart--a" aria-hidden>
            <IconHeart className="h-5 w-5" />
          </div>
          <div className="ai-match-float-heart ai-match-float-heart--b" aria-hidden>
            <IconSparkles className="h-4 w-4" />
          </div>
        </section>

        <section className="ai-match-qr-panel">
          <strong>QR을 스캔하세요</strong>
          <div className="ai-match-qr-board" aria-hidden="true">
            {QR_PATTERN.split("").map((cell, index) => (
              <span key={`qr-${index}`} className={cell === "1" ? "is-filled" : ""} />
            ))}
          </div>
          <small>
            <IconShield className="h-4 w-4" />
            안전한 연결로 보호됩니다.
          </small>
        </section>

        <section className="ai-match-step-card">
          <h3>간단한 4단계로 등록 완료!</h3>
          <div className="ai-match-step-list">
            {STEP_ITEMS.map((item) => (
              <article key={item.number} className="ai-match-step-row">
                <span>{item.number}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <button
          type="button"
          className="ai-match-primary-button ai-match-primary-button--hero"
          onClick={() => setActiveScreen("register")}
        >
          <span className="ai-match-primary-button__icon">
            <IconHeart className="h-4 w-4" />
          </span>
          <span className="ai-match-primary-button__label">시작하기</span>
        </button>

        <button
          type="button"
          className="ai-match-secondary-button"
          onClick={() => setActiveScreen("people")}
        >
          등록된 사람 보기
        </button>

        <p className="ai-match-note">
          <IconShield className="h-4 w-4" />
          개인정보는 안전하게 보호돼요.
        </p>
      </div>
    );
  }

  function renderRegisterScreen() {
    return (
      <form className="ai-match-flow" onSubmit={handleRegister}>
        <section className="ai-match-section-card">
          <div className="ai-match-section-head">
            <h2>1. 사진 업로드</h2>
            <span>정면 사진</span>
          </div>

          <div className="ai-match-preview-row">
            <div className="ai-match-preview-card">
              {originalImageUrl ? (
                <img src={resolveApiAssetUrl(originalImageUrl)} alt="" />
              ) : (
                <span>
                  <IconCamera className="h-7 w-7" />
                </span>
              )}
              <em>원본</em>
            </div>

            <div className="ai-match-preview-arrow" aria-hidden="true">
              <IconChevronRight className="h-4 w-4" />
            </div>

            <div className="ai-match-preview-card ai-match-preview-card--generated">
              {previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : (
                <span>
                  <IconSparkles className="h-7 w-7" />
                </span>
              )}
              <em>{converting ? "변환 중" : generatedImageUrl ? "AI 변환 미리보기" : "AI 변환 미리보기"}</em>
              {converting ? (
                <div className="ai-match-converting-overlay" role="status" aria-live="polite">
                  <span className="ai-match-converting-spinner" aria-hidden="true" />
                  <strong>AI 변환 중</strong>
                  <small>{convertSeconds}초 경과</small>
                </div>
              ) : null}
            </div>
          </div>

          <label className={`ai-match-upload-button${converting ? " is-disabled" : ""}`}>
            {converting ? "변환 중..." : generatedImageUrl ? "다른 사진 올리기" : "사진 업로드"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} disabled={converting} />
          </label>
        </section>

        <section className="ai-match-section-card">
          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>2. 닉네임을 입력해주세요</span>
              <small>{nickname.length}/12</small>
            </div>
            <input
              value={nickname}
              maxLength={12}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="예) 햇살같은하루"
            />
          </label>

          <div className="ai-match-field">
            <div className="ai-match-field-head">
              <span>3. 성별</span>
            </div>
            <div className="ai-match-gender-grid">
              {["남성", "여성", "비공개"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`ai-match-segment-button ai-match-segment-button--${getGenderButtonTone(item)}${gender === item ? " is-active" : ""}`}
                  onClick={() => setGender(item)}
                >
                  {getProfileGenderLabel(item)}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-match-field">
            <div className="ai-match-field-head">
              <span>4. 관심사 태그</span>
              <small>최대 6개</small>
            </div>
            <div className="ai-match-tag-grid">
              {REGISTRATION_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`ai-match-tag-chip${selectedTags.includes(tag) ? " is-selected" : ""}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>5. 자기소개</span>
              <small>{intro.length}/120</small>
            </div>
            <textarea
              value={intro}
              maxLength={120}
              onChange={(event) => setIntro(event.target.value)}
              placeholder="나를 간단히 소개해주세요. 예) 웃음이 많고 공원 산책을 좋아해요!"
            />
          </label>

          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>기본 만남 장소</span>
            </div>
            <select value={place} onChange={(event) => setPlace(event.target.value)}>
              {MEET_PLACES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="ai-match-consent-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>사진과 소개가 공개 목록에 표시되는 것에 동의합니다.</span>
          </label>
        </section>

        <button
          type="submit"
          className="ai-match-primary-button ai-match-primary-button--form"
          disabled={!canRegister}
        >
          <span className="ai-match-primary-button__icon">
            <IconHeart className="h-4 w-4" />
          </span>
          <span className="ai-match-primary-button__label">
            {submitting ? "등록 중..." : converting ? "AI 변환 중..." : "등록하기"}
          </span>
        </button>
      </form>
    );
  }

  function renderPeopleScreen() {
    return (
      <div className="ai-match-flow">
        <section className="ai-match-filter-bar">
          {PROFILE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`ai-match-filter-chip ai-match-filter-chip--${getFilterTone(filter)}${activeFilter === filter ? " is-active" : ""}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </section>

        <section className="ai-match-list-meta">
          <strong>{loading ? "불러오는 중..." : `${filteredProfiles.length}명`}</strong>
          <span>AI 프로필이 준비된 사람만 보여줘요.</span>
        </section>

        {filteredProfiles.length ? (
          <div className="ai-match-profile-list">
            {filteredProfiles.map((profile) => {
              const isFavorite = favoriteProfileIds.includes(profile.id);
              return (
                <article key={profile.id} className={`ai-match-person-card ai-match-person-card--${profile.tone}`}>
                  <button
                    type="button"
                    className="ai-match-favorite-button"
                    aria-label={isFavorite ? "관심 목록에서 제거" : "관심 목록에 추가"}
                    onClick={() => toggleFavorite(profile.id)}
                  >
                    {isFavorite ? <IconHeartFilled className="h-4 w-4" /> : <IconHeart className="h-4 w-4" />}
                  </button>

                  <div className="ai-match-person-main">
                    <button type="button" className="ai-match-person-photo" onClick={() => openProfile(profile)}>
                      {profile.generatedImageUrl ? (
                        <img src={resolveApiAssetUrl(profile.generatedImageUrl)} alt="" />
                      ) : (
                        <IconUsers className="h-8 w-8" />
                      )}
                    </button>

                    <div className="ai-match-person-copy">
                      <button type="button" className="ai-match-person-copy-link" onClick={() => openProfile(profile)}>
                        <em>{profile.genderLabel}</em>
                        <strong>
                          {profile.nickname}
                          <span />
                        </strong>
                        <small>{profile.meetPlace || "축제 부스 근처"}</small>
                        <p>{profile.summary}</p>
                      </button>

                      <div className="ai-match-person-footer">
                        <div className="ai-match-inline-tags">
                          {profile.tags.map((tag) => (
                            <span key={`${profile.id}-${tag}`}>{tag}</span>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="ai-match-request-button ai-match-request-button--card"
                          onClick={() => openProfile(profile)}
                        >
                          <span className="ai-match-request-button__icon">
                            <IconHeart className="h-4 w-4" />
                          </span>
                          <span className="ai-match-request-button__label">데이트 신청</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="ai-match-empty-card">
            <strong>{loading ? "프로필을 불러오는 중입니다." : "아직 등록된 프로필이 없습니다."}</strong>
            <p>{loading ? "잠시만 기다려 주세요." : "첫 번째 프로필을 등록하고 사람들 탭을 채워보세요."}</p>
            {!loading ? (
              <button type="button" className="ai-match-secondary-button" onClick={() => setActiveScreen("register")}>
                프로필 등록하러 가기
              </button>
            ) : null}
          </section>
        )}
      </div>
    );
  }

  function renderRequestsScreen() {
    return (
      <div className="ai-match-flow">
        <section className="ai-match-request-summary">
          <strong>최근 데이트 신청</strong>
          <p>전송된 신청 내역을 시간순으로 확인할 수 있어요.</p>
          <span>{requests.length}건</span>
        </section>

        {requests.length ? (
          <div className="ai-match-request-history">
            {requests.map((request) => (
              <article key={request.id} className="ai-match-request-history-card">
                <div className="ai-match-request-history-head">
                  <strong>{request.profileNickname}</strong>
                  <small>{formatRequestTime(request.createdAt)}</small>
                </div>
                <p>{request.requesterNickname}님이 데이트 신청을 보냈어요.</p>
                <span>
                  <IconMapPin className="h-4 w-4" />
                  {request.meetPlace}
                </span>
                <em>{request.message}</em>
              </article>
            ))}
          </div>
        ) : (
          <section className="ai-match-empty-card">
            <strong>아직 신청 내역이 없습니다.</strong>
            <p>사람들 탭에서 마음에 드는 프로필을 선택해 첫 신청을 보내보세요.</p>
          </section>
        )}
      </div>
    );
  }

  function renderDetailScreen() {
    if (!selectedDetailProfile) return null;

    return (
      <div className="ai-match-flow ai-match-flow--detail">
        <section className="ai-match-detail-hero">
          <span className={`ai-match-detail-badge ai-match-detail-badge--${selectedDetailProfile.tone}`}>
            {selectedDetailProfile.genderLabel}
          </span>
          {selectedDetailProfile.generatedImageUrl ? (
            <img src={resolveApiAssetUrl(selectedDetailProfile.generatedImageUrl)} alt="" />
          ) : (
            <div className="ai-match-detail-placeholder">
              <IconUsers className="h-10 w-10" />
            </div>
          )}
        </section>

        <section className="ai-match-detail-card">
          <strong>
            {selectedDetailProfile.nickname}
            <span />
          </strong>
          <small>{selectedDetailProfile.meetPlace || "축제 부스 주변에서 만나고 싶어요."}</small>
          <p>{selectedDetailProfile.summary}</p>
          <div className="ai-match-inline-tags">
            {selectedDetailProfile.tags.map((tag) => (
              <span key={`${selectedDetailProfile.id}-detail-${tag}`}>{tag}</span>
            ))}
          </div>
        </section>

        <section className="ai-match-safety-card">
          <IconShield className="h-5 w-5" />
          <p>안전한 만남을 위해 실명 및 연락처는 상호 매칭 후에만 공개됩니다.</p>
        </section>

        <form className="ai-match-request-sheet" onSubmit={handleRequest}>
          <div className="ai-match-request-sheet-head">
            <strong>데이트 신청</strong>
            <button type="button" aria-label="닫기" onClick={closeDetail}>
              <IconX className="h-4 w-4" />
            </button>
          </div>

          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>신청자 닉네임</span>
              <small>{requesterNickname.length}/12</small>
            </div>
            <input
              value={requesterNickname}
              maxLength={12}
              onChange={(event) => setRequesterNickname(event.target.value)}
              placeholder="예) 같이걷고싶어요"
            />
          </label>

          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>장소 선택</span>
            </div>
            <select value={requestPlace} onChange={(event) => setRequestPlace(event.target.value)}>
              {MEET_PLACES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>짧은 메시지</span>
              <small>{requestMessage.length}/100</small>
            </div>
            <textarea
              value={requestMessage}
              maxLength={100}
              onChange={(event) => setRequestMessage(event.target.value)}
              placeholder="예) 같이 산책하면서 이야기 나누고 싶어요 :)"
            />
          </label>

          <button
            type="submit"
            className="ai-match-primary-button ai-match-primary-button--sheet"
            disabled={submitting}
          >
            {submitting ? (
              <span className="ai-match-primary-button__icon">
                <IconSend className="h-4 w-4" />
              </span>
            ) : null}
            <span className="ai-match-primary-button__label">
              {submitting ? "전송 중..." : "데이트 신청 보내기"}
            </span>
            {!submitting ? (
              <span className="ai-match-primary-button__accent" aria-hidden="true">
                <IconSparkles className="h-4 w-4" />
              </span>
            ) : null}
          </button>
        </form>
      </div>
    );
  }

  if (isDetailScreen) {
    return (
      <section className="uni-page ai-match-page ai-match-redesigned ai-match-redesigned--detail" data-i18n-skip>
        <header className="ai-match-topbar">
          <button type="button" aria-label="사람 목록으로 돌아가기" onClick={closeDetail}>
            <IconArrowLeft className="h-5 w-5" />
          </button>

          <h1>프로필 상세</h1>

          <button
            type="button"
            className="ai-match-topbar-favorite"
            aria-label={favoriteProfileIds.includes(selectedProfile.id) ? "관심 목록에서 제거" : "관심 목록에 추가"}
            onClick={() => toggleFavorite(selectedProfile.id)}
          >
            {favoriteProfileIds.includes(selectedProfile.id) ? (
              <IconHeartFilled className="h-5 w-5" />
            ) : (
              <IconHeart className="h-5 w-5" />
            )}
          </button>
        </header>

        {bannerText ? (
          <p className={errorMessage ? "ai-match-banner ai-match-banner--error" : "ai-match-banner ai-match-banner--success"} aria-live="polite">
            {bannerText}
          </p>
        ) : null}

        {renderDetailScreen()}
      </section>
    );
  }

  return (
    <section className={`uni-page ai-match-page ai-match-redesigned ai-match-redesigned--${activeScreen}`} data-i18n-skip>
      <header className="ai-match-topbar">
        {activeScreen === "intro" ? (
          <Link to="/more" aria-label="더보기로 돌아가기">
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <button type="button" aria-label="홈으로 돌아가기" onClick={() => setActiveScreen("intro")}>
            <IconArrowLeft className="h-5 w-5" />
          </button>
        )}

        <h1>{SCREEN_COPY[activeScreen]}</h1>

        {activeScreen === "requests" ? (
          <button type="button" aria-label="새로고침" onClick={loadData} disabled={loading}>
            <IconRefresh className="h-5 w-5" />
          </button>
        ) : (
          <span className="ai-match-topbar-spacer" aria-hidden="true" />
        )}
      </header>

      {bannerText ? (
        <p className={errorMessage ? "ai-match-banner ai-match-banner--error" : "ai-match-banner ai-match-banner--success"} aria-live="polite">
          {bannerText}
        </p>
      ) : null}

      {activeScreen === "intro" ? renderIntroScreen() : null}
      {activeScreen === "register" ? renderRegisterScreen() : null}
      {activeScreen === "people" ? renderPeopleScreen() : null}
      {activeScreen === "requests" ? renderRequestsScreen() : null}

      {activeScreen === "people" || activeScreen === "requests" ? (
        <nav className="ai-match-bottom-nav" aria-label="AI 소개팅 화면 전환">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`ai-match-bottom-tab${isActive ? " is-active" : ""}`}
                onClick={() => setActiveScreen(item.id)}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </section>
  );
}
