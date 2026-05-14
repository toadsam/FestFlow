import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconArrowLeft,
  IconMapPin,
  IconRefresh,
  IconSend,
  IconUsers,
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

function getProfileTone(profile) {
  return profile.gender === "여성" ? "violet" : "mint";
}

export default function AiMatchPage() {
  const [profiles, setProfiles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("여성");
  const [intro, setIntro] = useState("");
  const [place, setPlace] = useState(MEET_PLACES[0]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [originalImageUrl, setOriginalImageUrl] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertSeconds, setConvertSeconds] = useState(0);
  const [consent, setConsent] = useState(false);
  const [requesterNickname, setRequesterNickname] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestPlace, setRequestPlace] = useState(MEET_PLACES[0]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canRegister = useMemo(
    () => nickname.trim() && intro.trim() && generatedImageUrl && consent && !submitting && !converting,
    [converting, consent, generatedImageUrl, intro, nickname, submitting],
  );

  const bannerText = errorMessage
    ? errorMessage
    : converting
      ? "웹툰 이미지로 변환 중입니다. 보통 20~60초 정도 걸립니다."
      : successMessage;

  const previewCaption = converting
    ? "웹툰 변환 중"
    : generatedImageUrl
      ? "웹툰 변환 완료"
      : "웹툰 변환 미리보기";

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
          intro: intro.trim(),
          meetPlace: place,
          consent,
          originalImageUrl,
          generatedImageUrl,
        },
        null,
      );

      setProfiles((current) => [nextProfile, ...current]);
      setNickname("");
      setGender("여성");
      setIntro("");
      setPlace(MEET_PLACES[0]);
      setPreviewUrl("");
      setOriginalImageUrl("");
      setGeneratedImageUrl("");
      setConsent(false);
      setConvertSeconds(0);
      setSuccessMessage("AI 프로필이 등록되었습니다.");
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
      setSuccessMessage("데이트 신청이 전송되었습니다.");
    } catch (error) {
      setErrorMessage(error.message || "데이트 신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="uni-page ai-match-page">
      <header className="plain-page-header">
        <Link to="/more" aria-label="더보기로 돌아가기">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1>AI 프로필 매칭</h1>
        <button type="button" aria-label="새로고침" onClick={loadData} disabled={loading}>
          <IconRefresh className="h-5 w-5" />
        </button>
      </header>

      <section className="ai-match-qr-card">
        <div className="ai-match-qr" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <strong>QR로 찍고 AI 프로필 등록</strong>
          <p>사진을 올리면 생성형 AI가 웹툰 스타일 프로필 이미지로 변환하고, 공개 목록에 등록합니다.</p>
        </div>
      </section>

      {bannerText ? (
        <p className={errorMessage ? "form-error-copy" : "form-success-copy"} aria-live="polite">
          {bannerText}
        </p>
      ) : null}

      <form className="uni-card ai-profile-form" onSubmit={handleRegister}>
        <div className="ai-photo-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="" />
          ) : (
            <span>
              <IconUsers className="h-8 w-8" />
            </span>
          )}
          <em>{previewCaption}</em>
          {converting ? (
            <div className="ai-converting-overlay" role="status" aria-live="polite">
              <span className="ai-converting-spinner" aria-hidden="true" />
              <strong>웹툰 이미지 변환 중</strong>
              <small>{convertSeconds}초 경과</small>
            </div>
          ) : null}
        </div>

        <label className={`ai-upload-button${converting ? " is-disabled" : ""}`}>
          {converting ? "변환 중..." : generatedImageUrl ? "다른 사진 올리기" : "사진 올리기"}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} disabled={converting} />
        </label>

        <div className="form-grid-2">
          <label>
            닉네임
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 다온" />
          </label>
          <label>
            성별
            <select value={gender} onChange={(event) => setGender(event.target.value)}>
              <option>여성</option>
              <option>남성</option>
              <option>비공개</option>
            </select>
          </label>
        </div>

        <label>
          간략한 설명
          <textarea
            value={intro}
            onChange={(event) => setIntro(event.target.value)}
            placeholder="어떤 축제 데이트를 하고 싶은지 적어주세요."
          />
        </label>

        <label>
          기본 만남 장소
          <select value={place} onChange={(event) => setPlace(event.target.value)}>
            {MEET_PLACES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="ai-consent-row">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          사진과 소개가 공개 목록에 표시되는 것에 동의합니다.
        </label>

        <button type="submit" className="primary-wide-button" disabled={!canRegister}>
          {submitting ? "등록 중..." : converting ? "웹툰 변환 중..." : "웹사이트에 등록"}
        </button>
      </form>

      <section className="uni-section ai-profile-section">
        <div className="uni-section-head">
          <h2>등록된 프로필</h2>
          <span>{loading ? "불러오는 중" : `${profiles.length}명`}</span>
        </div>

        {profiles.length ? (
          <div className="ai-profile-grid">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={`ai-profile-card ai-profile-card--${getProfileTone(profile)}`}
                onClick={() => setSelectedProfile(profile)}
              >
                <span className="ai-profile-image">
                  {profile.generatedImageUrl ? (
                    <img src={resolveApiAssetUrl(profile.generatedImageUrl)} alt="" />
                  ) : (
                    <IconUsers className="h-8 w-8" />
                  )}
                </span>
                <span className="ai-profile-meta">
                  <em>{profile.gender}</em>
                  <strong>{profile.nickname}</strong>
                  <small>{profile.intro}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-copy">{loading ? "프로필을 불러오고 있습니다." : "아직 등록된 프로필이 없습니다."}</p>
        )}
      </section>

      <section className="uni-section ai-request-section">
        <div className="uni-section-head">
          <h2>받은 데이트 신청</h2>
          <span>{requests.length}건</span>
        </div>
        {requests.length ? (
          <div className="ai-request-list">
            {requests.slice(0, 4).map((request) => (
              <article key={request.id}>
                <strong>
                  {request.requesterNickname} → {request.profileNickname}
                </strong>
                <span>
                  <IconMapPin className="h-4 w-4" />
                  {request.meetPlace}
                </span>
                <small>{request.message}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">아직 들어온 신청이 없습니다.</p>
        )}
      </section>

      {selectedProfile ? (
        <div className="ai-match-modal" role="dialog" aria-modal="true" aria-label="데이트 신청">
          <form className="ai-match-dialog" onSubmit={handleRequest}>
            <button type="button" className="ai-match-close" onClick={() => setSelectedProfile(null)}>
              닫기
            </button>
            <div className="ai-match-dialog-head">
              <span className="ai-profile-image">
                {selectedProfile.generatedImageUrl ? (
                  <img src={resolveApiAssetUrl(selectedProfile.generatedImageUrl)} alt="" />
                ) : (
                  <IconUsers className="h-8 w-8" />
                )}
              </span>
              <div>
                <em>{selectedProfile.gender}</em>
                <strong>{selectedProfile.nickname}</strong>
                <small>{selectedProfile.intro}</small>
              </div>
            </div>
            <label>
              신청자 닉네임
              <input
                value={requesterNickname}
                onChange={(event) => setRequesterNickname(event.target.value)}
                placeholder="예: 민준"
              />
            </label>
            <label>
              만날 장소
              <select value={requestPlace} onChange={(event) => setRequestPlace(event.target.value)}>
                {MEET_PLACES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              신청 메시지
              <textarea
                value={requestMessage}
                onChange={(event) => setRequestMessage(event.target.value)}
                placeholder="짧은 메시지를 남겨주세요."
              />
            </label>
            <button type="submit" className="primary-wide-button" disabled={submitting}>
              <IconSend className="h-4 w-4" />
              {submitting ? "전송 중..." : "데이트 신청"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
