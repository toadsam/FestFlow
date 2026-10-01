import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteAdminAiMatchProfile,
  downloadAdminAiMatchCsv,
  resetAdminAiMatchAll,
  resolveAdminAiMatchReport,
  reviewAdminAiMatchPhoto,
  setAdminAiMatchProfileHidden,
  fetchAdminAiMatchOverview,
  loginAdmin,
  purgeAdminAiMatchPhone,
  resolveApiAssetUrl,
  updateAdminAiMatchConnectionStatus,
  updateAdminAiMatchRequestNote,
} from "../api";
import {
  IconClipboard,
  IconEye,
  IconEyeOff,
  IconHeart,
  IconMapPin,
  IconSearch,
  IconShield,
  IconUsers,
  IconX,
} from "../components/UxIcons";
import { clearLogin, getAdminName, isLoggedIn, saveLogin } from "../utils/auth";
import AdminMeetupSchedule, { OUTCOME_LABELS } from "../components/admin/AdminMeetupSchedule";
import { AdminNightSky, AdminSajuCelebrate, AdminSajuHero, AdminSajuSide, pickBriefing } from "../components/admin/AdminSajuShell";
import "../styles/admin-aimatch.css";
import "../styles/admin-aimatch-saju.css";
import "../styles/admin-aimatch-night.css";

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

const RESET_PHRASE = "소개팅 전체 삭제";
const ADMIN_TAB_KEYS = ["matches", "requests", "profiles", "reports", "tools"];

const REPORT_REASON_LABELS = {
  INAPPROPRIATE_PHOTO: "부적절한 사진",
  OFFENSIVE_MESSAGE: "불쾌한 메시지",
  FAKE_PROFILE: "가짜 프로필",
  HARASSMENT: "괴롭힘",
  OTHER: "기타",
};

function formatKoreanDateTime(value) {
  if (!value) return "";
  const [datePart, timePart = ""] = `${value}`.split("T");
  const [, m, d] = datePart.split("-");
  return `${Number(m)}월 ${Number(d)}일 ${timePart.slice(0, 5)}`;
}

/** 매치 카드의 '문자 문구 복사'. 약속이 잡혔으면 시간·대기 장소까지, 아니면 성사 안내만. */
function buildMatchMessage(request, side) {
  const me = side === "requester" ? request.requesterNickname : request.profileNickname;
  const other = side === "requester" ? request.profileNickname : request.requesterNickname;
  const place = side === "requester" ? request.requesterWaitingPlace : request.profileWaitingPlace;
  if (request.meetupAt) {
    return `[아주대 가을축제 사주 소개팅] ${me}님, ${other}님과의 부스 만남이 ${formatKoreanDateTime(request.meetupAt)}에 잡혔어요. 5분 전까지 ${place}에서 기다려 주시면 운영진이 안내해 드려요. 못 오시면 앱에서 약속을 취소해 주세요.`;
  }
  return `[아주대 가을축제 사주 소개팅] ${me}님, ${other}님과 매칭이 성사됐어요! 앱 신청함에서 소개팅 부스 시간을 골라 주세요. 부스는 성호관 앞 총학생회 소개팅 부스예요.`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
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

function displayName(value, fallback) {
  const safeValue = `${value || ""}`.trim();
  return safeValue || fallback;
}

function getRequestDecisionLabel(request) {
  if (request.status === "PENDING") return "상대 응답 대기";
  if (isMatched(request.status)) return "상대가 수락";
  if (request.status === "REJECTED") return "상대가 거절";
  if (request.status === "CANCELED" && request.statusReason === "PROFILE_DELETED") return "삭제로 자동 취소";
  if (request.status === "CANCELED") return "신청자가 취소";
  return getStatusLabel(request.status);
}

function getRequestDecisionTone(request) {
  if (isMatched(request.status)) return "accepted";
  if (request.status === "REJECTED") return "rejected";
  if (request.status === "CANCELED") return "canceled";
  return "pending";
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
  // AvatarThumb 이 작은 판 주소로 바꿔 쓰므로 서버가 준 주소 그대로 넘긴다.
  return profile?.generatedImageUrl || profile?.originalImageUrl || "";
}

function AvatarThumb({ imageUrl, name }) {
  const resolvedUrl = resolveApiAssetUrl(imageUrl || "", 240);
  const initial = `${name || "?"}`.slice(0, 1);
  return (
    <span className="admin-ai-avatar" aria-label={name || "프로필"}>
      {resolvedUrl ? <img src={resolvedUrl} alt="" loading="lazy" decoding="async" /> : <em>{initial}</em>}
    </span>
  );
}

function AdminImageCompare({ originalImageUrl, generatedImageUrl, name }) {
  // 화면에는 줄인 사진을 보여 주고, 눌러서 새 창으로 열 때만 원본을 받는다.
  const originalUrl = resolveApiAssetUrl(originalImageUrl || "");
  const generatedUrl = resolveApiAssetUrl(generatedImageUrl || "");
  const originalThumb = resolveApiAssetUrl(originalImageUrl || "", 480);
  const generatedThumb = resolveApiAssetUrl(generatedImageUrl || "", 480);
  if (!originalUrl && !generatedUrl) return null;
  const label = name || "프로필";

  return (
    <div className="admin-ai-image-compare">
      <a href={originalUrl || generatedUrl} target="_blank" rel="noreferrer" title={`${label} 원본 사진`}>
        {originalUrl ? <img src={originalThumb} alt={`${label} 원본 사진`} loading="lazy" decoding="async" /> : <span>원본 없음</span>}
        <em>원본 사진</em>
      </a>
      <a href={generatedUrl || originalUrl} target="_blank" rel="noreferrer" title={`${label} AI 변환 사진`}>
        {generatedUrl ? <img src={generatedThumb} alt={`${label} AI 변환 사진`} loading="lazy" decoding="async" /> : <span>AI 없음</span>}
        <em>AI 사진</em>
      </a>
    </div>
  );
}

export default function AiMatchAdminPage() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [adminName, setAdminName] = useState(getAdminName());
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
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
  const [purgePhoneNumber, setPurgePhoneNumber] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  // 화면을 넷으로 나눈다: 성사·연락 / 신청 기록 / 사람들 / 통계·도구
  const [adminTab, setAdminTab] = useState("matches");
  const [reportBusyId, setReportBusyId] = useState(null);
  const [reviewBusyId, setReviewBusyId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const overviewRefreshInFlightRef = useRef(false);
  const completePulseTimerRef = useRef(null);
  const matchedCountRef = useRef(null);
  const [celebrate, setCelebrate] = useState(0);

  const profiles = Array.isArray(overview?.profiles) ? overview.profiles : [];
  const requests = Array.isArray(overview?.requests) ? overview.requests : [];
  const reports = Array.isArray(overview?.reports) ? overview.reports : [];
  const openReports = reports.filter((report) => report.status === "OPEN");
  // 사진 검수 대기열: 활성이고 아직 검수 안 한 사람, 가입 순서대로
  const photoQueue = profiles
    .filter((profile) => profile.status === "ACTIVE" && (profile.photoReview || "PENDING") === "PENDING")
    .sort((a, b) => `${a.createdAt || ""}`.localeCompare(`${b.createdAt || ""}`));
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
        request.statusReason,
        getStatusLabel(request.status),
        getRequestDecisionLabel(request),
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

  // 화면을 켜 둔 사이 성사된 매치가 늘면 낙관 도장 알림을 띄운다(처음 불러올 때는 띄우지 않는다).
  useEffect(() => {
    if (!overview) {
      matchedCountRef.current = null;
      return;
    }
    const previous = matchedCountRef.current;
    matchedCountRef.current = matchedRequests.length;
    if (previous !== null && matchedRequests.length > previous) {
      setCelebrate(matchedRequests.length - previous);
    }
  }, [overview, matchedRequests.length]);

  // 숫자 1~5 로 탭 이동, R 로 새로고침. 입력 칸에 글을 쓰는 중에는 건드리지 않는다.
  useEffect(() => {
    if (!loggedIn) return undefined;
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < ADMIN_TAB_KEYS.length) setAdminTab(ADMIN_TAB_KEYS[index]);
      if (event.key === "r" || event.key === "R") loadOverview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return undefined;

    const refreshSilently = () => {
      if (document.visibilityState === "hidden") return;
      loadOverview({ silent: true });
    };
    // 전체 프로필 · 신청을 통째로 읽는 요청이라 5초마다로 둔다(예전 2초). 탭을 다시 보면 바로 한 번 부른다.
    const intervalId = window.setInterval(refreshSilently, 5000);
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

  async function handlePhonePurge(event) {
    event.preventDefault();
    const phoneNumber = purgePhoneNumber.trim();
    if (!phoneNumber) {
      setMessage("완전 삭제할 전화번호를 입력해 주세요.");
      return;
    }
    const ok = window.confirm(
      `${phoneNumber} 번호의 AI 소개팅 기록을 완전히 삭제할까요?\n프로필, 신청, 좋아요, AI 사진 변환 횟수 기록, 업로드 이미지 파일이 삭제되며 같은 번호로 다시 가입할 수 있습니다.`,
    );
    if (!ok) return;

    setPurgeBusy(true);
    setMessage("전화번호 기록을 완전 삭제하는 중입니다.");
    try {
      const result = await purgeAdminAiMatchPhone(phoneNumber);
      setPurgePhoneNumber("");
      await loadOverview({ force: true });
      const deletedTotal =
        result.deletedProfileCount +
        result.deletedRequestCount +
        result.deletedFavoriteCount +
        result.deletedPhoneUsageCount +
        result.deletedImageFileCount;
      if (deletedTotal === 0) {
        const emptyMessage = `${phoneNumber} 번호의 삭제할 기록이 없습니다.`;
        window.alert(emptyMessage);
        setMessage(emptyMessage);
        return;
      }
      const successMessage = `${phoneNumber} 번호를 삭제했습니다.\n프로필 ${result.deletedProfileCount}개, 신청 ${result.deletedRequestCount}개, 좋아요 ${result.deletedFavoriteCount}개, 전화번호 기록 ${result.deletedPhoneUsageCount}개, 이미지 파일 ${result.deletedImageFileCount}개 삭제${result.failedImageFileDeleteCount ? `, 이미지 파일 ${result.failedImageFileDeleteCount}개 실패` : ""}`;
      window.alert(successMessage);
      setMessage(successMessage.replaceAll("\n", " "));
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setPurgeBusy(false);
    }
  }

  function patchProfile(updated) {
    setOverview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        profiles: prev.profiles.map((profile) => (
          profile.id === updated.id
            ? { ...profile, hidden: updated.hidden, hiddenReason: updated.hiddenReason, photoReview: updated.photoReview, openReportCount: updated.openReportCount, status: updated.status }
            : profile
        )),
      };
    });
  }

  async function handleToggleHidden(profile) {
    const nextHidden = !profile.hidden;
    const reason = nextHidden ? window.prompt(`${profile.nickname}님을 목록에서 숨깁니다. 이유(선택)`, "") : "";
    if (nextHidden && reason === null) return;
    try {
      const updated = await setAdminAiMatchProfileHidden(profile.id, nextHidden, reason || "");
      patchProfile(updated);
      setMessage(nextHidden ? `${profile.nickname}님을 목록에서 숨겼습니다.` : `${profile.nickname}님이 다시 목록에 보입니다.`);
    } catch (error) {
      setMessage(adminErrorMessage(error));
    }
  }

  async function handleReviewPhoto(profile, decision) {
    setReviewBusyId(profile.id);
    try {
      const updated = await reviewAdminAiMatchPhoto(profile.id, decision, decision === "REJECTED" ? rejectReason : "");
      patchProfile(updated);
      setRejectReason("");
      setMessage(decision === "APPROVED" ? `${profile.nickname}님 사진을 승인했습니다.` : `${profile.nickname}님 사진을 반려하고 목록에서 숨겼습니다.`);
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setReviewBusyId(null);
    }
  }

  async function handleResolveReport(report, action) {
    const note = action === "DISMISS" ? "" : window.prompt(action === "HIDE" ? "숨김 사유(선택)" : "삭제 사유(선택)", "");
    if (note === null) return;
    if (action === "DELETE" && !window.confirm(`${report.targetNickname}님 프로필을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setReportBusyId(report.id);
    try {
      await resolveAdminAiMatchReport(report.id, action, note || "");
      await loadOverview({ silent: true, force: true });
      setMessage("신고를 처리했습니다.");
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setReportBusyId(null);
    }
  }

  async function handleCopyMessage(request, side) {
    const ok = await copyText(buildMatchMessage(request, side));
    const key = `${request.id}-${side}`;
    setCopiedKey(ok ? key : "");
    setMessage(ok ? "문자 문구를 복사했어요. 문자 앱에 붙여 넣으세요." : "복사하지 못했어요.");
    window.setTimeout(() => setCopiedKey((current) => (current === key ? "" : current)), 2000);
  }

  async function handleDownloadCsv(statsOnly = false) {
    try {
      await downloadAdminAiMatchCsv({ statsOnly });
      setMessage(statsOnly ? "통계 CSV를 내려받았습니다. 닉네임·메모 없이 숫자만 들어 있어요." : "운영 보고 CSV를 내려받았습니다.");
    } catch (error) {
      setMessage(adminErrorMessage(error));
    }
  }

  async function handleResetAll(event) {
    event.preventDefault();
    if (resetPhrase.trim() !== RESET_PHRASE) return;
    const ok = window.confirm(
      "소개팅 데이터를 전부 지울까요?\n모든 계정, 신청, 찜, 약속 시간, 신고, 전화번호 기록, 업로드 사진 파일이 삭제되고 되돌릴 수 없습니다.\n통계 CSV를 먼저 내려받았는지 확인해 주세요.",
    );
    if (!ok) return;
    setResetBusy(true);
    setMessage("소개팅 데이터를 전부 지우는 중입니다.");
    try {
      const result = await resetAdminAiMatchAll(resetPhrase.trim());
      setResetPhrase("");
      await loadOverview({ force: true });
      const done = `전체 삭제 완료\n계정 ${result.profiles}개, 신청 ${result.requests}개, 찜 ${result.favorites}개, 약속 시간 ${result.meetupSlots}개, 신고 ${result.reports}개, 전화번호 기록 ${result.phoneUsages}개, 사진 파일 ${result.deletedImageFiles}개${result.failedImageFiles ? ` (사진 ${result.failedImageFiles}개 실패)` : ""}`;
      window.alert(done);
      setMessage(done.replace("\n", " · "));
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setResetBusy(false);
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

  const adminTabs = [
    ["matches", "성사·연락", matchedRequests.length],
    ["requests", "신청 기록", requests.length],
    ["profiles", "사람들", profiles.length],
    ["reports", "신고·검수", openReports.length + photoQueue.length],
    ["tools", "통계·도구", null],
  ];
  const briefing = pickBriefing({
    waiting: waitingConnectionCount,
    photos: photoQueue.length,
    reports: openReports.length,
    pending: pendingRequests.length,
    matched: matchedRequests.length,
  });
  const kpis = [
    { key: "profile", tab: "profiles", icon: IconUsers, label: "활성 프로필", value: overview?.activeProfileCount ?? 0, note: `전체 ${overview?.totalProfileCount ?? 0}명`, hanja: "人" },
    { key: "request", tab: "requests", icon: IconClipboard, label: "전체 신청", value: overview?.totalRequestCount ?? 0, note: "누적 신청", hanja: "請" },
    { key: "pending", tab: "requests", icon: IconShield, label: "대기중", value: pendingRequests.length, note: "상대 응답 대기", hanja: "待" },
    { key: "matched", tab: "matches", icon: IconHeart, label: "성사된 매치", value: matchedRequests.length, note: waitingConnectionCount ? `${waitingConnectionCount}쌍 연결 대기` : "모두 연결됨", hanja: "緣" },
  ];

  if (!loggedIn) {
    return (
      <section className="auth-entry-screen ai-match-admin-auth" data-i18n-skip>
        <form className="auth-entry-card" onSubmit={handleLogin}>
          <img className="aas-login__chito" src="/images/saju/chito-dosa.png" alt="" onError={(event) => { event.currentTarget.src = "/images/chito-wave.png"; }} />
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
    <section className="cyber-page admin-console-page ai-match-admin-page aas" data-tab={adminTab} data-i18n-skip>
      <AdminNightSky />
      <AdminSajuSide
        tabs={adminTabs}
        activeTab={adminTab}
        onTab={setAdminTab}
        adminName={adminName}
        loading={loading}
        onRefresh={() => loadOverview()}
        onLogout={handleLogout}
        briefing={briefing}
      />

      <div className="aas-main">
      <AdminSajuHero adminName={adminName} message={message} loading={loading} kpis={kpis} onTab={setAdminTab} />

      <div className="aas-content" key={adminTab}>
      {adminTab === "matches" ? (
      <>
      <AdminMeetupSchedule onChanged={() => loadOverview({ silent: true, force: true })} />

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
      </>
      ) : null}

      {adminTab === "tools" ? (
      <>
      <section className="admin-ai-stat-panel" aria-label="간단 통계">
        <div className="admin-ai-stat-panel__head">
          <div>
            <span>간단 통계</span>
            <strong>운영 흐름 요약</strong>
          </div>
          <em>성사율 {adminStats.matchedRate}%</em>
        </div>
        <div className="aa-csv-row">
          <button type="button" className="aa-csv" onClick={() => handleDownloadCsv(false)}>
            운영 보고 CSV 내려받기
          </button>
          <button type="button" className="aa-csv aa-csv--stats" onClick={() => handleDownloadCsv(true)}>
            통계만 CSV (개인정보 없음)
          </button>
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

      <section className="admin-ai-phone-purge-card" aria-label="AI 소개팅 전화번호 완전 삭제">
        <div>
          <span>위험 작업</span>
          <strong>전화번호 완전 삭제</strong>
          <p>입력한 전화번호의 프로필, 신청 기록, 좋아요, AI 사진 변환 횟수 기록과 업로드 이미지 파일을 삭제합니다. 삭제 후 같은 번호로 다시 회원가입하고 AI 변환을 사용할 수 있습니다.</p>
        </div>
        <form onSubmit={handlePhonePurge}>
          <input
            value={purgePhoneNumber}
            onChange={(event) => setPurgePhoneNumber(event.target.value)}
            placeholder="010-1234-5678"
            inputMode="tel"
            disabled={purgeBusy}
          />
          <button type="submit" disabled={purgeBusy || !purgePhoneNumber.trim()}>
            {purgeBusy ? "삭제 중" : "완전 삭제"}
          </button>
        </form>
      </section>

      <section className="admin-ai-phone-purge-card aa-reset" aria-label="소개팅 데이터 전체 삭제">
        <div>
          <span>위험 작업 · 되돌릴 수 없음</span>
          <strong>소개팅 데이터 전체 삭제</strong>
          <p>
            지난 운영의 모든 계정·신청·찜·약속 시간·신고·전화번호 기록과 업로드 사진 파일을 지웁니다. 먼저 위의 <b>통계만 CSV</b>를 내려받아 두세요.
            아래 칸에 <b>{RESET_PHRASE}</b> 를 그대로 입력해야 버튼이 켜집니다.
          </p>
        </div>
        <form onSubmit={handleResetAll}>
          <input
            value={resetPhrase}
            onChange={(event) => setResetPhrase(event.target.value)}
            placeholder={RESET_PHRASE}
            disabled={resetBusy}
            aria-label="확인 문구"
          />
          <button type="submit" disabled={resetBusy || resetPhrase.trim() !== RESET_PHRASE}>
            {resetBusy ? "삭제 중" : "전체 삭제"}
          </button>
        </form>
      </section>
      </>
      ) : null}

      <div className="admin-ai-dashboard-grid">
      {adminTab === "matches" ? (
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
                "admin-ai-match-card aa-match",
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
              <div className="aa-match__main">
                <div className="aa-match__pair" aria-hidden="true">
                  <AvatarThumb imageUrl={request.requesterImageUrl} name={request.requesterNickname} />
                  <AvatarThumb imageUrl={request.profileImageUrl} name={request.profileNickname} />
                </div>
                <div className="aa-match__id">
                  <strong>
                    {request.requesterNickname}
                    <i>→</i>
                    {request.profileNickname}
                  </strong>
                  <span>
                    {request.createdAt?.replace("T", " ").slice(5, 16) || "시간 없음"}
                    {" · "}
                    {request.meetPlace || "장소 미지정"}
                  </span>
                </div>
                <em className={`aa-match__state is-${connectionStatus.toLowerCase()}`}>
                  {request.meetupOutcome ? OUTCOME_LABELS[request.meetupOutcome] || request.meetupOutcome : getConnectionStatusLabel(connectionStatus)}
                </em>
              </div>
              {request.meetupAt ? (
                <p className="aa-match__meetup">
                  부스 약속 {formatKoreanDateTime(request.meetupAt)} · {request.requesterNickname} {request.requesterWaitingPlace} / {request.profileNickname} {request.profileWaitingPlace}
                </p>
              ) : null}
              <div className="aa-match__copy">
                <button type="button" className={copiedKey === `${request.id}-requester` ? "is-done" : ""} onClick={() => handleCopyMessage(request, "requester")}>
                  {copiedKey === `${request.id}-requester` ? "복사됨" : `${request.requesterNickname} 문자 문구`}
                </button>
                <button type="button" className={copiedKey === `${request.id}-profile` ? "is-done" : ""} onClick={() => handleCopyMessage(request, "profile")}>
                  {copiedKey === `${request.id}-profile` ? "복사됨" : `${request.profileNickname} 문자 문구`}
                </button>
              </div>
              <div className="aa-match__foot">
                <div className="aa-match__phones">
                  <a className={request.requesterPhoneNumber ? "" : "is-none"} href={request.requesterPhoneNumber ? `tel:${request.requesterPhoneNumber}` : undefined}>
                    <small>신청자</small>
                    {request.requesterPhoneNumber || "번호 없음"}
                  </a>
                  <a className={request.profilePhoneNumber ? "" : "is-none"} href={request.profilePhoneNumber ? `tel:${request.profilePhoneNumber}` : undefined}>
                    <small>상대</small>
                    {request.profilePhoneNumber || "번호 없음"}
                  </a>
                </div>
                <button
                  type="button"
                  className={`aa-person__more${isMatchExpanded ? " is-open" : ""}`}
                  onClick={() => toggleExpandedMatch(request.id)}
                  aria-expanded={isMatchExpanded}
                >
                  {isMatchExpanded ? "접기" : "상세"}
                </button>
              </div>
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
      </aside>
      ) : null}

      {adminTab === "requests" ? (
      <aside className="admin-ai-dashboard-side">
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
          {filteredRequests.map((request) => {
            const requesterName = displayName(request.requesterNickname, "삭제된 신청자");
            const profileName = displayName(request.profileNickname, "삭제된 상대");
            const decisionTone = getRequestDecisionTone(request);
            const decisionLabel = getRequestDecisionLabel(request);
            return (
              <div key={request.id} className={`admin-ai-request-row is-${decisionTone}`}>
                <div className="admin-ai-request-row__people">
                  <div className="admin-ai-request-person">
                    <AvatarThumb imageUrl={request.requesterImageUrl} name={requesterName} />
                    <div>
                      <small>신청자</small>
                      <strong>{requesterName}</strong>
                      <em>{request.requesterPhoneNumber || "전화번호 없음"}</em>
                    </div>
                  </div>
                  <span className="admin-ai-request-arrow" aria-hidden="true">→</span>
                  <div className="admin-ai-request-person">
                    <AvatarThumb imageUrl={request.profileImageUrl} name={profileName} />
                    <div>
                      <small>받은 사람</small>
                      <strong>{profileName}</strong>
                      <em>{request.profilePhoneNumber || "전화번호 없음"}</em>
                    </div>
                  </div>
                </div>
                <div className="admin-ai-request-row__meta">
                  <span className={`admin-ai-request-state is-${decisionTone}`}>{decisionLabel}</span>
                  <span>{getStatusLabel(request.status)}</span>
                  {isMatched(request.status) ? <span>{getConnectionStatusLabel(request.connectionStatus || "WAITING")}</span> : null}
                  {request.adminNote ? <span>메모 있음</span> : null}
                  <small>신청 {request.createdAt?.replace("T", " ").slice(5, 16) || "-"}</small>
                  <small>변경 {request.updatedAt?.replace("T", " ").slice(5, 16) || "-"}</small>
                </div>
                <div className="admin-ai-request-row__message">
                  <span>{request.meetPlace || "장소 없음"}</span>
                  <p>{request.message || "메시지 없음"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </article>
      </aside>
      ) : null}

      {adminTab === "reports" ? (
      <main className="admin-ai-dashboard-main">
      <article className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>참가자 신고</span>
            <h3>신고 접수함</h3>
          </div>
          <strong>{openReports.length}건 대기</strong>
        </div>
        {reports.length === 0 ? <p className="admin-console-hint">접수된 신고가 없습니다.</p> : null}
        <div className="aa-reports">
          {reports.map((report) => {
            const open = report.status === "OPEN";
            const target = profiles.find((profile) => profile.id === report.targetProfileId);
            return (
              <article key={report.id} className={`aa-report${open ? "" : " is-closed"}`}>
                <div className="aa-report__main">
                  {target ? <AvatarThumb imageUrl={getProfileImageUrl(target)} name={target.nickname} /> : <span className="aa-report__blank" />}
                  <div className="aa-report__id">
                    <strong>
                      {report.targetNickname}
                      <i>{REPORT_REASON_LABELS[report.reason] || report.reason}</i>
                    </strong>
                    <span>
                      {report.reporterNickname}님 신고 · {report.createdAt?.replace("T", " ").slice(5, 16)}
                      {target?.hidden ? " · 현재 숨김" : ""}
                    </span>
                    {report.detail ? <p>{report.detail}</p> : null}
                    {!open ? <small>처리됨 · {report.resolution || "-"} · {report.resolvedAt?.replace("T", " ").slice(5, 16)}</small> : null}
                  </div>
                </div>
                {open ? (
                  <div className="aa-report__actions">
                    <button type="button" disabled={reportBusyId === report.id} onClick={() => handleResolveReport(report, "DISMISS")}>문제 없음</button>
                    <button type="button" className="is-warn" disabled={reportBusyId === report.id || !target || target.hidden} onClick={() => handleResolveReport(report, "HIDE")}>숨기기</button>
                    <button type="button" className="is-danger" disabled={reportBusyId === report.id || !target || target.status !== "ACTIVE"} onClick={() => handleResolveReport(report, "DELETE")}>삭제</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </article>

      <article className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>새 가입자 사진</span>
            <h3>사진 검수</h3>
          </div>
          <strong>{photoQueue.length}명 대기</strong>
        </div>
        {photoQueue.length === 0 ? (
          <p className="admin-console-hint">검수할 사진이 없습니다. 새로 가입하면 여기에 쌓여요.</p>
        ) : (
          (() => {
            const profile = photoQueue[0];
            const meta = parseProfileMeta(profile.intro);
            return (
              <div className="aa-review">
                <div className="aa-review__who">
                  <strong>{profile.nickname}</strong>
                  <span>
                    {profile.gender}
                    {meta.mbti ? ` · ${meta.mbti}` : ""} · 가입 {profile.createdAt?.replace("T", " ").slice(5, 16)}
                  </span>
                  {meta.summary ? <p>{meta.summary}</p> : null}
                </div>
                <AdminImageCompare
                  originalImageUrl={profile.originalImageUrl}
                  generatedImageUrl={profile.generatedImageUrl}
                  name={profile.nickname}
                />
                <div className="aa-review__actions">
                  <button type="button" className="is-ok" disabled={reviewBusyId === profile.id} onClick={() => handleReviewPhoto(profile, "APPROVED")}>
                    승인 · 다음
                  </button>
                  <div className="aa-review__reject">
                    <input
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="반려 사유 (예: 얼굴이 안 보여요)"
                      maxLength={150}
                    />
                    <button type="button" className="is-danger" disabled={reviewBusyId === profile.id} onClick={() => handleReviewPhoto(profile, "REJECTED")}>
                      반려 · 숨김
                    </button>
                  </div>
                </div>
                <small className="aa-review__hint">반려하면 목록에서 바로 사라지고, 사람들 탭에서 다시 보이기로 되돌릴 수 있어요. 남은 {photoQueue.length - 1}명.</small>
              </div>
            );
          })()
        )}
      </article>
      </main>
      ) : null}

      {adminTab === "profiles" ? (
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
              <article key={profile.id} className={`admin-ai-profile-card aa-person${isDeletedProfile ? " is-deleted" : ""}`}>
                <div className="aa-person__main">
                  <AvatarThumb imageUrl={getProfileImageUrl(profile)} name={profile.nickname} />
                  <div className="aa-person__id">
                    <strong>
                      {profile.nickname}
                      <i className={`aa-person__dot${profile.status === "ACTIVE" ? " is-active" : ""}`} title={getProfileStatusLabel(profile.status)} />
                    </strong>
                    <span>
                      {profile.hidden ? <i className="aa-person__flag aa-person__flag--hidden">숨김</i> : null}
                      {(profile.photoReview || "PENDING") === "PENDING" && profile.status === "ACTIVE" ? <i className="aa-person__flag">검수 전</i> : null}
                      {profile.openReportCount ? <i className="aa-person__flag aa-person__flag--report">신고 {profile.openReportCount}</i> : null}
                      {profile.gender}
                      {meta.mbti ? ` · ${meta.mbti}` : ""}
                      {visibleTags.length ? ` · ${visibleTags.join(" · ")}` : ""}
                      {hiddenTagCount ? ` +${hiddenTagCount}` : ""}
                    </span>
                  </div>
                  <a className="aa-person__phone" href={profile.phoneNumber ? `tel:${profile.phoneNumber}` : undefined}>
                    {profile.phoneNumber || "번호 없음"}
                  </a>
                </div>
                <div className="aa-person__foot">
                  <ul className="aa-person__stats" aria-label="신청 현황">
                    <li><b>{profile.receivedCount}</b>받은</li>
                    <li><b>{profile.sentCount}</b>보낸</li>
                    <li className={profile.pendingReceivedCount ? "is-hot" : ""}><b>{profile.pendingReceivedCount}</b>대기</li>
                    <li className={profile.matchedCount ? "is-good" : ""}><b>{profile.matchedCount}</b>성사</li>
                  </ul>
                  <div className="aa-person__actions">
                    <button
                      type="button"
                      className={`aa-person__hide${profile.hidden ? " is-on" : ""}`}
                      onClick={() => handleToggleHidden(profile)}
                      disabled={profile.status !== "ACTIVE"}
                      title={profile.hidden ? `숨김 중${profile.hiddenReason ? ` · ${profile.hiddenReason}` : ""} · 누르면 다시 보임` : "목록에서 숨기기"}
                    >
                      {profile.hidden ? "보이기" : "숨기기"}
                    </button>
                    <button
                      type="button"
                      className={`aa-person__more${isProfileExpanded ? " is-open" : ""}`}
                      onClick={() => toggleExpandedProfile(profile.id)}
                      aria-expanded={isProfileExpanded}
                    >
                      {isProfileExpanded ? "접기" : "상세"}
                    </button>
                    <button
                      type="button"
                      className="aa-person__delete"
                      onClick={() => handleAdminDeleteProfile(profile.id, profile.nickname)}
                      disabled={profile.status !== "ACTIVE" || deleteBusyId === profile.id}
                      aria-label={profile.status !== "ACTIVE" ? "삭제됨" : "관리자 삭제"}
                      title={profile.status !== "ACTIVE" ? "삭제됨" : deleteBusyId === profile.id ? "삭제 중" : "관리자 삭제"}
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  </div>
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
      ) : null}
      </div>
      </div>
      </div>

      {celebrate ? <AdminSajuCelebrate count={celebrate} onDone={() => setCelebrate(0)} /> : null}
    </section>
  );
}
