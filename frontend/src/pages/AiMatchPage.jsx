import { useEffect, useRef, useState } from "react";
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
  IconSearch,
  IconSend,
  IconSettings,
  IconShield,
  IconSparkles,
  IconUsers,
  IconX,
} from "../components/UxIcons";
import {
  acceptAiMatchRequest,
  accessAiMatchProfile,
  cancelAiMatchRequest,
  checkAiMatchPhoneNumber,
  confirmAiMatchMeetup,
  createAiMatchImagePreview,
  deleteAiMatchProfile,
  createAiMatchProfile,
  createAiMatchRequest,
  proposeAiMatchMeetup,
  rejectAiMatchRequest,
  resolveApiAssetUrl,
  toggleAiMatchFavorite,
  updateAiMatchProfile,
} from "../api";

const MEET_PLACES = ["총학생회 부스"];
const MEET_PLACE_MAP_TARGET = {
  label: "총학생회 부스",
  lat: 37.2828,
  lng: 127.0444,
};
const SCREEN_COPY = {
  intro: "AI 소개팅 부스",
  register: "프로필 등록하기",
  people: "등록된 사람들",
  requests: "데이트 신청 현황",
  my: "MY",
};
const NAV_ITEMS = [
  { id: "intro", label: "처음", icon: IconHome },
  { id: "requests", label: "신청함", icon: IconClipboard },
  { id: "my", label: "MY", icon: IconSettings },
];
const PROFILE_FILTERS = ["전체", "남자", "여자", "신청 가능", "좋아요"];
const REGISTRATION_TAGS = ["운동", "음악", "영화", "여행", "맛집", "독서", "게임", "보드게임", "사진", "공연", "기타"];
const MBTI_OPTIONS = [
  "ISTJ",
  "ISFJ",
  "INFJ",
  "INTJ",
  "ISTP",
  "ISFP",
  "INFP",
  "INTP",
  "ESTP",
  "ESFP",
  "ENFP",
  "ENTP",
  "ESTJ",
  "ESFJ",
  "ENFJ",
  "ENTJ",
];
const STEP_ITEMS = [
  { number: "01", title: "전화번호 확인", copy: "관리자 조율용으로만 써요" },
  { number: "02", title: "AI 변환", copy: "성공 기준 최대 2회예요" },
  { number: "03", title: "소개 등록", copy: "프로필을 완성해요" },
];

const ACTIVE_FILTER_TAG_STYLE = {
  borderColor: "#d8b4fe",
  background: "linear-gradient(180deg, rgba(253, 244, 255, 0.98), rgba(250, 245, 255, 0.96))",
  color: "#64748b",
  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.92), 0 10px 22px rgba(216, 180, 254, 0.22)",
  filter: "none",
};
const PIN_INPUT_PATTERN = /^\d{0,6}$/;
const PHONE_INPUT_PATTERN = /^[0-9+()\-\s]{0,30}$/;
const REQUEST_STATUS_LABELS = {
  PENDING: "대기중",
  ACCEPTED: "매치 성사",
  PROPOSED: "약속 제안",
  CONFIRMED: "약속 확정",
  REJECTED: "거절",
  CANCELED: "취소됨",
};
const PROFILE_DELETED_STATUS_REASON = "PROFILE_DELETED";
const RECEIVED_NOTICE_STATUSES = new Set(["PENDING", "CANCELED"]);
const SENT_NOTICE_STATUSES = new Set(["ACCEPTED", "REJECTED", "PROPOSED", "CONFIRMED"]);
const ACCESS_SESSION_STORAGE_KEY = "ai-match-access-session";
const RESTORABLE_ACCESS_SCREENS = new Set(["intro", "requests", "my"]);

function cleanTagValue(tag) {
  return `${tag || ""}`.replace(/^#/, "").trim().slice(0, 8);
}

function cleanMbtiValue(mbti) {
  const normalized = `${mbti || ""}`.trim().toUpperCase();
  return MBTI_OPTIONS.includes(normalized) ? normalized : "";
}

function getPhoneNumberKey(phoneNumber) {
  const digits = `${phoneNumber || ""}`.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function parseProfileCopy(rawIntro) {
  const source = `${rawIntro || ""}`.trim();
  if (!source) {
    return {
      summary: "따뜻한 분위기의 축제 메이트를 찾고 있어요.",
      tags: [],
      mbti: "",
    };
  }

  const tags = [];
  const summaryParts = [];
  let mbti = "";

  source.split(/\n+/).forEach((line) => {
    const mbtiMatch = line.match(/\bMBTI\s*:\s*([A-Za-z]{4})\b/i);
    if (!mbti && mbtiMatch) {
      mbti = cleanMbtiValue(mbtiMatch[1]);
    }

    const matches = [...line.matchAll(/#([^\s#]+)/g)].map((match) => cleanTagValue(match[1]));
    if (matches.length) {
      tags.push(...matches);
    }

    const cleanedLine = line
      .replace(/\bMBTI\s*:\s*[A-Za-z]{4}\b/gi, "")
      .replace(/#([^\s#]+)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanedLine) {
      summaryParts.push(cleanedLine);
    }
  });

  return {
    summary: summaryParts.join(" ").trim() || "따뜻한 분위기의 축제 메이트를 찾고 있어요.",
    tags: [...new Set(tags)].filter(Boolean).slice(0, 6),
    mbti,
  };
}

function serializeProfileCopy(summary, tags, mbti) {
  const cleanSummary = `${summary || ""}`.trim();
  const cleanTags = [...new Set((tags || []).map(cleanTagValue))].filter(Boolean).slice(0, 6);
  const cleanMbti = cleanMbtiValue(mbti);
  const lines = [cleanSummary];
  if (cleanMbti) {
    lines.push(`MBTI: ${cleanMbti}`);
  }
  if (cleanTags.length) {
    lines.push(cleanTags.map((tag) => `#${tag}`).join(" "));
  }
  return lines.filter(Boolean).join("\n");
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
  return "여자";
}

function getProfileTone(gender) {
  if (gender === "남성") return "blue";
  return "pink";
}

function getFilterTone(filter) {
  if (filter === "남자") return "blue";
  if (filter === "여자") return "pink";
  if (filter === "신청 가능") return "green";
  if (filter === "좋아요") return "pink";
  return "violet";
}

function getGenderButtonTone(gender) {
  if (gender === "남성") return "blue";
  return "pink";
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

function isProfileDeletedRequest(request) {
  return request?.status === "CANCELED" && request?.statusReason === PROFILE_DELETED_STATUS_REASON;
}

function getRequestStatusLabel(status, statusReason = "") {
  if (status === "CANCELED" && statusReason === PROFILE_DELETED_STATUS_REASON) {
    return "상대 계정 삭제";
  }
  return REQUEST_STATUS_LABELS[status] || status || "대기중";
}

function getRequestStatusTone(status, statusReason = "") {
  if (status === "CANCELED" && statusReason === PROFILE_DELETED_STATUS_REASON) return "danger";
  if (status === "ACCEPTED") return "success";
  if (status === "CONFIRMED") return "success";
  if (status === "PROPOSED") return "pending";
  if (status === "REJECTED") return "danger";
  if (status === "CANCELED") return "muted";
  return "pending";
}

function canSendRequest(status) {
  return !status || status === "REJECTED" || status === "CANCELED";
}

function shouldShowPeopleRequestStatus(status) {
  return Boolean(status && status !== "PENDING" && status !== "CANCELED");
}

function isAccessExpiredError(error) {
  return error?.status === 401 || error?.status === 404;
}

function buildLatestSentRequestMap(sentRequests) {
  return (sentRequests || []).reduce((map, request) => {
    if (!map.has(request.profileId)) {
      map.set(request.profileId, request);
    }
    return map;
  }, new Map());
}

function createRequestSnapshot(receivedRequests = [], sentRequests = []) {
  return {
    received: new Map(
      receivedRequests.map((request) => [
        request.id,
        {
          status: request.status,
          statusReason: request.statusReason,
          nickname: request.requesterNickname,
        },
      ]),
    ),
    sent: new Map(
      sentRequests.map((request) => [
        request.id,
        {
          status: request.status,
          statusReason: request.statusReason,
          nickname: request.profileNickname,
        },
      ]),
    ),
  };
}

function getRequestNoticeKey(type, request) {
  return `${type}:${request.id}:${request.status || "PENDING"}:${request.statusReason || ""}`;
}

function getSentStatusNotice(request) {
  const name = request.profileNickname || "상대";
  if (isProfileDeletedRequest(request)) return "상대가 계정을 삭제했습니다.";
  if (request.status === "ACCEPTED") return `${name}님이 데이트 신청을 수락했어요.`;
  if (request.status === "REJECTED") return `${name}님이 데이트 신청을 거절했어요.`;
  if (request.status === "PROPOSED") return `${name}님과의 만남이 관리자 조율 중이에요.`;
  if (request.status === "CONFIRMED") return `${name}님과의 만남 안내가 확정됐어요.`;
  if (request.status === "CANCELED") return `${name}님에게 보낸 신청이 취소됐어요.`;
  return `${name}님과의 신청 상태가 ${getRequestStatusLabel(request.status, request.statusReason)}(으)로 바뀌었어요.`;
}

function getReceivedStatusNotice(request) {
  const name = request.requesterNickname || "상대";
  if (isProfileDeletedRequest(request)) return "상대가 계정을 삭제했습니다.";
  if (request.status === "CANCELED") return `${name}님이 데이트 신청을 취소했어요.`;
  return `${name}님의 신청 상태가 ${getRequestStatusLabel(request.status, request.statusReason)}(으)로 바뀌었어요.`;
}

function buildCurrentRequestNotices(nextReceivedRequests, nextSentRequests) {
  return [
    ...nextReceivedRequests
      .filter((request) => RECEIVED_NOTICE_STATUSES.has(request.status || "PENDING"))
      .map((request) => ({
        key: getRequestNoticeKey("received", request),
        tab: "received",
        title: isProfileDeletedRequest(request) ? "상대 계정 삭제" : request.status === "CANCELED" ? "신청 취소됨" : "새 데이트 신청",
        message:
          request.status === "CANCELED"
            ? getReceivedStatusNotice(request)
            : `${request.requesterNickname || "상대"}님이 데이트 신청을 보냈어요.`,
      })),
    ...nextSentRequests
      .filter((request) => SENT_NOTICE_STATUSES.has(request.status))
      .map((request) => ({
        key: getRequestNoticeKey("sent", request),
        tab: "sent",
        title: "신청 응답 도착",
        message: getSentStatusNotice(request),
      })),
  ];
}

function collectRequestNotifications(previousSnapshot, nextReceivedRequests, nextSentRequests) {
  if (!previousSnapshot) return [];

  const notices = [];
  nextReceivedRequests.forEach((request) => {
    const previous = previousSnapshot.received.get(request.id);
    if (!previous) {
      notices.push({
        key: getRequestNoticeKey("received", request),
        tab: "received",
        title: "새 데이트 신청",
        message: `${request.requesterNickname || "누군가"}님이 데이트 신청을 보냈어요.`,
      });
      return;
    }
    if (previous.status !== request.status || previous.statusReason !== request.statusReason) {
      notices.push({
        key: getRequestNoticeKey("received", request),
        tab: "received",
        title: isProfileDeletedRequest(request) ? "상대 계정 삭제" : request.status === "CANCELED" ? "신청 취소됨" : "신청 상태 변경",
        message: getReceivedStatusNotice(request),
      });
    }
  });

  nextSentRequests.forEach((request) => {
    const previous = previousSnapshot.sent.get(request.id);
    if (previous && (previous.status !== request.status || previous.statusReason !== request.statusReason)) {
      notices.push({
        key: getRequestNoticeKey("sent", request),
        tab: "sent",
        title: "신청 응답 도착",
        message: getSentStatusNotice(request),
      });
    }
  });

  return notices;
}

function collectLoginNotifications(nextReceivedRequests, nextSentRequests) {
  return buildCurrentRequestNotices(nextReceivedRequests, nextSentRequests);
}

function readNoticeKeySet(storageKey, field) {
  if (typeof window === "undefined" || !storageKey) return new Set();
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    return new Set(Array.isArray(saved[field]) ? saved[field] : []);
  } catch {
    return new Set();
  }
}

function writeNoticeKeySets(storageKey, shownKeys, seenKeys) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        shown: [...shownKeys],
        seen: [...seenKeys],
      }),
    );
  } catch {
    // Notification memory is best-effort; app behavior should not fail when storage is blocked.
  }
}

function getRestorableAccessScreen(screen) {
  return RESTORABLE_ACCESS_SCREENS.has(screen) ? screen : "intro";
}

function readAccessSession() {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(ACCESS_SESSION_STORAGE_KEY) || "null");
    if (!saved?.nickname || !saved?.pin) return null;
    return {
      nickname: `${saved.nickname}`.trim(),
      pin: `${saved.pin}`.trim(),
      screen: getRestorableAccessScreen(saved.screen),
    };
  } catch {
    return null;
  }
}

function writeAccessSession(nickname, pin, screen) {
  if (typeof window === "undefined" || !nickname || !pin) return;
  try {
    window.sessionStorage.setItem(
      ACCESS_SESSION_STORAGE_KEY,
      JSON.stringify({
        nickname,
        pin,
        screen: getRestorableAccessScreen(screen),
      }),
    );
  } catch {
    // Session restore is best-effort; blocked storage should not break the app.
  }
}

function clearStoredAccessSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function normalizeDateTimeLocalValue(dateTime) {
  if (!dateTime) return "";
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatMeetupDateTime(dateTime) {
  if (!dateTime) return "";
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return "";
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`;
}

function buildMeetupTimeOptions() {
  const now = new Date();
  const roundedMinutes = Math.ceil(now.getMinutes() / 5) * 5;
  now.setMinutes(roundedMinutes, 0, 0);
  const offsets = [10, 20, 30, 45, 60, 90];

  return offsets.map((offset) => {
    const optionDate = new Date(now.getTime() + offset * 60000);
    const hours = `${optionDate.getHours()}`.padStart(2, "0");
    const minutes = `${optionDate.getMinutes()}`.padStart(2, "0");
    return {
      value: normalizeDateTimeLocalValue(optionDate.toISOString()),
      label: `${hours}:${minutes} (${offset}분 뒤)`,
    };
  });
}

function buildDecoratedProfiles(profiles) {
  return profiles.map((profile) => {
    const parsed = parseProfileCopy(profile.intro);
    return {
      ...profile,
      summary: parsed.summary,
      tags: parsed.tags.length ? parsed.tags.slice(0, 4) : getFallbackTags(profile).slice(0, 4),
      mbti: parsed.mbti,
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

function matchesDiscoveryFilters(profile, searchQuery, mbtiFilter, tagFilters) {
  const normalizedQuery = `${searchQuery || ""}`.trim().toLowerCase();
  const normalizedMbtiFilter = cleanMbtiValue(mbtiFilter);
  const normalizedTagFilters = Array.isArray(tagFilters)
    ? tagFilters.map((tag) => `${tag || ""}`.trim()).filter(Boolean)
    : [];

  if (normalizedMbtiFilter && profile.mbti !== normalizedMbtiFilter) {
    return false;
  }

  if (normalizedTagFilters.length && !normalizedTagFilters.some((tag) => profile.tags.includes(tag))) {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    profile.nickname,
    profile.summary,
    profile.meetPlace,
    profile.genderLabel,
    profile.mbti,
    ...(profile.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

const CONVERTING_STEPS = ["사진 분석", "웹툰 변환", "품질 정리"];

function getConvertingStatus(seconds) {
  if (seconds >= 45) {
    return {
      stepIndex: 2,
      title: "이미지 품질을 정리하는 중이에요",
      copy: "요청이 많아 조금 더 걸리고 있어요. 새로고침하지 말고 기다려 주세요.",
    };
  }
  if (seconds >= 25) {
    return {
      stepIndex: 2,
      title: "거의 다 됐어요",
      copy: "웹툰 이미지의 선과 색감을 정리하고 있어요.",
    };
  }
  if (seconds >= 10) {
    return {
      stepIndex: 1,
      title: "웹툰 스타일로 변환하고 있어요",
      copy: "보통 20~60초 정도 걸려요. 잠시만 기다려 주세요.",
    };
  }
  return {
    stepIndex: 0,
    title: "사진을 분석하고 있어요",
    copy: "얼굴과 조명을 확인한 뒤 웹툰 스타일로 바꿔요.",
  };
}

function formatImagePreviewError(error) {
  const message = `${error?.message || ""}`;
  const lowerMessage = message.toLowerCase();
  if (message.includes("AI 이미지 변환 가능 횟수")) {
    return "이 전화번호는 AI 이미지 변환 가능 횟수 2회를 모두 사용했어요.";
  }
  if (message.includes("삭제된 프로필의 전화번호")) {
    return "삭제된 프로필의 전화번호로는 다시 가입하거나 AI 변환을 사용할 수 없어요.";
  }
  if (message.includes("전화번호")) {
    return "전화번호를 먼저 정확히 입력한 뒤 사진을 업로드해 주세요.";
  }
  const rejectedPrefix = "AI_MATCH_PHOTO_REJECTED:";
  const rejectedIndex = message.indexOf(rejectedPrefix);
  if (rejectedIndex >= 0) {
    const reason = message.slice(rejectedIndex + rejectedPrefix.length).replace(/\)+$/, "").trim();
    return reason || "정면 얼굴이 잘 보이는 1인 실제 사진을 올려 주세요.";
  }
  if (message.includes("OpenAI 사용량 한도") || message.includes("결제 크레딧") || lowerMessage.includes("quota")) {
    return "OpenAI 사용량 한도 또는 결제 크레딧이 부족해요. OpenAI 결제/Usage 한도를 확인해 주세요.";
  }
  if (message.includes("API 키") || lowerMessage.includes("api key")) {
    return "OpenAI API 키가 올바르지 않거나 서버에 적용되지 않았어요. OPENAI_API_KEY 환경변수를 확인해 주세요.";
  }
  if (message.includes("모델 설정") || lowerMessage.includes("model")) {
    return "OpenAI 모델 설정이 올바르지 않아요. OPENAI_MODEL 또는 OPENAI_IMAGE_MODEL 값을 확인해 주세요.";
  }
  if (message.includes("요청이 일시적으로 제한") || lowerMessage.includes("rate limit")) {
    return "AI 요청이 일시적으로 많아 제한되었어요. 잠시 후 다시 시도해 주세요.";
  }
  if (message.includes("응답 시간이 초과") || lowerMessage.includes("timeout")) {
    return "AI 변환 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.";
  }
  return "AI 변환에 실패했어요. 잠시 후 다시 시도해 주세요. 계속 실패하면 다른 사진으로 한 번 더 시도해 주세요.";
}

export default function AiMatchPage() {
  const [activeScreen, setActiveScreen] = useState("intro");
  const [profiles, setProfiles] = useState([]);
  const [accessProfile, setAccessProfile] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [accessSentRequests, setAccessSentRequests] = useState([]);
  const [accessNickname, setAccessNickname] = useState("");
  const [accessPin, setAccessPin] = useState("");
  const [accessPhoneNumber, setAccessPhoneNumber] = useState("");
  const [accessPhoneUsage, setAccessPhoneUsage] = useState(null);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  const [accessTargetScreen, setAccessTargetScreen] = useState("requests");
  const [requestTab, setRequestTab] = useState("received");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCheckAttempted, setPhoneCheckAttempted] = useState(false);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneCheckResult, setPhoneCheckResult] = useState(null);
  const [phoneVerifiedKey, setPhoneVerifiedKey] = useState("");
  const [gender, setGender] = useState("여성");
  const [mbti, setMbti] = useState("");
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
  const [meetupDrafts, setMeetupDrafts] = useState({});
  const [activeFilter, setActiveFilter] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [peopleTagFilters, setPeopleTagFilters] = useState([]);
  const [peopleMbtiFilter, setPeopleMbtiFilter] = useState("");
  const [favoriteProfileIds, setFavoriteProfileIds] = useState([]);
  const [expandedTagProfileIds, setExpandedTagProfileIds] = useState([]);
  const [liveNotice, setLiveNotice] = useState(null);
  const [unreadRequestCount, setUnreadRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [registerAttempted, setRegisterAttempted] = useState(false);
  const [accessAttempted, setAccessAttempted] = useState(false);
  const accessSessionSeqRef = useRef(0);
  const accessSessionRestoredRef = useRef(false);
  const accessRefreshInFlightRef = useRef(false);
  const requestSnapshotRef = useRef(null);
  const liveNoticeTimeoutRef = useRef(null);
  const selectedProfileRef = useRef(null);
  const accessDialogRef = useRef(null);
  const accessNicknameInputRef = useRef(null);
  const noticeStorageKeyRef = useRef("");
  const shownNoticeKeysRef = useRef(new Set());
  const seenNoticeKeysRef = useRef(new Set());
  const currentNoticeKeysRef = useRef(new Set());

  const isEditingProfile = editingProfileId !== null;
  const normalizedNickname = nickname.trim().toLowerCase();
  const hasDuplicateNickname = Boolean(
    normalizedNickname &&
      profiles.some(
        (profile) =>
          profile.nickname.trim().toLowerCase() === normalizedNickname &&
          profile.id !== editingProfileId,
      ),
  );
  const pinMismatch = !isEditingProfile && pin.length > 0 && pinConfirm.length > 0 && pin !== pinConfirm;
  const pinInvalid = !isEditingProfile && pin.length > 0 && !/^\d{4,6}$/.test(pin);
  const phoneDigits = phoneNumber.replace(/\D/g, "");
  const phoneNumberKey = getPhoneNumberKey(phoneNumber);
  const phoneMissing = !isEditingProfile && !phoneNumber.trim();
  const phoneInvalid = phoneNumber.trim().length > 0 && (phoneDigits.length < 8 || phoneDigits.length > 15);
  const phoneVerifiedForCurrentNumber = Boolean(
    isEditingProfile || (phoneVerifiedKey && phoneNumberKey && phoneVerifiedKey === phoneNumberKey),
  );
  const imageMissing = !generatedImageUrl;
  const nicknameMissing = !nickname.trim();
  const pinMissing = !isEditingProfile && !pin.trim();
  const pinConfirmMissing = !isEditingProfile && !pinConfirm.trim();
  const introMissing = !intro.trim();
  const consentMissing = !consent;
  const accessNicknameMissing = !accessNickname.trim();
  const accessPinMissing = !accessPin.trim();
  const canRegister = Boolean(
    !nicknameMissing &&
      !introMissing &&
      !imageMissing &&
      !consentMissing &&
      !submitting &&
      !converting &&
      !hasDuplicateNickname &&
      phoneVerifiedForCurrentNumber &&
      (!phoneMissing && !phoneInvalid) &&
      (isEditingProfile || (/^\d{4,6}$/.test(pin) && pin === pinConfirm)),
  );
  const registerSubmitDisabled = !canRegister;
  const bannerText = errorMessage
    ? errorMessage
      : converting
        ? "웹툰 이미지로 변환 중입니다. 보통 20~60초 정도 걸립니다."
        : successMessage;
  const isDetailScreen = Boolean(selectedProfile);
  const decoratedProfiles = buildDecoratedProfiles(profiles);
  const filteredProfiles = decoratedProfiles.filter(
    (profile) =>
      matchesProfileFilter(activeFilter, profile) &&
      (activeFilter !== "좋아요" || isFavoriteProfile(profile.id)) &&
      matchesDiscoveryFilters(profile, searchQuery, peopleMbtiFilter, peopleTagFilters),
  );
  const latestSentRequestMap = buildLatestSentRequestMap(accessSentRequests);
  const selectedDetailProfile = selectedProfile
    ? buildDecoratedProfiles([selectedProfile])[0]
    : null;
  const selectedDetailRequest = selectedProfile ? latestSentRequestMap.get(selectedProfile.id) : null;
  const meetupTimeOptions = buildMeetupTimeOptions();
  const convertingStatus = getConvertingStatus(convertSeconds);
  const activeScreenTitle = activeScreen === "intro" && accessProfile ? SCREEN_COPY.people : SCREEN_COPY[activeScreen];
  const shouldShowBottomNav =
    activeScreen === "register" ||
    activeScreen === "requests" ||
    activeScreen === "my" ||
    (activeScreen === "intro" && Boolean(accessProfile));

  async function loadData() {
    setLoading(false);
  }

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessSessionRestoredRef.current) return;
    accessSessionRestoredRef.current = true;
    const savedSession = readAccessSession();
    if (!savedSession) return;

    setAccessSubmitting(true);
    setErrorMessage("");
    loadAccessProfile(savedSession.nickname, savedSession.pin, savedSession.screen, { closeModal: false })
      .catch(() => {
        clearAccessSession({ resetForm: true });
        setActiveScreen("intro");
      })
      .finally(() => {
        setAccessSubmitting(false);
      });
  }, []);

  useEffect(() => {
    if (!accessProfile || !accessNickname || !accessPin) return;
    writeAccessSession(accessNickname, accessPin, activeScreen);
  }, [accessProfile, accessNickname, accessPin, activeScreen]);

  useEffect(
    () => () => {
      if (liveNoticeTimeoutRef.current) {
        window.clearTimeout(liveNoticeTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!accessModalOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
      accessDialogRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      window.setTimeout(() => {
        accessNicknameInputRef.current?.focus({ preventScroll: true });
      }, 220);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [accessModalOpen]);

  useEffect(() => {
    if (activeScreen === "requests") {
      markRequestNoticesSeen();
    }
  }, [activeScreen]);

  useEffect(() => {
    if (!converting) return undefined;

    const intervalId = window.setInterval(() => {
      setConvertSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [converting]);

  useEffect(() => {
    if (!selectedProfile) return;
    setRequestPlace(MEET_PLACES[0]);
  }, [selectedProfile]);

  useEffect(() => {
    if (!accessProfile || !accessNickname || !accessPin || isEditingProfile) return undefined;

    const refreshSilently = () => {
      if (document.visibilityState === "hidden" || accessRefreshInFlightRef.current || submitting || accessSubmitting) {
        return;
      }
      accessRefreshInFlightRef.current = true;
      loadAccessProfile(accessNickname, accessPin, activeScreen, { closeModal: false, notify: true })
        .catch((error) => {
          if (isAccessExpiredError(error)) {
            clearAccessSession({ resetForm: true });
            setActiveScreen("intro");
            setErrorMessage("프로필이 삭제되었거나 인증이 만료되었습니다. 닉네임과 PIN으로 다시 입장해 주세요.");
          }
        })
        .finally(() => {
          accessRefreshInFlightRef.current = false;
        });
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
  }, [accessProfile, accessNickname, accessPin, activeScreen, isEditingProfile, submitting, accessSubmitting]);

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

  async function toggleFavorite(profileId) {
    if (!accessProfile || !accessPin) {
      setErrorMessage("좋아요는 로그인 후 사용할 수 있습니다.");
      openAccessModal("intro");
      return;
    }

    const wasFavorite = favoriteProfileIds.includes(profileId);
    setFavoriteProfileIds((current) =>
      current.includes(profileId) ? current.filter((item) => item !== profileId) : [...current, profileId],
    );
    try {
      const response = await toggleAiMatchFavorite(profileId, accessProfile.nickname, accessPin);
      if (Array.isArray(response.favoriteProfileIds)) {
        setFavoriteProfileIds(response.favoriteProfileIds);
      }
    } catch (error) {
      setFavoriteProfileIds((current) => {
        const withoutProfile = current.filter((item) => item !== profileId);
        return wasFavorite ? [...withoutProfile, profileId] : withoutProfile;
      });
      showAuthenticatedActionError(error, "좋아요 처리에 실패했습니다.");
    }
  }

  function toggleExpandedTags(profileId) {
    setExpandedTagProfileIds((current) =>
      current.includes(profileId) ? current.filter((item) => item !== profileId) : [...current, profileId],
    );
  }

  function togglePeopleTagFilter(tag) {
    setPeopleTagFilters((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }

  function openMeetPlaceMap() {
    const { label, lat, lng } = MEET_PLACE_MAP_TARGET;
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(label)},${lat},${lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function getMeetupDraft(request) {
    const savedDraft = meetupDrafts[request.id];
    return {
      meetupPlace: savedDraft?.meetupPlace || request.meetupPlace || request.meetPlace || MEET_PLACES[0],
      meetupAt: savedDraft?.meetupAt || normalizeDateTimeLocalValue(request.meetupAt) || meetupTimeOptions[0]?.value || "",
    };
  }

  function updateMeetupDraft(requestId, patch) {
    setMeetupDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] || {}),
        ...patch,
      },
    }));
  }

  function openAccessModal(targetScreen = "requests") {
    setAccessTargetScreen(targetScreen);
    setAccessModalOpen(true);
    setAccessAttempted(false);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function closeAccessModal() {
    setAccessModalOpen(false);
    setAccessSubmitting(false);
    setAccessAttempted(false);
  }

  function clearAccessSession({ resetForm = false } = {}) {
    accessSessionSeqRef.current += 1;
    clearStoredAccessSession();
    setAccessProfile(null);
    setAccessRequests([]);
    setAccessSentRequests([]);
    setProfiles([]);
    setFavoriteProfileIds([]);
    setAccessNickname("");
    setAccessPin("");
    setAccessPhoneNumber("");
    setAccessPhoneUsage(null);
    setRequesterNickname("");
    setActiveSelectedProfile(null);
    setRequestMessage("");
    setRequestPlace(MEET_PLACES[0]);
    setMeetupDrafts({});
    setLiveNotice(null);
    setUnreadRequestCount(0);
    requestSnapshotRef.current = null;
    noticeStorageKeyRef.current = "";
    shownNoticeKeysRef.current = new Set();
    seenNoticeKeysRef.current = new Set();
    currentNoticeKeysRef.current = new Set();
    if (resetForm) {
      resetRegistrationForm();
    }
  }

  function showAuthenticatedActionError(error, fallbackMessage) {
    if (isAccessExpiredError(error)) {
      clearAccessSession({ resetForm: true });
      setActiveScreen("intro");
      setErrorMessage("프로필이 삭제되었거나 인증이 만료되었습니다. 닉네임과 PIN으로 다시 입장해 주세요.");
      return;
    }
    const rawMessage = error?.message || "";
    const lowerMessage = rawMessage.toLowerCase();
    if (
      lowerMessage.includes("could not execute statement") ||
      lowerMessage.includes("internal server error") ||
      lowerMessage.includes("sql")
    ) {
      setErrorMessage(fallbackMessage);
      return;
    }
    setErrorMessage(rawMessage || fallbackMessage);
  }

  function getNoticeStorageKey(profile, fallbackNickname) {
    const profileKey = profile?.id || `${fallbackNickname || ""}`.trim().toLowerCase();
    return profileKey ? `ai-match-request-notices:${profileKey}` : "";
  }

  function prepareNoticeTracking(profile, fallbackNickname) {
    const storageKey = getNoticeStorageKey(profile, fallbackNickname);
    if (!storageKey || noticeStorageKeyRef.current === storageKey) return;
    noticeStorageKeyRef.current = storageKey;
    shownNoticeKeysRef.current = readNoticeKeySet(storageKey, "shown");
    seenNoticeKeysRef.current = readNoticeKeySet(storageKey, "seen");
    currentNoticeKeysRef.current = new Set();
  }

  function persistNoticeTracking() {
    writeNoticeKeySets(noticeStorageKeyRef.current, shownNoticeKeysRef.current, seenNoticeKeysRef.current);
  }

  function updateUnreadRequestCount(notices, visibleScreen = activeScreen) {
    const currentKeys = new Set(notices.map((notice) => notice.key).filter(Boolean));
    currentNoticeKeysRef.current = currentKeys;
    if (visibleScreen === "requests") {
      currentKeys.forEach((key) => seenNoticeKeysRef.current.add(key));
      persistNoticeTracking();
      setUnreadRequestCount(0);
      return;
    }
    const unreadCount = [...currentKeys].filter((key) => !seenNoticeKeysRef.current.has(key)).length;
    setUnreadRequestCount(Math.min(99, unreadCount));
  }

  function markRequestNoticesSeen() {
    currentNoticeKeysRef.current.forEach((key) => seenNoticeKeysRef.current.add(key));
    persistNoticeTracking();
    setUnreadRequestCount(0);
  }

  function isFavoriteProfile(profileId) {
    return favoriteProfileIds.includes(profileId);
  }

  function dismissLiveNotice() {
    setLiveNotice(null);
  }

  function showLiveNotice(notices) {
    const freshNotices = notices.filter((notice) => {
      const key = notice.key || `${notice.tab}:${notice.message}`;
      return key && !shownNoticeKeysRef.current.has(key);
    });
    if (!freshNotices.length) return;

    freshNotices.forEach((notice) => {
      const key = notice.key || `${notice.tab}:${notice.message}`;
      shownNoticeKeysRef.current.add(key);
    });
    persistNoticeTracking();

    const [firstNotice] = freshNotices;
    const message =
      freshNotices.length > 1
        ? `${firstNotice.message} 외 ${freshNotices.length - 1}건의 새 알림이 있어요.`
        : firstNotice.message;

    setLiveNotice({
      id: `${Date.now()}-${freshNotices.length}`,
      tab: firstNotice.tab,
      title: firstNotice.title || "새 알림 도착",
      message,
    });
    if (liveNoticeTimeoutRef.current) {
      window.clearTimeout(liveNoticeTimeoutRef.current);
    }
    liveNoticeTimeoutRef.current = window.setTimeout(() => {
      setLiveNotice(null);
    }, 12000);
  }

  function openLiveNoticeTarget(tab = "received") {
    setLiveNotice(null);
    markRequestNoticesSeen();
    setActiveSelectedProfile(null);
    setRequestTab(tab === "sent" ? "sent" : "received");
    setActiveScreen("requests");
  }

  function getAccessModalTitle() {
    if (accessTargetScreen === "people" || accessTargetScreen === "intro") return "로그인";
    if (accessTargetScreen === "my") return "MY 잠금 해제";
    return "신청함 잠금 해제";
  }

  function getAccessSubmitLabel() {
    if (accessSubmitting) return "확인 중...";
    if (accessTargetScreen === "people" || accessTargetScreen === "intro") return "로그인";
    if (accessTargetScreen === "my") return "MY 열기";
    return "신청함 열기";
  }

  async function loadAccessProfile(
    nextNickname,
    nextPin,
    nextScreen = "requests",
    { closeModal = true, notify = false, announceSummary = false } = {},
  ) {
    const resolvedNextScreen = nextScreen === "people" ? "intro" : nextScreen;
    const sessionSeq = accessSessionSeqRef.current;
    const response = await accessAiMatchProfile(nextNickname, nextPin);
    if (sessionSeq !== accessSessionSeqRef.current) {
      return response;
    }
    const nextProfiles = Array.isArray(response.profiles) ? response.profiles : [];
    const nextReceivedRequests = Array.isArray(response.receivedRequests)
      ? response.receivedRequests
      : Array.isArray(response.requests)
        ? response.requests
        : [];
    const nextSentRequests = Array.isArray(response.sentRequests) ? response.sentRequests : [];
    const nextFavoriteProfileIds = Array.isArray(response.favoriteProfileIds) ? response.favoriteProfileIds : [];
    prepareNoticeTracking(response.profile, nextNickname);
    const currentNotices = buildCurrentRequestNotices(nextReceivedRequests, nextSentRequests);
    const requestNotices = notify
      ? collectRequestNotifications(requestSnapshotRef.current, nextReceivedRequests, nextSentRequests)
      : [];
    const loginNotices = announceSummary ? collectLoginNotifications(nextReceivedRequests, nextSentRequests) : [];
    requestSnapshotRef.current = createRequestSnapshot(nextReceivedRequests, nextSentRequests);
    updateUnreadRequestCount(currentNotices, resolvedNextScreen);
    setAccessProfile(response.profile || null);
    setAccessRequests(nextReceivedRequests);
    setAccessSentRequests(nextSentRequests);
    setProfiles(nextProfiles);
    setFavoriteProfileIds(nextFavoriteProfileIds);
    setAccessNickname(nextNickname);
    setAccessPin(nextPin);
    setAccessPhoneNumber(response.phoneNumber || "");
    setAccessPhoneUsage(response.phoneUsage || null);
    setRequesterNickname(response.profile?.nickname || nextNickname);
    writeAccessSession(nextNickname, nextPin, resolvedNextScreen);
    const currentSelectedProfile = selectedProfileRef.current;
    if (currentSelectedProfile) {
      setActiveSelectedProfile(nextProfiles.find((profile) => profile.id === currentSelectedProfile.id) || null);
    }
    setActiveScreen(resolvedNextScreen);
    if (closeModal) {
      setAccessModalOpen(false);
    }
    showLiveNotice(loginNotices.length ? loginNotices : requestNotices);
    return response;
  }

  async function handleAccessSubmit(event) {
    event.preventDefault();
    setAccessAttempted(true);
    if (!accessNickname.trim()) {
      setErrorMessage("닉네임을 입력해 주세요.");
      return;
    }
    if (!accessPin.trim()) {
      setErrorMessage("PIN을 입력해 주세요.");
      return;
    }

    setAccessSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await loadAccessProfile(accessNickname.trim(), accessPin.trim(), accessTargetScreen, {
        announceSummary: true,
      });
      setSuccessMessage("신청함 잠금이 해제되었습니다.");
    } catch (error) {
      setErrorMessage(error.message || "프로필 인증에 실패했습니다.");
    } finally {
      setAccessSubmitting(false);
    }
  }

  function openProfile(profile) {
    setActiveSelectedProfile(profile);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function closeDetail() {
    setActiveSelectedProfile(null);
  }

  function setActiveSelectedProfile(profile) {
    selectedProfileRef.current = profile;
    setSelectedProfile(profile);
  }

  function resetRegistrationForm() {
    setRegisterAttempted(false);
    setEditingProfileId(null);
    setNickname("");
    setPin("");
    setPinConfirm("");
    setPhoneNumber("");
    setPhoneCheckAttempted(false);
    setPhoneChecking(false);
    setPhoneCheckResult(null);
    setPhoneVerifiedKey("");
    setGender("여성");
    setMbti("");
    setIntro("");
    setPlace(MEET_PLACES[0]);
    setSelectedTags([]);
    setPreviewUrl("");
    setOriginalImageUrl("");
    setGeneratedImageUrl("");
    setConsent(false);
    setConvertSeconds(0);
  }

  function startNewRegistration() {
    resetRegistrationForm();
    setActiveSelectedProfile(null);
    setErrorMessage("");
    setSuccessMessage("");
    setActiveScreen("register");
  }

  function startEditingProfile() {
    if (!accessProfile) return;
    const parsed = parseProfileCopy(accessProfile.intro);
    setRegisterAttempted(false);
    setEditingProfileId(accessProfile.id);
    const ownPhoneNumber = accessPhoneNumber || accessPhoneUsage?.phoneNumber || "";
    setNickname(accessProfile.nickname || "");
    setPin("");
    setPinConfirm("");
    setPhoneNumber(ownPhoneNumber);
    setPhoneCheckAttempted(false);
    setPhoneChecking(false);
    setPhoneCheckResult(accessPhoneUsage || null);
    setPhoneVerifiedKey(getPhoneNumberKey(ownPhoneNumber));
    setGender(accessProfile.gender === "남성" ? "남성" : "여성");
    setMbti(parsed.mbti || "");
    setIntro(parsed.summary || "");
    setPlace(MEET_PLACES[0]);
    setSelectedTags(parsed.tags || []);
    setOriginalImageUrl(accessProfile.originalImageUrl || "");
    setGeneratedImageUrl(accessProfile.generatedImageUrl || "");
    setPreviewUrl(resolveApiAssetUrl(accessProfile.generatedImageUrl || ""));
    setConsent(true);
    setConvertSeconds(0);
    setActiveSelectedProfile(null);
    setActiveScreen("register");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handlePhoneNumberInput(nextValue) {
    if (!PHONE_INPUT_PATTERN.test(nextValue)) return;
    setPhoneNumber(nextValue);
    setPhoneVerifiedKey("");
    setPhoneCheckResult(null);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handlePhoneCheck() {
    setPhoneCheckAttempted(true);
    setPhoneVerifiedKey("");
    setPhoneCheckResult(null);
    setErrorMessage("");
    setSuccessMessage("");

    if (phoneMissing) {
      setErrorMessage("전화번호를 먼저 입력해 주세요.");
      return;
    }
    if (phoneInvalid) {
      setErrorMessage("전화번호 형식이 올바르지 않습니다.");
      return;
    }

    setPhoneChecking(true);
    try {
      const result = await checkAiMatchPhoneNumber(phoneNumber.trim());
      setPhoneCheckResult(result);
      if (result.available) {
        setPhoneVerifiedKey(result.phoneNumber || phoneNumberKey);
        setSuccessMessage(result.message || "전화번호 확인이 완료되었습니다.");
      } else {
        setErrorMessage(result.message || "이 전화번호는 사용할 수 없습니다.");
      }
    } catch (error) {
      setErrorMessage(error.message || "전화번호 확인에 실패했습니다.");
    } finally {
      setPhoneChecking(false);
    }
  }

  async function handleImageChange(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    if (phoneMissing) {
      setRegisterAttempted(true);
      setErrorMessage("AI 변환 전에 전화번호를 먼저 입력해 주세요.");
      event.target.value = "";
      return;
    }
    if (phoneInvalid) {
      setRegisterAttempted(true);
      setErrorMessage("전화번호 형식이 올바르지 않습니다. 확인 후 다시 업로드해 주세요.");
      event.target.value = "";
      return;
    }
    if (!phoneVerifiedForCurrentNumber) {
      setPhoneCheckAttempted(true);
      setErrorMessage("전화번호 확인을 먼저 완료해 주세요.");
      event.target.value = "";
      return;
    }
    const remainingBeforeConversion = Number(phoneCheckResult?.remainingImageConversions);
    const hasKnownRemainingBeforeConversion = Number.isFinite(remainingBeforeConversion);
    if (
      (!isEditingProfile || hasKnownRemainingBeforeConversion) &&
      (!hasKnownRemainingBeforeConversion || remainingBeforeConversion <= 0)
    ) {
      setErrorMessage("이 전화번호는 AI 이미지 변환 가능 횟수를 모두 사용했어요.");
      event.target.value = "";
      return;
    }
    const confirmMessage = hasKnownRemainingBeforeConversion
      ? `AI 변환 가능 횟수가 ${remainingBeforeConversion}회 남았습니다.\n이번 변환이 성공하면 1회 차감됩니다.\nAI 변환을 진행할까요?`
      : "AI 변환을 진행할까요?\n성공한 변환만 횟수에서 차감됩니다.";
    const shouldConvert = window.confirm(
      confirmMessage,
    );
    if (!shouldConvert) {
      event.target.value = "";
      return;
    }

    setOriginalImageUrl("");
    setGeneratedImageUrl("");
    setPreviewUrl("");
    setConvertSeconds(0);
    setErrorMessage("");
    setSuccessMessage("");
    setConverting(true);

    try {
      const preview = await createAiMatchImagePreview(nextFile, phoneNumber.trim());
      const nextGeneratedImageUrl = preview.generatedImageUrl || "";
      setOriginalImageUrl(preview.originalImageUrl || "");
      setGeneratedImageUrl(nextGeneratedImageUrl);
      setPreviewUrl(resolveApiAssetUrl(nextGeneratedImageUrl));
      const usedImageConversions = Number(preview.usedImageConversions ?? 0);
      const remainingImageConversions = Number(preview.remainingImageConversions ?? 0);
      const hasConversionCounts =
        preview.usedImageConversions !== undefined &&
        preview.remainingImageConversions !== undefined &&
        Number.isFinite(usedImageConversions) && Number.isFinite(remainingImageConversions);
      if (hasConversionCounts) {
        const nextRemaining = Math.max(0, remainingImageConversions);
        const nextPhoneUsage = {
          ...(phoneCheckResult || {}),
          phoneNumber: phoneCheckResult?.phoneNumber || phoneNumberKey,
          available: nextRemaining > 0,
          usedImageConversions: Math.max(0, usedImageConversions),
          remainingImageConversions: nextRemaining,
          message: preview.message || `AI 변환이 완료되었습니다. ${nextRemaining}회 남았습니다.`,
        };
        setPhoneCheckResult((current) => ({
          ...(current || {}),
          ...nextPhoneUsage,
        }));
        if (isEditingProfile) {
          setAccessPhoneUsage(nextPhoneUsage);
        }
      }
      setSuccessMessage(preview.message || "웹툰 스타일 이미지가 준비되었습니다. 설명을 입력하고 등록하세요.");
    } catch (error) {
      setErrorMessage(formatImagePreviewError(error));
    } finally {
      setConverting(false);
      event.target.value = "";
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setRegisterAttempted(true);
    if (!isEditingProfile && !phoneVerifiedForCurrentNumber) {
      setPhoneCheckAttempted(true);
      setErrorMessage("전화번호 확인을 먼저 완료해 주세요.");
      return;
    }
    if (imageMissing) {
      setErrorMessage("프로필 사진을 먼저 업로드해 주세요.");
      return;
    }
    if (nicknameMissing) {
      setErrorMessage("닉네임을 입력해 주세요.");
      return;
    }
    if (hasDuplicateNickname) {
      setErrorMessage("이미 사용 중인 닉네임입니다.");
      return;
    }
    if (!isEditingProfile && pinMissing) {
      setErrorMessage("PIN을 입력해 주세요.");
      return;
    }
    if (!isEditingProfile && pinInvalid) {
      setErrorMessage("PIN은 4~6자리 숫자여야 합니다.");
      return;
    }
    if (!isEditingProfile && pinConfirmMissing) {
      setErrorMessage("PIN 확인을 입력해 주세요.");
      return;
    }
    if (!isEditingProfile && pinMismatch) {
      setErrorMessage("PIN이 서로 일치하지 않습니다.");
      return;
    }
    if (phoneMissing) {
      setErrorMessage("전화번호를 입력해 주세요.");
      return;
    }
    if (phoneInvalid) {
      setErrorMessage("전화번호 형식이 올바르지 않습니다.");
      return;
    }
    if (introMissing) {
      setErrorMessage("자기소개를 입력해 주세요.");
      return;
    }
    if (consentMissing) {
      setErrorMessage("프로필 공개 동의가 필요합니다.");
      return;
    }
    if (!canRegister) return;

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (isEditingProfile && accessProfile) {
        const updatedProfile = await updateAiMatchProfile(editingProfileId, {
          currentNickname: accessProfile.nickname,
          nickname: nickname.trim(),
          gender,
          intro: serializeProfileCopy(intro, selectedTags, mbti),
          phoneNumber: phoneNumber.trim(),
          meetPlace: place,
          originalImageUrl,
          generatedImageUrl,
          pin: accessPin,
        });
        setProfiles((current) => current.map((item) => (item.id === updatedProfile.id ? updatedProfile : item)));
        setAccessProfile(updatedProfile);
        setAccessNickname(updatedProfile.nickname);
        resetRegistrationForm();
        setActiveScreen("requests");
        setSuccessMessage("내 프로필이 수정되었습니다.");
      } else {
        const createdNickname = nickname.trim();
        const createdPin = pin.trim();
        const nextProfile = await createAiMatchProfile(
          {
            nickname: createdNickname,
            gender,
            intro: serializeProfileCopy(intro, selectedTags, mbti),
            pin: createdPin,
            phoneNumber: phoneNumber.trim(),
            meetPlace: place,
            consent,
            originalImageUrl,
            generatedImageUrl,
          },
          null,
        );

        setAccessProfile(nextProfile);
        setAccessNickname(createdNickname);
        setAccessPin(createdPin);
        setRequesterNickname(createdNickname);
        resetRegistrationForm();
        setActiveScreen("intro");
        try {
          await loadAccessProfile(createdNickname, createdPin, "intro");
          setSuccessMessage("AI 프로필이 등록되었습니다. 처음 화면에서 바로 확인해 보세요.");
        } catch (accessError) {
          setSuccessMessage("AI 프로필은 등록되었습니다. 목록 갱신이 늦으면 신청함에서 닉네임과 PIN으로 다시 입장해 주세요.");
        }
      }
    } catch (error) {
      setErrorMessage(error.message || (isEditingProfile ? "AI 프로필 수정에 실패했습니다." : "AI 프로필 등록에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequest(event) {
    event.preventDefault();
    if (!selectedProfile) return;
    if (!accessProfile) {
      setErrorMessage("등록한 닉네임과 PIN으로 먼저 입장해 주세요.");
      openAccessModal("intro");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await createAiMatchRequest(selectedProfile.id, {
        requesterNickname: accessProfile.nickname,
        requesterPin: accessPin,
        meetPlace: requestPlace,
        message: requestMessage.trim() || "축제에서 잠깐 만나고 싶어요.",
      });
      await loadAccessProfile(accessNickname, accessPin, "requests");
      setRequesterNickname(accessProfile.nickname);
      setRequestMessage("");
      setRequestPlace(MEET_PLACES[0]);
      setActiveSelectedProfile(null);
      setRequestTab("sent");
      setSuccessMessage("데이트 신청이 전송되었습니다.");
      window.alert("데이트 신청이 완료되었습니다.");
    } catch (error) {
      showAuthenticatedActionError(error, "데이트 신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteProfile() {
    if (!accessProfile) return;
    const confirmed = window.confirm("내 프로필을 삭제할까요? 삭제 후에는 다시 잠금 해제할 수 없습니다.");
    if (!confirmed) return;

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await deleteAiMatchProfile(accessProfile.id, {
        currentNickname: accessProfile.nickname,
        nickname: accessProfile.nickname,
        pin: accessPin,
      });
      clearAccessSession({ resetForm: true });
      setActiveScreen("intro");
      setSuccessMessage("프로필이 삭제되었습니다.");
    } catch (error) {
      setErrorMessage(error.message || "AI 프로필 삭제에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestsRefresh() {
    if (!accessNickname || !accessPin) return;
    setLoading(true);
    setErrorMessage("");
    try {
      await loadAccessProfile(accessNickname, accessPin, "requests", { notify: true });
    } catch (error) {
      if (isAccessExpiredError(error)) {
        clearAccessSession({ resetForm: true });
        setActiveScreen("intro");
        setErrorMessage("프로필이 삭제되었거나 인증이 만료되었습니다. 닉네임과 PIN으로 다시 입장해 주세요.");
      } else {
        setErrorMessage(error.message || "신청함을 새로고침하지 못했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptRequest(requestId) {
    if (!accessNickname || !accessPin) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      await acceptAiMatchRequest(requestId, accessNickname, accessPin);
      await loadAccessProfile(accessNickname, accessPin, "requests");
      setRequestTab("received");
      setSuccessMessage("데이트 신청을 수락했습니다.");
    } catch (error) {
      showAuthenticatedActionError(error, "데이트 신청 수락에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRejectRequest(requestId) {
    if (!accessNickname || !accessPin) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      await rejectAiMatchRequest(requestId, accessNickname, accessPin);
      await loadAccessProfile(accessNickname, accessPin, "requests");
      setRequestTab("received");
      setSuccessMessage("데이트 신청을 거절했습니다.");
    } catch (error) {
      showAuthenticatedActionError(error, "데이트 신청 거절에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelRequest(requestId) {
    if (!accessNickname || !accessPin) return;
    const confirmed = window.confirm("보낸 데이트 신청을 취소할까요?");
    if (!confirmed) return;

    setSubmitting(true);
    setErrorMessage("");
    try {
      await cancelAiMatchRequest(requestId, accessNickname, accessPin);
      await loadAccessProfile(accessNickname, accessPin, activeScreen);
      setRequestTab("sent");
      setSuccessMessage("데이트 신청을 취소했습니다.");
    } catch (error) {
      showAuthenticatedActionError(error, "데이트 신청 취소에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProposeMeetup(request) {
    if (!accessNickname || !accessPin) return;
    const draft = getMeetupDraft(request);
    if (!draft.meetupPlace || !draft.meetupAt) {
      setErrorMessage("만날 장소와 시간을 모두 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      await proposeAiMatchMeetup(request.id, {
        nickname: accessNickname,
        pin: accessPin,
        meetupPlace: draft.meetupPlace,
        meetupAt: draft.meetupAt,
      });
      await loadAccessProfile(accessNickname, accessPin, "requests");
      setSuccessMessage("약속 제안을 보냈습니다.");
    } catch (error) {
      showAuthenticatedActionError(error, "약속 제안에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmMeetup(requestId) {
    if (!accessNickname || !accessPin) return;

    setSubmitting(true);
    setErrorMessage("");
    try {
      await confirmAiMatchMeetup(requestId, accessNickname, accessPin);
      await loadAccessProfile(accessNickname, accessPin, "requests");
      setSuccessMessage("약속이 확정되었습니다.");
    } catch (error) {
      showAuthenticatedActionError(error, "약속 확정에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderLiveNotice() {
    if (!liveNotice) return null;
    return (
      <div className="ai-match-live-notice" role="alert" aria-live="assertive">
        <span className="ai-match-live-notice__icon" aria-hidden="true">
          <IconHeartFilled className="h-4 w-4" />
        </span>
        <div className="ai-match-live-notice__body">
          <strong>{liveNotice.title || "새 알림 도착"}</strong>
          <p>{liveNotice.message}</p>
        </div>
        <button type="button" className="ai-match-live-notice__primary" onClick={() => openLiveNoticeTarget(liveNotice.tab)}>
          신청함 보기
        </button>
        <button
          type="button"
          className="ai-match-live-notice__close"
          onClick={dismissLiveNotice}
          aria-label="알림 닫기"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderIntroScreen() {
    if (accessProfile) {
      return renderPeopleScreen();
    }

    return (
      <div className="ai-match-flow">
        <section className="ai-match-hero-card">
          <div className="ai-match-hero-copy">
            <p>AI 프로필을 만들고 축제에서 어울릴 사람을 찾아보세요!</p>
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

        <section className="ai-match-step-card">
          <h3>간단한 3단계로 등록 완료!</h3>
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
          onClick={startNewRegistration}
        >
          <span className="ai-match-primary-button__icon">
            <IconHeart className="h-4 w-4" />
          </span>
          <span className="ai-match-primary-button__label">회원가입</span>
        </button>

        <button
          type="button"
          className="ai-match-secondary-button"
          onClick={() => openAccessModal("intro")}
        >
          로그인
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
        {isEditingProfile ? (
          <section className="ai-match-section-card">
            <div className="ai-match-section-head">
              <h2>내 프로필 수정</h2>
              <span>{accessProfile?.nickname}</span>
            </div>
            <p className="ai-match-note">신청함에서 인증된 PIN으로 수정이 진행됩니다.</p>
          </section>
        ) : null}

        {!isEditingProfile ? (
          <section className="ai-match-section-card ai-match-phone-gate-card">
            <div className="ai-match-section-head">
              <h2>1. 전화번호 확인</h2>
              <span>관리자만 확인</span>
            </div>
            <div className="ai-match-phone-privacy">
              <IconShield className="h-5 w-5" />
              <div>
                <strong>만남 조율을 위해 먼저 확인해요</strong>
                <p>전화번호는 소개팅 매칭 성사 후 관리자 연락과 만남 조율에만 사용되며, 다른 참가자에게 공개되지 않습니다.</p>
              </div>
            </div>
            <div className="ai-match-phone-rules">
              <span>AI 변환은 전화번호당 성공 기준 최대 2회</span>
              <span>삭제한 전화번호는 재가입 불가</span>
            </div>
            <label className="ai-match-field">
              <div className="ai-match-field-head">
                <span>전화번호</span>
                <small>예) 010-1234-5678</small>
              </div>
              {phoneCheckAttempted && phoneMissing ? <small className="ai-match-field-error">전화번호를 입력해 주세요.</small> : null}
              {phoneCheckAttempted && phoneInvalid ? <small className="ai-match-field-error">전화번호 형식이 올바르지 않습니다.</small> : null}
              <input
                value={phoneNumber}
                inputMode="tel"
                maxLength={30}
                onChange={(event) => handlePhoneNumberInput(event.target.value)}
                placeholder="010-1234-5678"
              />
            </label>
            {phoneCheckResult ? (
              <div className={`ai-match-phone-status${phoneVerifiedForCurrentNumber ? " is-success" : " is-error"}`}>
                <strong>{phoneVerifiedForCurrentNumber ? "확인 완료" : "사용 불가"}</strong>
                <span>{phoneCheckResult.message}</span>
              </div>
            ) : null}
            <button
              type="button"
              className="ai-match-primary-button ai-match-primary-button--form ai-match-phone-check-button"
              onClick={handlePhoneCheck}
              disabled={phoneChecking || converting || submitting}
            >
              <span className="ai-match-primary-button__icon">
                <IconShield className="h-4 w-4" />
              </span>
              <span className="ai-match-primary-button__label">
                {phoneChecking ? "확인 중..." : phoneVerifiedForCurrentNumber ? "다시 확인" : "전화번호 확인"}
              </span>
            </button>
          </section>
        ) : null}

        {!isEditingProfile && !phoneVerifiedForCurrentNumber ? (
          <section className="ai-match-section-card ai-match-phone-locked-card">
            <IconSparkles className="h-6 w-6" />
            <strong>전화번호 확인 후 AI 변환을 시작할 수 있어요.</strong>
            <p>중복 가입과 AI 과사용을 막기 위해 전화번호를 먼저 확인합니다.</p>
          </section>
        ) : (
          <>
        <section className="ai-match-section-card">
          <div className="ai-match-section-head">
            <h2>{isEditingProfile ? "1. 사진 업로드" : "2. 사진 업로드"}</h2>
            <span>정면 사진</span>
          </div>

          {phoneCheckResult ? (
            <div
              className={`ai-match-ai-usage-meter ai-match-ai-usage-meter--in-photo${
                phoneCheckResult.available && phoneVerifiedForCurrentNumber ? " is-success" : " is-error"
              }`}
            >
              <span>AI 변환 가능 횟수</span>
              <strong>
                {`${Math.max(0, phoneCheckResult.remainingImageConversions || 0)}회 남음`}
              </strong>
              <small>
                {`성공한 변환 ${phoneCheckResult.usedImageConversions || 0}회 사용`}
              </small>
            </div>
          ) : null}

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

          {converting ? (
            <div className="ai-match-converting-panel" role="status" aria-live="polite">
              <div className="ai-match-converting-panel__top">
                <span className="ai-match-converting-pulse" aria-hidden="true" />
                <div>
                  <strong>{convertingStatus.title}</strong>
                  <p>{convertingStatus.copy}</p>
                </div>
              </div>
              <div className="ai-match-converting-progress" aria-hidden="true">
                <span />
              </div>
              <div className="ai-match-converting-steps" aria-label="AI 변환 진행 단계">
                {CONVERTING_STEPS.map((step, index) => (
                  <span
                    key={step}
                    className={index <= convertingStatus.stepIndex ? "is-active" : ""}
                  >
                    {step}
                  </span>
                ))}
              </div>
              <small>{convertSeconds}초 경과 · 완료까지 보통 20~60초 정도 걸립니다.</small>
            </div>
          ) : null}

          <label className={`ai-match-upload-button${converting ? " is-disabled" : ""}`}>
            {converting ? "변환 중..." : generatedImageUrl ? "다른 사진 올리기" : "사진 업로드"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} disabled={converting} />
          </label>
          {imageMissing ? (
            <small className="ai-match-field-error">프로필 사진을 먼저 업로드해 주세요.</small>
          ) : null}
        </section>

        <section className="ai-match-section-card">
          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>{isEditingProfile ? "2. 닉네임을 입력해주세요" : "3. 닉네임을 입력해주세요"}</span>
              <small>{nickname.length}/12</small>
            </div>
            {nicknameMissing ? <small className="ai-match-field-error">닉네임을 입력해 주세요.</small> : null}
            {hasDuplicateNickname ? <small className="ai-match-field-error">이미 사용 중인 닉네임입니다.</small> : null}
            <input
              value={nickname}
              maxLength={12}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="예) 햇살같은하루"
            />
          </label>

          {!isEditingProfile ? (
            <>
              <label className="ai-match-field">
                <div className="ai-match-field-head">
                  <span>4. PIN</span>
                  <small>4~6자리 숫자</small>
                </div>
                {pinMissing ? <small className="ai-match-field-error">PIN을 입력해 주세요.</small> : null}
                {pinInvalid ? <small className="ai-match-field-error">PIN은 4~6자리 숫자여야 합니다.</small> : null}
                <input
                  value={pin}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/\D/g, "");
                    if (PIN_INPUT_PATTERN.test(nextValue)) {
                      setPin(nextValue);
                    }
                  }}
                  placeholder="예) 1234"
                />
              </label>

              <label className="ai-match-field">
                <div className="ai-match-field-head">
                  <span>5. PIN 확인</span>
                </div>
                {pinConfirmMissing ? <small className="ai-match-field-error">PIN 확인을 입력해 주세요.</small> : null}
                {pinMismatch ? <small className="ai-match-field-error">PIN이 서로 일치하지 않습니다.</small> : null}
                <input
                  value={pinConfirm}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/\D/g, "");
                    if (PIN_INPUT_PATTERN.test(nextValue)) {
                      setPinConfirm(nextValue);
                    }
                  }}
                  placeholder="PIN을 다시 입력해주세요"
                />
              </label>
            </>
          ) : null}

          {isEditingProfile ? (
            <p className="ai-match-note">
              <IconShield className="h-4 w-4" />
              AI 과사용 방지를 위해 전화번호는 가입 후 변경할 수 없습니다.
            </p>
          ) : null}

          <div className="ai-match-field">
            <div className="ai-match-field-head">
              <span>{isEditingProfile ? "3. 성별" : "6. 성별"}</span>
            </div>
            <div className="ai-match-gender-grid">
              {["남성", "여성"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`ai-match-segment-button ai-match-segment-button--${getGenderButtonTone(item)}${gender === item ? " is-active" : ""}`}
                  aria-pressed={gender === item}
                  onClick={() => setGender(item)}
                >
                  {getProfileGenderLabel(item)}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-match-field">
            <div className="ai-match-field-head">
              <span>{isEditingProfile ? "4. MBTI" : "7. MBTI"}</span>
              <small>선택 사항</small>
            </div>
            <select value={mbti} onChange={(event) => setMbti(cleanMbtiValue(event.target.value))}>
              <option value="">선택 안 함</option>
              {MBTI_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="ai-match-field">
            <div className="ai-match-field-head">
              <span>{isEditingProfile ? "5. 관심사 태그" : "8. 관심사 태그"}</span>
              <small>{selectedTags.length}/6 선택</small>
            </div>
            <div className="ai-match-tag-grid ai-match-tag-grid--register">
              {REGISTRATION_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={isSelected}
                    className={`ai-match-tag-chip${isSelected ? " is-selected" : ""}`}
                    onClick={() => toggleTag(tag)}
                  >
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="ai-match-field">
            <div className="ai-match-field-head">
              <span>{isEditingProfile ? "6. 자기소개" : "9. 자기소개"}</span>
              <small>{intro.length}/120</small>
            </div>
            {introMissing ? <small className="ai-match-field-error">자기소개를 입력해 주세요.</small> : null}
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
          {consentMissing ? (
            <small className="ai-match-field-error">프로필 공개 동의가 필요합니다.</small>
          ) : null}
        </section>

        <button
          type="submit"
          className={`ai-match-primary-button ai-match-primary-button--form${registerSubmitDisabled ? " is-form-disabled" : ""}`}
          disabled={registerSubmitDisabled}
        >
          <span className="ai-match-primary-button__icon">
            <IconHeartFilled className="h-4 w-4" />
          </span>
          <span className="ai-match-primary-button__label">
            {submitting ? (isEditingProfile ? "수정 중..." : "등록 중...") : converting ? "AI 변환 중..." : isEditingProfile ? "수정 저장" : "등록하기"}
          </span>
        </button>
          </>
        )}
      </form>
    );
  }

  function renderPeopleScreen() {
    if (!accessProfile) {
      return (
        <div className="ai-match-flow">
          <section className="ai-match-empty-card">
            <strong>등록된 사람 목록은 닉네임과 PIN 인증 후 볼 수 있습니다.</strong>
            <p>프로필을 등록한 닉네임과 PIN을 입력하면 다른 참가자 목록과 데이트 신청 화면이 열립니다.</p>
            <button type="button" className="ai-match-secondary-button" onClick={() => openAccessModal("intro")}>
              닉네임 + PIN으로 입장
            </button>
          </section>
        </div>
      );
    }

    return (
      <div className="ai-match-flow">
        <section className="ai-match-discovery-card">
          <div className="ai-match-field ai-match-field--compact ai-match-profile-filter-field">
            <div className="ai-match-field-head">
              <span>프로필 필터</span>
            </div>
            <div className="ai-match-filter-bar ai-match-filter-bar--inside">
              {PROFILE_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`ai-match-filter-chip ai-match-filter-chip--${getFilterTone(filter)}${activeFilter === filter ? " is-active" : ""}`}
                  style={activeFilter === filter ? ACTIVE_FILTER_TAG_STYLE : undefined}
                  aria-pressed={activeFilter === filter}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <label className="search-field ai-match-search-field">
            <IconSearch className="h-4 w-4" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="닉네임, 소개, 장소, MBTI 검색"
            />
          </label>

          <label className="ai-match-field ai-match-field--compact">
            <div className="ai-match-field-head">
              <span>MBTI 필터</span>
            </div>
            <select value={peopleMbtiFilter} onChange={(event) => setPeopleMbtiFilter(cleanMbtiValue(event.target.value))}>
              <option value="">전체</option>
              {MBTI_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="ai-match-field ai-match-field--compact">
            <div className="ai-match-field-head">
              <span>관심사 필터</span>
              <small>{peopleTagFilters.length ? `${peopleTagFilters.length}개 선택` : "복수 선택 가능"}</small>
            </div>
            <div className="ai-match-tag-grid ai-match-tag-grid--filter">
              {REGISTRATION_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`ai-match-tag-chip${peopleTagFilters.includes(tag) ? " is-selected" : ""}`}
                  style={peopleTagFilters.includes(tag) ? ACTIVE_FILTER_TAG_STYLE : undefined}
                  onClick={() => togglePeopleTagFilter(tag)}
                >
                  <span>{tag}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="ai-match-list-meta">
          <strong>{loading ? "불러오는 중..." : `${filteredProfiles.length}명`}</strong>
          <span>AI 프로필이 준비된 사람만 보여줘요.</span>
        </section>

        {filteredProfiles.length ? (
          <div className="ai-match-profile-list">
            {filteredProfiles.map((profile) => {
              const isFavorite = isFavoriteProfile(profile.id);
              const isTagsExpanded = expandedTagProfileIds.includes(profile.id);
              const hasExtraTags = profile.tags.length > 3;
              const visibleTags = isTagsExpanded || !hasExtraTags ? profile.tags : profile.tags.slice(0, 2);
              const sentRequest = latestSentRequestMap.get(profile.id);
              const requestStatusLabel = sentRequest ? getRequestStatusLabel(sentRequest.status, sentRequest.statusReason) : "";
              return (
                <article key={profile.id} className={`ai-match-person-card ai-match-person-card--${profile.tone}`}>
                  <button
                    type="button"
                    className={`ai-match-favorite-button${isFavorite ? " ai-match-favorite-button--active" : ""}`}
                    aria-label={isFavorite ? "관심 목록에서 제거" : "관심 목록에 추가"}
                    aria-pressed={isFavorite}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleFavorite(profile.id);
                    }}
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
                        <em>{profile.mbti ? `${profile.genderLabel} · ${profile.mbti}` : profile.genderLabel}</em>
                        <strong>
                          {profile.nickname}
                          <span />
                        </strong>
                        <small>{profile.meetPlace || "축제 부스 근처"}</small>
                        <p>{profile.summary}</p>
                      </button>

                      <div className="ai-match-person-footer">
                        <div className="ai-match-inline-tags">
                          {shouldShowPeopleRequestStatus(sentRequest?.status) ? (
                            <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(sentRequest.status, sentRequest.statusReason)}`}>
                              신청 {requestStatusLabel}
                            </span>
                          ) : null}
                          {visibleTags.map((tag) => (
                            <span key={`${profile.id}-${tag}`}>{tag}</span>
                          ))}
                          {hasExtraTags ? (
                            <button
                              type="button"
                              className="ai-match-inline-tags__toggle"
                              onClick={() => toggleExpandedTags(profile.id)}
                            >
                              {isTagsExpanded ? "접기" : `+${profile.tags.length - 2}`}
                            </button>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="ai-match-request-button ai-match-request-button--card"
                          onClick={() => openProfile(profile)}
                        >
                          <span className="ai-match-request-button__icon">
                            <IconHeart className="h-4 w-4" />
                          </span>
                          <span className="ai-match-request-button__label">
                            {sentRequest && sentRequest.status === "PENDING"
                              ? "신청 완료"
                              : sentRequest && sentRequest.status === "REJECTED"
                                ? "다시 신청"
                                : sentRequest && sentRequest.status === "ACCEPTED"
                                  ? "수락 상태 보기"
                                  : "데이트 신청"}
                          </span>
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
            <strong>{loading ? "프로필을 불러오는 중입니다." : activeFilter === "좋아요" ? "좋아요한 프로필이 없습니다." : "아직 등록된 프로필이 없습니다."}</strong>
            <p>{loading ? "잠시만 기다려 주세요." : activeFilter === "좋아요" ? "하트를 누른 프로필만 여기에서 모아볼 수 있어요." : "첫 번째 프로필을 등록하고 처음 화면을 채워보세요."}</p>
            {!loading ? (
              <button type="button" className="ai-match-secondary-button" onClick={startNewRegistration}>
                프로필 등록하러 가기
              </button>
            ) : null}
          </section>
        )}
      </div>
    );
  }

  function renderMeetupPanel(request) {
    if (!accessProfile) return null;
    if (!["ACCEPTED", "PROPOSED", "CONFIRMED"].includes(request.status)) return null;

    return (
      <div className="ai-match-meetup-box">
        <div className="ai-match-meetup-box__head">
          <strong>매치 성사</strong>
          <div className="ai-match-meetup-box__route">
            <span>총학생회 부스</span>
            <button
              type="button"
              className="ai-match-map-icon-button"
              onClick={openMeetPlaceMap}
              aria-label="총학생회 부스 카카오맵 길찾기"
              title="카카오맵 길찾기"
            >
              <IconMapPin className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="ai-match-meetup-box__summary">
          관리자의 연락을 받은 뒤 총학생회 부스 앞으로 와 주세요. 양쪽 연락처는 관리자에게만 공개됩니다.
        </p>
      </div>
    );
  }

  function renderMyScreen() {
    if (!accessProfile) {
      return (
        <div className="ai-match-flow">
          <section className="ai-match-empty-card">
            <strong>MY는 PIN으로 잠금되어 있습니다.</strong>
            <p>프로필을 등록한 닉네임과 PIN을 입력하면 내 프로필을 관리할 수 있어요.</p>
            <button type="button" className="ai-match-secondary-button" onClick={() => openAccessModal("my")}>
              닉네임 + PIN으로 열기
            </button>
          </section>
        </div>
      );
    }

    const parsed = parseProfileCopy(accessProfile.intro);
    const profileLabel = parsed.mbti
      ? `${getProfileGenderLabel(accessProfile.gender)} · ${parsed.mbti}`
      : getProfileGenderLabel(accessProfile.gender);
    const visibleTags = parsed.tags.length ? parsed.tags : getFallbackTags(accessProfile).slice(0, 3);

    return (
      <div className="ai-match-flow">
        <section className="ai-match-request-summary">
          <strong>{accessProfile.nickname}님의 MY</strong>
          <p>내 프로필, 사진, 로그인 상태를 여기서 관리합니다.</p>
          <span>{profileLabel}</span>
        </section>

        <section className="ai-match-section-card ai-match-my-card">
          <div className="ai-match-my-profile">
            <div className="ai-match-my-photo">
              {accessProfile.generatedImageUrl ? (
                <img src={resolveApiAssetUrl(accessProfile.generatedImageUrl)} alt="" />
              ) : (
                <IconUsers className="h-8 w-8" />
              )}
            </div>
            <div className="ai-match-my-copy">
              <em>{profileLabel}</em>
              <strong>{accessProfile.nickname}</strong>
              <p>{parsed.summary}</p>
              <div className="ai-match-inline-tags">
                {visibleTags.map((tag) => (
                  <span key={`my-${tag}`}>{tag}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="ai-match-my-stats">
            <span>
              <strong>{accessRequests.length}</strong>
              <small>받은 요청</small>
            </span>
            <span>
              <strong>{accessSentRequests.length}</strong>
              <small>보낸 요청</small>
            </span>
          </div>

          <div className="ai-match-request-actions">
            <button type="button" className="ai-match-secondary-button" onClick={startEditingProfile}>
              프로필 수정
            </button>
            <button type="button" className="ai-match-secondary-button ai-match-secondary-button--danger" onClick={handleDeleteProfile} disabled={submitting}>
              프로필 삭제
            </button>
            <button
              type="button"
              className="ai-match-secondary-button"
              onClick={() => {
                clearAccessSession({ resetForm: true });
                setActiveScreen("intro");
              }}
            >
              로그아웃
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderRequestsScreen() {
    if (!accessProfile) {
      return (
        <div className="ai-match-flow">
          <section className="ai-match-empty-card">
            <strong>신청함은 PIN으로 잠금되어 있습니다.</strong>
            <p>프로필을 등록한 닉네임과 PIN을 입력하면 받은 요청과 보낸 요청을 확인할 수 있어요.</p>
            <button type="button" className="ai-match-secondary-button" onClick={() => openAccessModal("requests")}>
              신청함 잠금 해제
            </button>
          </section>
        </div>
      );
    }

    return (
      <div className="ai-match-flow">
        <section className="ai-match-request-summary">
          <strong>{accessProfile.nickname}님의 신청함</strong>
          <p>받은 요청과 보낸 요청 상태가 실시간으로 반영됩니다.</p>
          <span>{accessRequests.length + accessSentRequests.length}건</span>
        </section>

        <section className="ai-match-filter-bar">
          <button
            type="button"
            className={`ai-match-filter-chip ai-match-filter-chip--violet${requestTab === "received" ? " is-active" : ""}`}
            style={requestTab === "received" ? ACTIVE_FILTER_TAG_STYLE : undefined}
            onClick={() => setRequestTab("received")}
          >
            받은 요청
          </button>
          <button
            type="button"
            className={`ai-match-filter-chip ai-match-filter-chip--violet${requestTab === "sent" ? " is-active" : ""}`}
            style={requestTab === "sent" ? ACTIVE_FILTER_TAG_STYLE : undefined}
            onClick={() => setRequestTab("sent")}
          >
            보낸 요청
          </button>
        </section>

        {requestTab === "received" ? (
          accessRequests.length ? (
            <div className="ai-match-request-history">
              {accessRequests.map((request) => (
                <article key={request.id} className="ai-match-request-history-card">
                  <div className="ai-match-request-history-head">
                    <strong>{request.requesterNickname}</strong>
                    <small>{formatRequestTime(request.createdAt)}</small>
                  </div>
                  <div className="ai-match-request-history-status">
                    <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(request.status, request.statusReason)}`}>
                      {getRequestStatusLabel(request.status, request.statusReason)}
                    </span>
                  </div>
                  <p>{isProfileDeletedRequest(request) ? "상대가 계정을 삭제했습니다." : `${request.requesterNickname}님이 데이트 신청을 보냈어요.`}</p>
                  <span>
                    <IconMapPin className="h-4 w-4" />
                    {["ACCEPTED", "PROPOSED", "CONFIRMED"].includes(request.status) ? MEET_PLACES[0] : request.meetPlace}
                  </span>
                  <em>{request.message}</em>
                  {renderMeetupPanel(request)}
                  {request.status === "PENDING" ? (
                    <div className="ai-match-request-actions">
                      <button
                        type="button"
                        className="ai-match-secondary-button"
                        onClick={() => handleAcceptRequest(request.id)}
                        disabled={submitting}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        className="ai-match-secondary-button ai-match-secondary-button--danger"
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={submitting}
                      >
                        거절
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <section className="ai-match-empty-card">
              <strong>아직 받은 요청이 없습니다.</strong>
              <p>공개된 내 프로필로 도착한 신청이 생기면 여기에 표시됩니다.</p>
            </section>
          )
        ) : accessSentRequests.length ? (
          <div className="ai-match-request-history">
            {accessSentRequests.map((request) => (
              <article key={request.id} className="ai-match-request-history-card">
                <div className="ai-match-request-history-head">
                  <strong>{request.profileNickname}</strong>
                  <small>{formatRequestTime(request.createdAt)}</small>
                </div>
                <div className="ai-match-request-history-status">
                  <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(request.status, request.statusReason)}`}>
                    {getRequestStatusLabel(request.status, request.statusReason)}
                  </span>
                </div>
                <p>{isProfileDeletedRequest(request) ? "상대가 계정을 삭제했습니다." : `${request.profileNickname}님에게 보낸 데이트 신청입니다.`}</p>
                <span>
                  <IconMapPin className="h-4 w-4" />
                  {["ACCEPTED", "PROPOSED", "CONFIRMED"].includes(request.status) ? MEET_PLACES[0] : request.meetPlace}
                </span>
                <em>{request.message}</em>
                {renderMeetupPanel(request)}
                {request.status === "PENDING" ? (
                  <div className="ai-match-request-actions">
                    <button
                      type="button"
                      className="ai-match-secondary-button ai-match-secondary-button--danger"
                      onClick={() => handleCancelRequest(request.id)}
                      disabled={submitting}
                    >
                      신청 취소
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <section className="ai-match-empty-card">
            <strong>아직 보낸 요청이 없습니다.</strong>
            <p>처음 화면에서 마음에 드는 상대에게 먼저 신청해 보세요.</p>
          </section>
        )}
      </div>
    );
  }

  function renderDetailScreen() {
    if (!selectedDetailProfile) return null;
    const detailRequestStatus = selectedDetailRequest?.status || "";

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
          {selectedDetailProfile.mbti ? <em>{selectedDetailProfile.mbti}</em> : null}
          <small>{selectedDetailProfile.meetPlace || "축제 부스 주변에서 만나고 싶어요."}</small>
          <p>{selectedDetailProfile.summary}</p>
          <div className="ai-match-inline-tags">
            {shouldShowPeopleRequestStatus(selectedDetailRequest?.status) ? (
              <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(selectedDetailRequest.status, selectedDetailRequest.statusReason)}`}>
                신청 {getRequestStatusLabel(selectedDetailRequest.status, selectedDetailRequest.statusReason)}
              </span>
            ) : null}
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
              <small>인증 완료</small>
            </div>
            <input
              value={accessProfile?.nickname || requesterNickname}
              maxLength={12}
              readOnly
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
            disabled={submitting || !canSendRequest(detailRequestStatus)}
          >
            {submitting ? (
              <span className="ai-match-primary-button__icon">
                <IconSend className="h-4 w-4" />
              </span>
            ) : null}
            <span className="ai-match-primary-button__label">
              {submitting
                ? "전송 중..."
                : detailRequestStatus === "PENDING"
                  ? "신청 완료"
                  : detailRequestStatus === "ACCEPTED"
                    ? "수락됨"
                    : selectedDetailRequest && (detailRequestStatus === "REJECTED" || detailRequestStatus === "CANCELED")
                      ? "다시 신청 보내기"
                      : "데이트 신청 보내기"}
            </span>
            {!submitting ? (
              <span className="ai-match-primary-button__accent" aria-hidden="true">
                <IconSparkles className="h-4 w-4" />
              </span>
            ) : null}
          </button>
          {selectedDetailRequest?.status === "PENDING" ? (
            <button
              type="button"
              className="ai-match-secondary-button ai-match-secondary-button--danger"
              onClick={() => handleCancelRequest(selectedDetailRequest.id)}
              disabled={submitting}
            >
              신청 취소
            </button>
          ) : null}
          {["ACCEPTED", "PROPOSED", "CONFIRMED"].includes(detailRequestStatus) ? (
            <p className="ai-match-note">
              <IconShield className="h-4 w-4" />
              매치가 성사되면 관리자가 양쪽 연락처로 시간과 장소를 안내합니다.
            </p>
          ) : null}
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
            className={`ai-match-topbar-favorite${isFavoriteProfile(selectedProfile.id) ? " ai-match-topbar-favorite--active" : ""}`}
            aria-label={isFavoriteProfile(selectedProfile.id) ? "관심 목록에서 제거" : "관심 목록에 추가"}
            aria-pressed={isFavoriteProfile(selectedProfile.id)}
            onClick={() => toggleFavorite(selectedProfile.id)}
          >
            {isFavoriteProfile(selectedProfile.id) ? (
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

        {renderLiveNotice()}

        {renderDetailScreen()}
      </section>
    );
  }

  return (
    <section
      className={`uni-page ai-match-page ai-match-redesigned ai-match-redesigned--${activeScreen}${accessProfile ? " ai-match-redesigned--signed-in" : ""}`}
      data-i18n-skip
    >
      <header className="ai-match-topbar">
        {activeScreen === "intro" ? (
          <span className="ai-match-topbar-spacer" aria-hidden="true" />
        ) : (
          <button type="button" aria-label="처음으로 돌아가기" onClick={() => setActiveScreen("intro")}>
            <IconArrowLeft className="h-5 w-5" />
          </button>
        )}

        <h1>{activeScreenTitle}</h1>

        {activeScreen === "requests" ? (
          <button type="button" aria-label="새로고침" onClick={handleRequestsRefresh} disabled={loading || accessSubmitting}>
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

      {renderLiveNotice()}

      {activeScreen === "intro" ? renderIntroScreen() : null}
      {activeScreen === "register" ? renderRegisterScreen() : null}
      {activeScreen === "requests" ? renderRequestsScreen() : null}
      {activeScreen === "my" ? renderMyScreen() : null}

      {shouldShowBottomNav ? (
        <nav className="ai-match-bottom-nav" aria-label="AI 소개팅 화면 전환">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`ai-match-bottom-tab${isActive ? " is-active" : ""}`}
                onClick={() => {
                  if (item.id === "intro") {
                    setActiveScreen("intro");
                    return;
                  }
                  if (item.id === "requests") {
                    if (accessProfile) {
                      setLiveNotice(null);
                      markRequestNoticesSeen();
                      setActiveScreen("requests");
                    } else {
                      openAccessModal("requests");
                    }
                    return;
                  }
                  if (item.id === "my") {
                    if (accessProfile) {
                      setActiveScreen("my");
                    } else {
                      openAccessModal("my");
                    }
                    return;
                  }
                  setActiveScreen(item.id);
                }}
              >
                <span className="ai-match-bottom-tab-icon">
                  <Icon className="h-5 w-5" />
                  {item.id === "requests" && unreadRequestCount > 0 ? (
                    <strong className="ai-match-nav-badge">{unreadRequestCount > 9 ? "9+" : unreadRequestCount}</strong>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {accessModalOpen ? (
        <div className="ai-match-modal" role="dialog" aria-modal="true" aria-labelledby="ai-match-access-title">
          <form ref={accessDialogRef} className="ai-match-dialog" onSubmit={handleAccessSubmit}>
            <button type="button" className="ai-match-close" onClick={closeAccessModal}>
              닫기
            </button>
            <div className="ai-match-section-head">
              <h2 id="ai-match-access-title">{getAccessModalTitle()}</h2>
              <span>닉네임 + PIN</span>
            </div>
            <label className="ai-match-field">
              <div className="ai-match-field-head">
                <span>닉네임</span>
              </div>
              <input
                ref={accessNicknameInputRef}
                value={accessNickname}
                maxLength={12}
                onChange={(event) => setAccessNickname(event.target.value)}
                placeholder="등록한 닉네임"
              />
              {accessAttempted && accessNicknameMissing ? <small className="ai-match-field-error">닉네임을 입력해 주세요.</small> : null}
            </label>
            <label className="ai-match-field">
              <div className="ai-match-field-head">
                <span>PIN</span>
                <small>4~6자리 숫자</small>
              </div>
              <input
                value={accessPin}
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => {
                  const nextValue = event.target.value.replace(/\D/g, "");
                  if (PIN_INPUT_PATTERN.test(nextValue)) {
                    setAccessPin(nextValue);
                  }
                }}
                placeholder="예) 1234"
              />
              {accessAttempted && accessPinMissing ? <small className="ai-match-field-error">PIN을 입력해 주세요.</small> : null}
            </label>
            <button type="submit" className="ai-match-primary-button ai-match-primary-button--sheet" disabled={accessSubmitting}>
              <span className="ai-match-primary-button__label">
                {getAccessSubmitLabel()}
              </span>
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
