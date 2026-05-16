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
  IconSearch,
  IconSend,
  IconShield,
  IconSparkles,
  IconUsers,
  IconX,
} from "../components/UxIcons";
import {
  acceptAiMatchRequest,
  accessAiMatchProfile,
  cancelAiMatchRequest,
  createAiMatchImagePreview,
  deleteAiMatchProfile,
  createAiMatchProfile,
  createAiMatchRequest,
  rejectAiMatchRequest,
  resolveApiAssetUrl,
  updateAiMatchProfile,
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

const ACTIVE_FILTER_TAG_STYLE = {
  borderColor: "#d8b4fe",
  background: "linear-gradient(180deg, rgba(253, 244, 255, 0.98), rgba(250, 245, 255, 0.96))",
  color: "#64748b",
  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.92), 0 10px 22px rgba(216, 180, 254, 0.22)",
  filter: "none",
};
const PIN_INPUT_PATTERN = /^\d{0,6}$/;
const REQUEST_STATUS_LABELS = {
  PENDING: "대기중",
  ACCEPTED: "수락",
  REJECTED: "거절",
  CANCELED: "취소됨",
};

function cleanTagValue(tag) {
  return `${tag || ""}`.replace(/^#/, "").trim().slice(0, 8);
}

function cleanMbtiValue(mbti) {
  const normalized = `${mbti || ""}`.trim().toUpperCase();
  return MBTI_OPTIONS.includes(normalized) ? normalized : "";
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

function getRequestStatusLabel(status) {
  return REQUEST_STATUS_LABELS[status] || status || "대기중";
}

function getRequestStatusTone(status) {
  if (status === "ACCEPTED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "CANCELED") return "muted";
  return "pending";
}

function canSendRequest(status) {
  return !status || status === "REJECTED" || status === "CANCELED";
}

function buildLatestSentRequestMap(sentRequests) {
  return (sentRequests || []).reduce((map, request) => {
    if (!map.has(request.profileId)) {
      map.set(request.profileId, request);
    }
    return map;
  }, new Map());
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

export default function AiMatchPage() {
  const [activeScreen, setActiveScreen] = useState("intro");
  const [profiles, setProfiles] = useState([]);
  const [accessProfile, setAccessProfile] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [accessSentRequests, setAccessSentRequests] = useState([]);
  const [accessNickname, setAccessNickname] = useState("");
  const [accessPin, setAccessPin] = useState("");
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  const [accessTargetScreen, setAccessTargetScreen] = useState("requests");
  const [requestTab, setRequestTab] = useState("received");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
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
  const [activeFilter, setActiveFilter] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [peopleTagFilters, setPeopleTagFilters] = useState([]);
  const [peopleMbtiFilter, setPeopleMbtiFilter] = useState("");
  const [favoriteProfileIds, setFavoriteProfileIds] = useState([]);
  const [expandedTagProfileIds, setExpandedTagProfileIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [registerAttempted, setRegisterAttempted] = useState(false);
  const [accessAttempted, setAccessAttempted] = useState(false);

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
      (isEditingProfile || (/^\d{4,6}$/.test(pin) && pin === pinConfirm)),
  );
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
      matchesDiscoveryFilters(profile, searchQuery, peopleMbtiFilter, peopleTagFilters),
  );
  const latestSentRequestMap = buildLatestSentRequestMap(accessSentRequests);
  const selectedDetailProfile = selectedProfile
    ? buildDecoratedProfiles([selectedProfile])[0]
    : null;
  const selectedDetailRequest = selectedProfile ? latestSentRequestMap.get(selectedProfile.id) : null;

  async function loadData() {
    setLoading(false);
  }

  useEffect(() => {
    setLoading(false);
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

  useEffect(() => {
    if (!accessProfile || !accessNickname || !accessPin || isEditingProfile) return undefined;

    const intervalId = window.setInterval(() => {
      loadAccessProfile(accessNickname, accessPin, activeScreen).catch(() => {});
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [accessProfile, accessNickname, accessPin, activeScreen, isEditingProfile]);

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

  async function loadAccessProfile(nextNickname, nextPin, nextScreen = "requests") {
    const response = await accessAiMatchProfile(nextNickname, nextPin);
    const nextProfiles = Array.isArray(response.profiles) ? response.profiles : [];
    setAccessProfile(response.profile || null);
    setAccessRequests(Array.isArray(response.receivedRequests) ? response.receivedRequests : []);
    setAccessSentRequests(Array.isArray(response.sentRequests) ? response.sentRequests : []);
    setProfiles(nextProfiles);
    setAccessNickname(nextNickname);
    setAccessPin(nextPin);
    setRequesterNickname(response.profile?.nickname || nextNickname);
    if (selectedProfile) {
      setSelectedProfile(nextProfiles.find((profile) => profile.id === selectedProfile.id) || null);
    }
    setActiveScreen(nextScreen);
    setAccessModalOpen(false);
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
      await loadAccessProfile(accessNickname.trim(), accessPin.trim(), accessTargetScreen);
      setSuccessMessage("신청함 잠금이 해제되었습니다.");
    } catch (error) {
      setErrorMessage(error.message || "프로필 인증에 실패했습니다.");
    } finally {
      setAccessSubmitting(false);
    }
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
    setRegisterAttempted(false);
    setEditingProfileId(null);
    setNickname("");
    setPin("");
    setPinConfirm("");
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

  function startEditingProfile() {
    if (!accessProfile) return;
    const parsed = parseProfileCopy(accessProfile.intro);
    setRegisterAttempted(false);
    setEditingProfileId(accessProfile.id);
    setNickname(accessProfile.nickname || "");
    setPin("");
    setPinConfirm("");
    setGender(accessProfile.gender || "여성");
    setMbti(parsed.mbti || "");
    setIntro(parsed.summary || "");
    setPlace(accessProfile.meetPlace || MEET_PLACES[0]);
    setSelectedTags(parsed.tags || []);
    setOriginalImageUrl(accessProfile.originalImageUrl || "");
    setGeneratedImageUrl(accessProfile.generatedImageUrl || "");
    setPreviewUrl(resolveApiAssetUrl(accessProfile.generatedImageUrl || ""));
    setConsent(true);
    setConvertSeconds(0);
    setSelectedProfile(null);
    setActiveScreen("register");
    setErrorMessage("");
    setSuccessMessage("");
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
    setRegisterAttempted(true);
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
          meetPlace: place,
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
            meetPlace: place,
            consent,
            originalImageUrl,
            generatedImageUrl,
          },
          null,
        );

        resetRegistrationForm();
        await loadAccessProfile(createdNickname, createdPin, "people");
        setSuccessMessage("AI 프로필이 등록되었습니다. 등록된 사람들 화면에서 바로 확인해 보세요.");
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
      openAccessModal("people");
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
      setSelectedProfile(null);
      setRequestTab("sent");
      setSuccessMessage("데이트 신청이 전송되었습니다.");
      window.alert("데이트 신청이 완료되었습니다.");
    } catch (error) {
      setErrorMessage(error.message || "데이트 신청에 실패했습니다.");
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
      setProfiles((current) => current.filter((item) => item.id !== accessProfile.id));
      setAccessProfile(null);
      setAccessRequests([]);
      setAccessSentRequests([]);
      setProfiles([]);
      setAccessNickname("");
      setAccessPin("");
      setRequesterNickname("");
      resetRegistrationForm();
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
      await loadAccessProfile(accessNickname, accessPin, "requests");
    } catch (error) {
      setErrorMessage(error.message || "신청함을 새로고침하지 못했습니다.");
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
      setErrorMessage(error.message || "데이트 신청 수락에 실패했습니다.");
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
      setErrorMessage(error.message || "데이트 신청 거절에 실패했습니다.");
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
      setErrorMessage(error.message || "데이트 신청 취소에 실패했습니다.");
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
          onClick={() => openAccessModal("people")}
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
        {isEditingProfile ? (
          <section className="ai-match-section-card">
            <div className="ai-match-section-head">
              <h2>내 프로필 수정</h2>
              <span>{accessProfile?.nickname}</span>
            </div>
            <p className="ai-match-note">신청함에서 인증된 PIN으로 수정이 진행됩니다.</p>
          </section>
        ) : null}

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
          {registerAttempted && imageMissing ? (
            <small className="ai-match-field-error">프로필 사진을 먼저 업로드해 주세요.</small>
          ) : null}
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
            {registerAttempted && nicknameMissing ? <small className="ai-match-field-error">닉네임을 입력해 주세요.</small> : null}
            {hasDuplicateNickname ? <small className="ai-match-field-error">이미 사용 중인 닉네임입니다.</small> : null}
          </label>

          {!isEditingProfile ? (
            <>
              <label className="ai-match-field">
                <div className="ai-match-field-head">
                  <span>3. PIN</span>
                  <small>4~6자리 숫자</small>
                </div>
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
                {registerAttempted && pinMissing ? <small className="ai-match-field-error">PIN을 입력해 주세요.</small> : null}
                {pinInvalid ? <small className="ai-match-field-error">PIN은 4~6자리 숫자여야 합니다.</small> : null}
              </label>

              <label className="ai-match-field">
                <div className="ai-match-field-head">
                  <span>4. PIN 확인</span>
                </div>
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
                {registerAttempted && pinConfirmMissing ? <small className="ai-match-field-error">PIN 확인을 입력해 주세요.</small> : null}
                {pinMismatch ? <small className="ai-match-field-error">PIN이 서로 일치하지 않습니다.</small> : null}
              </label>
            </>
          ) : null}

          <div className="ai-match-field">
            <div className="ai-match-field-head">
              <span>{isEditingProfile ? "3. 성별" : "5. 성별"}</span>
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
              <span>{isEditingProfile ? "4. MBTI" : "6. MBTI"}</span>
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
              <span>{isEditingProfile ? "5. 관심사 태그" : "7. 관심사 태그"}</span>
              <small>{selectedTags.length}/6 선택</small>
            </div>
            <div className="ai-match-tag-grid">
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
              <span>{isEditingProfile ? "6. 자기소개" : "8. 자기소개"}</span>
              <small>{intro.length}/120</small>
            </div>
            <textarea
              value={intro}
              maxLength={120}
              onChange={(event) => setIntro(event.target.value)}
              placeholder="나를 간단히 소개해주세요. 예) 웃음이 많고 공원 산책을 좋아해요!"
            />
            {registerAttempted && introMissing ? <small className="ai-match-field-error">자기소개를 입력해 주세요.</small> : null}
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
          {registerAttempted && consentMissing ? (
            <small className="ai-match-field-error">프로필 공개 동의가 필요합니다.</small>
          ) : null}
        </section>

        <button
          type="submit"
          className="ai-match-primary-button ai-match-primary-button--form"
          disabled={submitting || converting}
        >
          <span className="ai-match-primary-button__icon">
            <IconHeart className="h-4 w-4" />
          </span>
          <span className="ai-match-primary-button__label">
            {submitting ? (isEditingProfile ? "수정 중..." : "등록 중...") : converting ? "AI 변환 중..." : isEditingProfile ? "수정 저장" : "등록하기"}
          </span>
        </button>
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
            <button type="button" className="ai-match-secondary-button" onClick={() => openAccessModal("people")}>
              닉네임 + PIN으로 입장
            </button>
          </section>
        </div>
      );
    }

    return (
      <div className="ai-match-flow">
        <section className="ai-match-filter-bar">
          {PROFILE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`ai-match-filter-chip ai-match-filter-chip--${getFilterTone(filter)}${activeFilter === filter ? " is-active" : ""}`}
              style={activeFilter === filter ? ACTIVE_FILTER_TAG_STYLE : undefined}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </section>

        <section className="ai-match-discovery-card">
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
              const isFavorite = favoriteProfileIds.includes(profile.id);
              const isTagsExpanded = expandedTagProfileIds.includes(profile.id);
              const hasExtraTags = profile.tags.length > 3;
              const visibleTags = isTagsExpanded || !hasExtraTags ? profile.tags : profile.tags.slice(0, 2);
              const sentRequest = latestSentRequestMap.get(profile.id);
              const requestStatusLabel = sentRequest ? getRequestStatusLabel(sentRequest.status) : "";
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
                          {sentRequest && sentRequest.status !== "CANCELED" ? (
                            <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(sentRequest.status)}`}>
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
                              ? "신청 상태 보기"
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
    if (!accessProfile) {
      return (
        <div className="ai-match-flow">
          <section className="ai-match-empty-card">
            <strong>신청함은 PIN으로 잠금되어 있습니다.</strong>
            <p>프로필을 등록한 닉네임과 PIN을 입력하면 내 신청함과 프로필 관리 화면을 열 수 있어요.</p>
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

        <section className="ai-match-section-card">
          <div className="ai-match-section-head">
            <h2>내 프로필 관리</h2>
            <span>
              {(() => {
                const parsed = parseProfileCopy(accessProfile.intro);
                return parsed.mbti
                  ? `${getProfileGenderLabel(accessProfile.gender)} · ${parsed.mbti}`
                  : getProfileGenderLabel(accessProfile.gender);
              })()}
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
                setAccessProfile(null);
                setAccessRequests([]);
                setAccessSentRequests([]);
                setProfiles([]);
                setAccessNickname("");
                setAccessPin("");
                setRequesterNickname("");
                openAccessModal("requests");
              }}
            >
              다른 닉네임으로 열기
            </button>
          </div>
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
                    <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(request.status)}`}>
                      {getRequestStatusLabel(request.status)}
                    </span>
                  </div>
                  <p>{request.requesterNickname}님이 데이트 신청을 보냈어요.</p>
                  <span>
                    <IconMapPin className="h-4 w-4" />
                    {request.meetPlace}
                  </span>
                  <em>{request.message}</em>
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
                  <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(request.status)}`}>
                    {getRequestStatusLabel(request.status)}
                  </span>
                </div>
                <p>{request.profileNickname}님에게 보낸 데이트 신청입니다.</p>
                <span>
                  <IconMapPin className="h-4 w-4" />
                  {request.meetPlace}
                </span>
                <em>{request.message}</em>
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
            <p>등록된 사람들에서 마음에 드는 상대에게 먼저 신청해 보세요.</p>
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
            {selectedDetailRequest && selectedDetailRequest.status !== "CANCELED" ? (
              <span className={`ai-match-request-status ai-match-request-status--${getRequestStatusTone(selectedDetailRequest.status)}`}>
                신청 {getRequestStatusLabel(selectedDetailRequest.status)}
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
                  ? "신청 대기중"
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
                onClick={() => {
                  if (item.id === "people") {
                    if (accessProfile) {
                      setActiveScreen("people");
                    } else {
                      openAccessModal("people");
                    }
                    return;
                  }
                  if (item.id === "requests") {
                    if (accessProfile) {
                      setActiveScreen("requests");
                    } else {
                      openAccessModal("requests");
                    }
                    return;
                  }
                  setActiveScreen(item.id);
                }}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {accessModalOpen ? (
        <div className="ai-match-modal" role="dialog" aria-modal="true" aria-labelledby="ai-match-access-title">
          <form className="ai-match-dialog" onSubmit={handleAccessSubmit}>
            <button type="button" className="ai-match-close" onClick={closeAccessModal}>
              닫기
            </button>
            <div className="ai-match-section-head">
              <h2 id="ai-match-access-title">신청함 잠금 해제</h2>
              <span>닉네임 + PIN</span>
            </div>
            <label className="ai-match-field">
              <div className="ai-match-field-head">
                <span>닉네임</span>
              </div>
              <input
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
                {accessSubmitting ? "확인 중..." : "신청함 열기"}
              </span>
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
