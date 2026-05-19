import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteAdminAiMatchProfile,
  fetchAdminAiMatchOverview,
  loginAdmin,
  resolveApiAssetUrl,
  updateAdminAiMatchConnectionStatus,
  updateAdminAiMatchRequestNote,
} from "../api";
import {
  IconArrowLeft,
  IconClipboard,
  IconEye,
  IconEyeOff,
  IconHeart,
  IconMapPin,
  IconRefresh,
  IconSearch,
  IconShield,
  IconUsers,
  IconX,
} from "../components/UxIcons";
import { clearLogin, getAdminName, isLoggedIn, saveLogin } from "../utils/auth";

const STATUS_LABELS = {
  PENDING: "대기중",
  ACCEPTED: "매치 성사",
  PROPOSED: "매치 성사",
  CONFIRMED: "매치 성사",
  REJECTED: "거절",
  CANCELED: "취소",
};
const CONNECTION_STATUS_LABELS = {
  WAITING: "연결 대기중",
  COMPLETED: "연결 완료",
  FAILED: "연결 실패",
};
const CONNECTION_STATUS_OPTIONS = [
  ["WAITING", "연결 대기중"],
  ["COMPLETED", "연결 완료"],
  ["FAILED", "연결 실패"],
];

function adminErrorMessage(error) {
  if (error?.status === 401 || error?.status === 403) {
    return "로그인이 필요하거나 권한이 만료되었습니다.";
  }
  return error?.message || "요청을 처리하지 못했습니다.";
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "대기중";
}

function getConnectionStatusLabel(status) {
  return CONNECTION_STATUS_LABELS[status] || "연결 대기중";
}

function getProfileStatusLabel(status) {
  if (status === "ACTIVE") return "활성";
  if (status === "DELETED") return "삭제됨";
  return status || "상태 없음";
}

function isMatched(status) {
  return ["ACCEPTED", "PROPOSED", "CONFIRMED"].includes(status);
}

function parseProfileMeta(intro) {
  const source = `${intro || ""}`;
  const mbtiMatch = source.match(/\bMBTI\s*:\s*([A-Za-z]{4})\b/i);
  const tags = [...source.matchAll(/#([^\s#]+)/g)].map((match) => match[1]).slice(0, 6);
  const summary = source
    .replace(/\bMBTI\s*:\s*[A-Za-z]{4}\b/gi, "")
    .replace(/#([^\s#]+)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    summary,
    mbti: mbtiMatch ? mbtiMatch[1].toUpperCase() : "",
    tags,
  };
}

function getProfileImageUrl(profile) {
  return resolveApiAssetUrl(profile?.generatedImageUrl || profile?.originalImageUrl || "");
}

function AvatarThumb({ imageUrl, name }) {
  const resolvedUrl = resolveApiAssetUrl(imageUrl || "");
  const initial = `${name || "?"}`.slice(0, 1);
  return (
    <span className="admin-ai-avatar" aria-label={name || "프로필"}>
      {resolvedUrl ? <img src={resolvedUrl} alt="" /> : <em>{initial}</em>}
    </span>
  );
}

function AdminImageCompare({ originalImageUrl, generatedImageUrl, name }) {
  const originalUrl = resolveApiAssetUrl(originalImageUrl || "");
  const generatedUrl = resolveApiAssetUrl(generatedImageUrl || "");
  if (!originalUrl && !generatedUrl) return null;
  const label = name || "프로필";

  return (
    <div className="admin-ai-image-compare">
      <a href={originalUrl || generatedUrl} target="_blank" rel="noreferrer" title={`${label} 원본 사진`}>
        {originalUrl ? <img src={originalUrl} alt={`${label} 원본 사진`} /> : <span>원본 없음</span>}
        <em>원본 사진</em>
      </a>
      <a href={generatedUrl || originalUrl} target="_blank" rel="noreferrer" title={`${label} AI 변환 사진`}>
        {generatedUrl ? <img src={generatedUrl} alt={`${label} AI 변환 사진`} /> : <span>AI 없음</span>}
        <em>AI 사진</em>
      </a>
    </div>
  );
}

export default function AiMatchAdminPage() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [adminName, setAdminName] = useState(getAdminName());
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "1234" });
  const [showPassword, setShowPassword] = useState(false);
  const [overview, setOverview] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [noteBusyId, setNoteBusyId] = useState(null);
  const [deleteBusyId, setDeleteBusyId] = useState(null);
  const [completePulseId, setCompletePulseId] = useState(null);
  const [profileQuery, setProfileQuery] = useState("");
  const [requestQuery, setRequestQuery] = useState("");
  const [selectedInterestFilters, setSelectedInterestFilters] = useState([]);
  const [profileGenderFilter, setProfileGenderFilter] = useState("ALL");
  const [profileMbtiFilter, setProfileMbtiFilter] = useState("ALL");
  const [profileStatusFilter, setProfileStatusFilter] = useState("ALL");
  const [requestStatusFilter, setRequestStatusFilter] = useState("ALL");
  const [expandedMatchIds, setExpandedMatchIds] = useState([]);
  const [expandedProfileIds, setExpandedProfileIds] = useState([]);
  const [noteDrafts, setNoteDrafts] = useState({});
  const overviewRefreshInFlightRef = useRef(false);
  const completePulseTimerRef = useRef(null);

  const profiles = Array.isArray(overview?.profiles) ? overview.profiles : [];
  const requests = Array.isArray(overview?.requests) ? overview.requests : [];
  const profileStatusById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.status])),
    [profiles],
  );
  const matchedRequests = useMemo(() => requests.filter((request) => isMatched(request.status)), [requests]);
  const waitingConnectionCount = useMemo(
    () => matchedRequests.filter((request) => (request.connectionStatus || "WAITING") === "WAITING").length,
    [matchedRequests],
  );
  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "PENDING"), [requests]);
  const adminStats = useMemo(() => {
    const genderCounts = new Map();
    const mbtiCounts = new Map();
    const interestCounts = new Map();
    profiles.forEach((profile) => {
      const meta = parseProfileMeta(profile.intro);
      if (profile.gender) genderCounts.set(profile.gender, (genderCounts.get(profile.gender) || 0) + 1);
      if (meta.mbti) mbtiCounts.set(meta.mbti, (mbtiCounts.get(meta.mbti) || 0) + 1);
      meta.tags.forEach((tag) => {
        interestCounts.set(tag, (interestCounts.get(tag) || 0) + 1);
      });
    });
    const topEntries = (map, limit = 4) => [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);
    const totalRequests = requests.length;
    const matchedCount = requests.filter((request) => isMatched(request.status)).length;
    const rejectedCount = requests.filter((request) => request.status === "REJECTED").length;
    const canceledCount = requests.filter((request) => request.status === "CANCELED").length;
    return {
      genderCounts: topEntries(genderCounts),
      mbtiCounts: topEntries(mbtiCounts),
      interestCounts: topEntries(interestCounts, 6),
      matchedRate: totalRequests ? Math.round((matchedCount / totalRequests) * 100) : 0,
      rejectedCount,
      canceledCount,
    };
  }, [profiles, requests]);
  const profileFilterOptions = useMemo(() => {
    const interestCounts = new Map();
    const genders = new Set();
    const mbtis = new Set();
    profiles.forEach((profile) => {
      const meta = parseProfileMeta(profile.intro);
      if (profile.gender) genders.add(profile.gender);
      if (meta.mbti) mbtis.add(meta.mbti);
      meta.tags.forEach((tag) => {
        interestCounts.set(tag, (interestCounts.get(tag) || 0) + 1);
      });
    });
    return {
      interests: [...interestCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag, count]) => ({ tag, count })),
      genders: [...genders].sort((a, b) => a.localeCompare(b)),
      mbtis: [...mbtis].sort((a, b) => a.localeCompare(b)),
    };
  }, [profiles]);
  const hasProfileFilters = Boolean(
    profileQuery.trim()
      || selectedInterestFilters.length
      || profileGenderFilter !== "ALL"
      || profileMbtiFilter !== "ALL"
      || profileStatusFilter !== "ALL",
  );
  const filteredProfiles = useMemo(() => {
    const query = profileQuery.trim().toLowerCase();
    return profiles.filter((profile) => {
      const meta = parseProfileMeta(profile.intro);
      const searchableText = [
        profile.nickname,
        profile.gender,
        profile.phoneNumber,
        profile.meetPlace,
        meta.summary,
        meta.mbti,
        ...meta.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (query && !searchableText.includes(query)) return false;
      if (profileGenderFilter !== "ALL" && profile.gender !== profileGenderFilter) return false;
      if (profileMbtiFilter !== "ALL" && meta.mbti !== profileMbtiFilter) return false;
      if (profileStatusFilter !== "ALL" && profile.status !== profileStatusFilter) return false;
      if (selectedInterestFilters.length && !selectedInterestFilters.some((tag) => meta.tags.includes(tag))) return false;
      return true;
    });
  }, [profiles, profileQuery, profileGenderFilter, profileMbtiFilter, profileStatusFilter, selectedInterestFilters]);
  const filteredRequests = useMemo(() => {
    const query = requestQuery.trim().toLowerCase();
    return requests.filter((request) => {
      const statusMatched = requestStatusFilter === "ALL"
        ? true
        : requestStatusFilter === "MATCHED"
          ? isMatched(request.status)
          : request.status === requestStatusFilter;
      if (!statusMatched) return false;
      if (!query) return true;
      return [
        request.requesterNickname,
        request.profileNickname,
        request.requesterPhoneNumber,
        request.profilePhoneNumber,
        request.meetPlace,
        request.message,
        request.status,
        getStatusLabel(request.status),
        request.connectionStatus,
        getConnectionStatusLabel(request.connectionStatus || "WAITING"),
        request.adminNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [requests, requestStatusFilter, requestQuery]);
  const canAdminDeleteProfile = (profileId) => Boolean(profileId && profileStatusById.get(profileId) === "ACTIVE");

  async function loadOverview({ silent = false, force = false } = {}) {
    if (overviewRefreshInFlightRef.current && !force) return;
    overviewRefreshInFlightRef.current = true;
    if (!silent) {
      setLoading(true);
      setMessage("소개팅 운영 현황을 불러오는 중입니다.");
    }
    try {
      const data = await fetchAdminAiMatchOverview();
      setOverview(data);
      if (!silent) {
        setMessage("소개팅 운영 현황이 최신 상태입니다.");
      }
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearLogin();
        setLoggedIn(false);
        setAdminName("");
      }
      setMessage(adminErrorMessage(error));
    } finally {
      if (!silent) {
        setLoading(false);
      }
      overviewRefreshInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (loggedIn) {
      loadOverview();
    }
  }, [loggedIn]);

  useEffect(() => () => {
    if (completePulseTimerRef.current) {
      window.clearTimeout(completePulseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return undefined;

    const refreshSilently = () => {
      if (document.visibilityState === "hidden") return;
      loadOverview({ silent: true });
    };
    const intervalId = window.setInterval(refreshSilently, 2000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
      }
    };
    window.addEventListener("focus", refreshSilently);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSilently);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loggedIn]);

  async function handleLogin(event) {
    event.preventDefault();
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("로그인 중입니다.");
    try {
      const data = await loginAdmin(loginForm.username.trim(), loginForm.password);
      saveLogin(data.token, data.username);
      setAdminName(data.username);
      setLoggedIn(true);
      setMessage("로그인되었습니다.");
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearLogin();
    setLoggedIn(false);
    setAdminName("");
    setOverview(null);
    setMessage("로그아웃되었습니다.");
  }

  async function handleConnectionStatusChange(requestId, connectionStatus) {
    setStatusBusyId(requestId);
    setMessage("연결 상태를 저장하는 중입니다.");
    try {
      await updateAdminAiMatchConnectionStatus(requestId, connectionStatus);
      await loadOverview({ force: true });
      if (connectionStatus === "COMPLETED") {
        setCompletePulseId(requestId);
        if (completePulseTimerRef.current) {
          window.clearTimeout(completePulseTimerRef.current);
        }
        completePulseTimerRef.current = window.setTimeout(() => {
          setCompletePulseId(null);
          completePulseTimerRef.current = null;
        }, 1300);
      }
      setMessage("연결 상태를 저장했습니다.");
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleAdminNoteSave(request) {
    if (!request?.id) return;
    const nextNote = noteDrafts[request.id] ?? request.adminNote ?? "";
    setNoteBusyId(request.id);
    setMessage("관리자 메모를 저장하는 중입니다.");
    try {
      const saved = await updateAdminAiMatchRequestNote(request.id, nextNote);
      setNoteDrafts((prev) => ({ ...prev, [request.id]: saved.adminNote || "" }));
      await loadOverview({ force: true });
      setMessage("관리자 메모를 저장했습니다.");
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setNoteBusyId(null);
    }
  }

  async function handleAdminDeleteProfile(profileId, nickname) {
    if (!profileId) return;
    const ok = window.confirm(`${nickname || "이 프로필"}을 관리자 권한으로 삭제할까요?\n삭제하면 사용자 화면에서 사라지고 비밀번호 로그인이 막힙니다.`);
    if (!ok) return;

    setDeleteBusyId(profileId);
    setMessage("프로필을 삭제 처리하는 중입니다.");
    try {
      await deleteAdminAiMatchProfile(profileId);
      await loadOverview({ force: true });
      setMessage(`${nickname || "프로필"}을 삭제 처리했습니다.`);
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setDeleteBusyId(null);
    }
  }

  function toggleExpandedMatch(requestId) {
    setExpandedMatchIds((prev) => (
      prev.includes(requestId) ? prev.filter((id) => id !== requestId) : [...prev, requestId]
    ));
  }

  function toggleExpandedProfile(profileId) {
    setExpandedProfileIds((prev) => (
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    ));
  }

  function toggleInterestFilter(tag) {
    setSelectedInterestFilters((prev) => (
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    ));
  }

  function clearProfileFilters() {
    setProfileQuery("");
    setSelectedInterestFilters([]);
    setProfileGenderFilter("ALL");
    setProfileMbtiFilter("ALL");
    setProfileStatusFilter("ALL");
  }

  if (!loggedIn) {
    return (
      <section className="auth-entry-screen ai-match-admin-auth" data-i18n-skip>
        <form className="auth-entry-card" onSubmit={handleLogin}>
          <p className="auth-entry-brand">AI Match Admin</p>
          <div className="auth-entry-copy">
            <h1>소개팅 전용 관리자</h1>
            <p>매치 성사 현황과 연락처를 확인하는 전용 화면입니다.</p>
          </div>
          <div className="auth-entry-field">
            <input
              className="auth-entry-input"
              placeholder="아이디"
              value={loginForm.username}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
              autoComplete="username"
            />
          </div>
          <div className="auth-entry-field auth-entry-field--password">
            <input
              type={showPassword ? "text" : "password"}
              className="auth-entry-input"
              placeholder="비밀번호"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-entry-visibility"
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
            </button>
          </div>
          <button className="auth-entry-submit" type="submit" disabled={loading}>
            {loading ? "로그인 중" : "로그인"}
          </button>
          {message ? <p className="auth-entry-message">{message}</p> : null}
        </form>
      </section>
    );
  }

  return (
    <section className="cyber-page admin-console-page ai-match-admin-page" data-i18n-skip>
      <header className="admin-console-hero ai-match-admin-hero">
        <div className="admin-console-hero__top">
          <div className="admin-console-hero__copy">
            <span className="admin-console-hero__eyebrow">AI Match Control</span>
            <h1>소개팅 전용 관리자</h1>
            <p>{adminName} 계정으로 로그인됨 · 매치 성사 후 양쪽 연락처를 확인해 조율합니다.</p>
          </div>
          <div className="admin-console-hero__actions">
            <Link to="/ai-match">
              <IconArrowLeft className="h-4 w-4" />
              <span>사용자 화면</span>
            </Link>
            <button type="button" onClick={loadOverview} disabled={loading}>
              <IconRefresh className="h-4 w-4" />
              <span>새로고침</span>
            </button>
            <button type="button" onClick={handleLogout}>로그아웃</button>
          </div>
        </div>

        {message ? <p className="admin-console-status">{message}</p> : null}

        <div className="admin-ai-command-card">
          <div className="admin-ai-command-card__mark">
            <IconHeart className="h-5 w-5" />
          </div>
          <div>
            <strong>{matchedRequests.length ? "성사된 매치를 먼저 확인하세요" : "아직 조율할 매치가 없습니다"}</strong>
            <p>
              {matchedRequests.length
                ? "아래 연락 대상 카드에서 양쪽 전화번호와 선호 장소를 확인할 수 있습니다."
                : "참가자가 데이트 신청을 수락하면 이 화면에 연락 대상이 자동으로 표시됩니다."}
            </p>
          </div>
        </div>

        <div className="admin-ai-match-kpi-grid">
          <article className="admin-ai-kpi-card admin-ai-kpi-card--profile">
            <div className="admin-ai-kpi-card__icon"><IconUsers className="h-5 w-5" /></div>
            <span>활성 프로필</span>
            <strong>{overview?.activeProfileCount ?? 0}</strong>
            <small>전체 {overview?.totalProfileCount ?? 0}명</small>
          </article>
          <article className="admin-ai-kpi-card admin-ai-kpi-card--request">
            <div className="admin-ai-kpi-card__icon"><IconClipboard className="h-5 w-5" /></div>
            <span>전체 신청</span>
            <strong>{overview?.totalRequestCount ?? 0}</strong>
            <small>누적 신청</small>
          </article>
          <article className="admin-ai-kpi-card admin-ai-kpi-card--pending">
            <div className="admin-ai-kpi-card__icon"><IconShield className="h-5 w-5" /></div>
            <span>대기중</span>
            <strong>{pendingRequests.length}</strong>
            <small>응답 필요</small>
          </article>
          <article className="admin-ai-kpi-card admin-ai-kpi-card--matched">
            <div className="admin-ai-kpi-card__icon"><IconHeart className="h-5 w-5" /></div>
            <span>성사된 매치</span>
            <strong>{matchedRequests.length}</strong>
            <small>연락 조율</small>
          </article>
        </div>
      </header>

      <section className="admin-ai-operations-strip">
        <article>
          <span>오늘 할 일</span>
          <strong>{matchedRequests.length ? `${matchedRequests.length}건 연락 조율` : "연락 대기 없음"}</strong>
          <small>{waitingConnectionCount ? `${waitingConnectionCount}건은 아직 연결 대기중입니다.` : "대기 중인 연결이 없습니다."}</small>
        </article>
        <article>
          <span>대기 흐름</span>
          <strong>{pendingRequests.length ? `${pendingRequests.length}건 응답 대기` : "대기 없음"}</strong>
          <small>참가자 수락/거절에 따라 자동으로 상태가 바뀝니다.</small>
        </article>
      </section>

      <section className="admin-ai-stat-panel" aria-label="간단 통계">
        <div className="admin-ai-stat-panel__head">
          <div>
            <span>간단 통계</span>
            <strong>운영 흐름 요약</strong>
          </div>
          <em>성사율 {adminStats.matchedRate}%</em>
        </div>
        <div className="admin-ai-stat-grid">
          <article>
            <span>성별</span>
            <div>
              {adminStats.genderCounts.length ? adminStats.genderCounts.map(([label, count]) => (
                <small key={`gender-${label}`}>{label} {count}</small>
              )) : <small>데이터 없음</small>}
            </div>
          </article>
          <article>
            <span>인기 관심사</span>
            <div>
              {adminStats.interestCounts.length ? adminStats.interestCounts.map(([label, count]) => (
                <small key={`interest-${label}`}>{label} {count}</small>
              )) : <small>데이터 없음</small>}
            </div>
          </article>
          <article>
            <span>MBTI</span>
            <div>
              {adminStats.mbtiCounts.length ? adminStats.mbtiCounts.map(([label, count]) => (
                <small key={`mbti-${label}`}>{label} {count}</small>
              )) : <small>데이터 없음</small>}
            </div>
          </article>
          <article>
            <span>신청 결과</span>
            <div>
              <small>성사 {matchedRequests.length}</small>
              <small>거절 {adminStats.rejectedCount}</small>
              <small>취소 {adminStats.canceledCount}</small>
            </div>
          </article>
        </div>
      </section>

      <div className="admin-ai-dashboard-grid">
      <aside className="admin-ai-dashboard-side">
      <article className="admin-console-panel admin-console-panel--ai-match">
        <div className="admin-console-panel__head">
          <div>
            <span>관리자 연락 대상</span>
            <h3>성사된 매치</h3>
          </div>
          <strong>{matchedRequests.length}건</strong>
        </div>
        <div className="admin-ai-match-list">
          {matchedRequests.length === 0 && <p className="admin-console-hint">아직 성사된 매치가 없습니다.</p>}
          {matchedRequests.map((request) => {
            const connectionStatus = request.connectionStatus || "WAITING";
            const isCompleted = connectionStatus === "COMPLETED";
            const isFailed = connectionStatus === "FAILED";
            const isCompletePulse = completePulseId === request.id;
            const isMatchExpanded = expandedMatchIds.includes(request.id);
            return (
            <div
              key={`matched-${request.id}`}
              className={[
                "admin-ai-match-card",
                isCompleted ? "is-completed" : "",
                isFailed ? "is-failed" : "",
                isCompletePulse ? "is-complete-pulse" : "",
              ].filter(Boolean).join(" ")}
            >
              {isCompletePulse ? (
                <div className="admin-ai-complete-burst" aria-hidden="true">
                  <IconHeart className="h-12 w-12" />
                </div>
              ) : null}
              <div className="admin-ai-match-card__top">
                <div className="admin-ai-match-pair">
                  <AvatarThumb imageUrl={request.requesterImageUrl} name={request.requesterNickname} />
                  <IconHeart className="h-4 w-4" />
                  <AvatarThumb imageUrl={request.profileImageUrl} name={request.profileNickname} />
                </div>
                <div>
                  <strong>{request.requesterNickname} → {request.profileNickname}</strong>
                  <small>{request.createdAt?.replace("T", " ").slice(5, 16) || "시간 없음"}</small>
                </div>
                <em>{getConnectionStatusLabel(connectionStatus)}</em>
              </div>
              <div className="admin-ai-compact-meta">
                <span>{request.requesterPhoneNumber ? "신청자 연락처 있음" : "신청자 연락처 없음"}</span>
                <span>{request.profilePhoneNumber ? "상대 연락처 있음" : "상대 연락처 없음"}</span>
                <span>{request.meetPlace || "장소 미지정"}</span>
              </div>
              <button
                type="button"
                className="admin-ai-detail-toggle"
                onClick={() => toggleExpandedMatch(request.id)}
              >
                {isMatchExpanded ? "상세 접기" : "상세 보기"}
              </button>
              {isMatchExpanded ? (
                <div className="admin-ai-detail-panel">
              <div className="admin-ai-match-contact-grid">
                <a className="admin-ai-contact-card" href={request.requesterPhoneNumber ? `tel:${request.requesterPhoneNumber}` : undefined}>
                  <span>신청자</span>
                  <strong>{request.requesterNickname}</strong>
                  <small>{request.requesterPhoneNumber || "전화번호 없음"}</small>
                </a>
                <a className="admin-ai-contact-card" href={request.profilePhoneNumber ? `tel:${request.profilePhoneNumber}` : undefined}>
                  <span>상대방</span>
                  <strong>{request.profileNickname}</strong>
                  <small>{request.profilePhoneNumber || "전화번호 없음"}</small>
                </a>
              </div>
              <div className="admin-ai-match-photo-grid">
                <div>
                  <strong>{request.requesterNickname}</strong>
                  <AdminImageCompare
                    originalImageUrl={request.requesterOriginalImageUrl}
                    generatedImageUrl={request.requesterImageUrl}
                    name={request.requesterNickname}
                  />
                  <button
                    type="button"
                    className="admin-ai-danger-action"
                    onClick={() => handleAdminDeleteProfile(request.requesterProfileId, request.requesterNickname)}
                    disabled={!canAdminDeleteProfile(request.requesterProfileId) || deleteBusyId === request.requesterProfileId}
                  >
                    <IconX className="h-4 w-4" />
                    <span>{canAdminDeleteProfile(request.requesterProfileId) ? deleteBusyId === request.requesterProfileId ? "삭제 중" : "프로필 삭제" : "삭제됨"}</span>
                  </button>
                </div>
                <div>
                  <strong>{request.profileNickname}</strong>
                  <AdminImageCompare
                    originalImageUrl={request.profileOriginalImageUrl}
                    generatedImageUrl={request.profileImageUrl}
                    name={request.profileNickname}
                  />
                  <button
                    type="button"
                    className="admin-ai-danger-action"
                    onClick={() => handleAdminDeleteProfile(request.profileId, request.profileNickname)}
                    disabled={!canAdminDeleteProfile(request.profileId) || deleteBusyId === request.profileId}
                  >
                    <IconX className="h-4 w-4" />
                    <span>{canAdminDeleteProfile(request.profileId) ? deleteBusyId === request.profileId ? "삭제 중" : "프로필 삭제" : "삭제됨"}</span>
                  </button>
                </div>
              </div>
              <div className="admin-ai-match-note">
                <IconMapPin className="h-4 w-4" />
                <span>{request.meetPlace || "장소 미지정"}</span>
                <p>{request.message || "메시지 없음"}</p>
              </div>
              <div className="admin-ai-note-box">
                <div className="admin-ai-note-box__head">
                  <strong>관리자 기록</strong>
                  <span>{(noteDrafts[request.id] ?? request.adminNote ?? "").length}/1000</span>
                </div>
                <textarea
                  value={noteDrafts[request.id] ?? request.adminNote ?? ""}
                  maxLength={1000}
                  placeholder="예) 신청자 18:20 전화 완료, 상대방 문자 발송, 19:00 재연락 필요"
                  onChange={(event) => setNoteDrafts((prev) => ({ ...prev, [request.id]: event.target.value }))}
                />
                <div className="admin-ai-note-box__actions">
                  <small>{request.updatedAt ? `마지막 변경 ${request.updatedAt.replace("T", " ").slice(5, 16)}` : "저장 기록 없음"}</small>
                  <button
                    type="button"
                    className="admin-ai-note-save"
                    onClick={() => handleAdminNoteSave(request)}
                    disabled={noteBusyId === request.id}
                  >
                    {noteBusyId === request.id ? "저장 중" : "메모 저장"}
                  </button>
                </div>
              </div>
                </div>
              ) : null}
              <div className="admin-ai-connection-controls">
                {CONNECTION_STATUS_OPTIONS.map(([value, label]) => (
                  <button
                    key={`${request.id}-${value}`}
                    type="button"
                    className={[
                      connectionStatus === value ? "is-active" : "",
                      `is-${value.toLowerCase()}`,
                    ].filter(Boolean).join(" ")}
                    onClick={() => handleConnectionStatusChange(request.id, value)}
                    disabled={statusBusyId === request.id}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
          })}
        </div>
      </article>

      <article className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>전체 신청 로그</span>
            <h3>신청 기록</h3>
          </div>
          <strong>{filteredRequests.length}/{requests.length}건</strong>
        </div>
        <label className="admin-ai-search-field admin-ai-search-field--compact">
          <IconSearch className="h-4 w-4" />
          <input
            value={requestQuery}
            onChange={(event) => setRequestQuery(event.target.value)}
            placeholder="신청자, 상대, 연락처, 장소, 메시지, 메모 검색"
          />
        </label>
        <div className="admin-ai-status-filter">
          {[
            ["ALL", "전체"],
            ["MATCHED", "성사"],
            ["PENDING", "대기"],
            ["REJECTED", "거절"],
            ["CANCELED", "취소"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={requestStatusFilter === value ? "is-active" : ""}
              onClick={() => setRequestStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="admin-ai-request-table">
          {filteredRequests.length === 0 && <p className="admin-console-hint">표시할 신청 기록이 없습니다.</p>}
          {filteredRequests.map((request) => (
            <div key={request.id} className="admin-ai-request-row">
              <div className="admin-ai-request-row__people">
                <AvatarThumb imageUrl={request.requesterImageUrl} name={request.requesterNickname} />
                <div>
                  <strong>{request.requesterNickname} → {request.profileNickname}</strong>
                  <small>{request.createdAt?.replace("T", " ").slice(5, 16) || "-"}</small>
                </div>
              </div>
              <div className="admin-ai-request-row__meta">
                <span>{getStatusLabel(request.status)}</span>
                {isMatched(request.status) ? <span>{getConnectionStatusLabel(request.connectionStatus || "WAITING")}</span> : null}
                {request.adminNote ? <span>메모 있음</span> : null}
                <small>{request.meetPlace || "장소 없음"}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
      </aside>

      <main className="admin-ai-dashboard-main">
      <article className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>프로필별 현황</span>
            <h3>등록된 사람들</h3>
          </div>
          <strong>{filteredProfiles.length}/{profiles.length}명</strong>
        </div>
        <label className="admin-ai-search-field">
          <IconSearch className="h-4 w-4" />
          <input
            value={profileQuery}
            onChange={(event) => setProfileQuery(event.target.value)}
            placeholder="닉네임, 전화번호, MBTI, 관심사 검색"
          />
        </label>
        <div className="admin-ai-profile-filter-panel">
          <div className="admin-ai-profile-filter-row">
            <label>
              <span>상태</span>
              <select value={profileStatusFilter} onChange={(event) => setProfileStatusFilter(event.target.value)}>
                <option value="ALL">전체</option>
                <option value="ACTIVE">활성</option>
                <option value="DELETED">삭제됨</option>
              </select>
            </label>
            <label>
              <span>성별</span>
              <select value={profileGenderFilter} onChange={(event) => setProfileGenderFilter(event.target.value)}>
                <option value="ALL">전체</option>
                {profileFilterOptions.genders.map((gender) => (
                  <option key={gender} value={gender}>{gender}</option>
                ))}
              </select>
            </label>
            <label>
              <span>MBTI</span>
              <select value={profileMbtiFilter} onChange={(event) => setProfileMbtiFilter(event.target.value)}>
                <option value="ALL">전체</option>
                {profileFilterOptions.mbtis.map((mbti) => (
                  <option key={mbti} value={mbti}>{mbti}</option>
                ))}
              </select>
            </label>
            <button type="button" className="admin-ai-filter-clear" onClick={clearProfileFilters} disabled={!hasProfileFilters}>
              초기화
            </button>
          </div>
          <div className="admin-ai-interest-filter" aria-label="관심사 필터">
            {profileFilterOptions.interests.length ? profileFilterOptions.interests.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className={selectedInterestFilters.includes(tag) ? "is-active" : ""}
                onClick={() => toggleInterestFilter(tag)}
              >
                <span>{tag}</span>
                <small>{count}</small>
              </button>
            )) : <p className="admin-console-hint">필터로 사용할 관심사가 없습니다.</p>}
          </div>
        </div>
        <div className="admin-ai-profile-grid">
          {filteredProfiles.length === 0 && <p className="admin-console-hint">표시할 AI 프로필이 없습니다.</p>}
          {filteredProfiles.map((profile) => {
            const meta = parseProfileMeta(profile.intro);
            const isDeletedProfile = profile.status !== "ACTIVE";
            const isProfileExpanded = expandedProfileIds.includes(profile.id);
            const visibleTags = meta.tags.slice(0, 3);
            const hiddenTagCount = Math.max(meta.tags.length - visibleTags.length, 0);
            return (
              <article key={profile.id} className={`admin-ai-profile-card${isDeletedProfile ? " is-deleted" : ""}`}>
                <div className="admin-ai-profile-card__head">
                  <AvatarThumb imageUrl={getProfileImageUrl(profile)} name={profile.nickname} />
                  <div>
                    <strong>{profile.nickname}</strong>
                    <span>{profile.gender} {meta.mbti ? `· ${meta.mbti}` : ""}</span>
                  </div>
                  <em className={profile.status === "ACTIVE" ? "is-active" : ""}>{getProfileStatusLabel(profile.status)}</em>
                </div>
                <div className="admin-ai-profile-card__compact-tags" aria-label="관심사">
                  {visibleTags.length ? visibleTags.map((tag) => <span key={`${profile.id}-compact-${tag}`}>{tag}</span>) : <span>관심사 없음</span>}
                  {hiddenTagCount ? <span>+{hiddenTagCount}</span> : null}
                </div>
                <div className="admin-ai-profile-card__stats">
                  <span>받은 {profile.receivedCount}</span>
                  <span>보낸 {profile.sentCount}</span>
                  <span>대기 {profile.pendingReceivedCount}</span>
                  <span>성사 {profile.matchedCount}</span>
                </div>
                <a className="admin-ai-profile-card__phone" href={profile.phoneNumber ? `tel:${profile.phoneNumber}` : undefined}>
                  {profile.phoneNumber || "전화번호 없음"}
                </a>
                <div className="admin-ai-profile-card__actions">
                  <button
                    type="button"
                    className="admin-ai-detail-toggle"
                    onClick={() => toggleExpandedProfile(profile.id)}
                  >
                    {isProfileExpanded ? "상세 접기" : "상세 보기"}
                  </button>
                  <button
                    type="button"
                    className="admin-ai-danger-action"
                    onClick={() => handleAdminDeleteProfile(profile.id, profile.nickname)}
                    disabled={profile.status !== "ACTIVE" || deleteBusyId === profile.id}
                  >
                    <IconX className="h-4 w-4" />
                    <span>{profile.status !== "ACTIVE" ? "삭제됨" : deleteBusyId === profile.id ? "삭제 중" : "관리자 삭제"}</span>
                  </button>
                </div>
                {isProfileExpanded ? (
                  <div className="admin-ai-profile-detail">
                    <p>{meta.summary || "소개 없음"}</p>
                    <div className="admin-ai-profile-card__tags">
                      {meta.tags.length ? meta.tags.map((tag) => <span key={`${profile.id}-${tag}`}>{tag}</span>) : <span>태그 없음</span>}
                    </div>
                    <div className="admin-ai-photo-review">
                      <strong>사진 검수</strong>
                      <AdminImageCompare
                        originalImageUrl={profile.originalImageUrl}
                        generatedImageUrl={profile.generatedImageUrl}
                        name={profile.nickname}
                      />
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </article>
      </main>
      </div>
    </section>
  );
}
