import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import {
  createLostItem,
  createLostItemStream,
  deleteLostItem,
  createStaffStream,
  fetchLostItems,
  fetchStaffBootstrap,
  loginStaff,
  logoutStaff,
  translateText,
  updateLostItem,
  updateMyStaffStatus,
} from "../api";
import {
  IconAlert,
  IconBox,
  IconMapPin,
  IconShield,
  IconUsers,
} from "../components/UxIcons";
import { AJOU_CENTER } from "../utils/location";

const STAFF_TOKEN_KEY = "festflow_staff_token_v2";

const STATUS_META = {
  STANDBY: {
    label: "대기",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
    map: "#64748b",
  },
  MOVING: {
    label: "이동",
    chip: "bg-cyan-100 text-cyan-700 border-cyan-200",
    map: "#06b6d4",
  },
  ON_DUTY: {
    label: "업무중",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
    map: "#10b981",
  },
  URGENT: {
    label: "긴급",
    chip: "bg-rose-100 text-rose-700 border-rose-200",
    map: "#f43f5e",
  },
};

const QUICK_TASKS = [
  "입구 동선 안내",
  "대기열 정리",
  "현장 순찰",
  "분실물 대응",
  "무대 안전 관리",
  "긴급 호출 대기",
];

const LOST_ITEM_CATEGORIES = ["전자기기", "지갑/카드", "의류/잡화", "학생증", "기타"];

const LOST_ITEM_INITIAL_FORM = {
  title: "",
  description: "",
  category: "기타",
  foundLocation: "",
  finderContact: "",
};

const LOST_ITEM_STATUS_OPTIONS = [
  { value: "REGISTERED", label: "보관 중" },
  { value: "OWNER_CLAIMED", label: "주인 확인" },
  { value: "RETURNED", label: "반환 완료" },
];

const ALL_TEAM = "ALL";
const ALL_STATUS = "ALL";
const LOW_CONFIDENCE_THRESHOLD = 0.72;
const MAX_CONTEXT_TURNS = 3;
const STATUS_BOARD_ORDER = ["URGENT", "ON_DUTY", "MOVING", "STANDBY"];
const LOST_ITEM_MAX_FILE_SIZE = 10 * 1024 * 1024;
const MARKER_COLORS = ["#06b6d4", "#3b82f6", "#8b5cf6", "#14b8a6", "#f97316", "#ec4899", "#84cc16", "#f59e0b"];

function staffColorById(staffNo) {
  const text = `${staffNo || ""}`;
  const hash = text.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return MARKER_COLORS[hash % MARKER_COLORS.length];
}

function staffInitial(name) {
  const safe = `${name || ""}`.trim();
  if (!safe) return "?";
  return safe.slice(0, 1).toUpperCase();
}

function getFreshness(item, nowMs) {
  const updatedMs = item?.lastUpdatedAt ? Date.parse(item.lastUpdatedAt) : 0;
  if (!updatedMs) return { key: "offline", label: "오프라인", border: "#64748b" };
  const ageSec = Math.max(0, Math.floor((nowMs - updatedMs) / 1000));
  if (ageSec <= 30) {
    return { key: "realtime", label: "실시간", border: "#10b981" };
  }
  if (ageSec <= 120) {
    return { key: "delayed", label: "지연", border: "#f59e0b" };
  }
  return { key: "offline", label: "오프라인", border: "#64748b" };
}

function spreadOverlappingMarkers(staff) {
  const grouped = new Map();
  for (const item of staff) {
    const key = `${item.latitude.toFixed(5)}|${item.longitude.toFixed(5)}`;
    const bucket = grouped.get(key) || [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  const result = [];
  for (const bucket of grouped.values()) {
    if (bucket.length === 1) {
      result.push(bucket[0]);
      continue;
    }
    const offset = 0.00008;
    bucket.forEach((item, idx) => {
      const angle = (Math.PI * 2 * idx) / bucket.length;
      result.push({
        ...item,
        latitude: item.latitude + Math.sin(angle) * offset,
        longitude: item.longitude + Math.cos(angle) * offset,
      });
    });
  }
  return result;
}

function MapViewportController({ action, points, myPoint }) {
  const map = useMap();
  useEffect(() => {
    if (action === "fit-all") {
      if (!points.length) return;
      if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 18);
        return;
      }
      map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [28, 28] });
      return;
    }
    if (action === "focus-me" && myPoint) {
      map.setView([myPoint.latitude, myPoint.longitude], 19);
    }
  }, [action, points, myPoint, map]);
  return null;
}

const INTERPRETER_PRESETS = [
  {
    id: "restroom",
    label: "화장실 안내",
    ko: "화장실은 저쪽 출구 옆에 있습니다.",
    en: "The restroom is next to that exit.",
  },
  {
    id: "lostfound",
    label: "분실물 센터",
    ko: "분실물 센터는 본부 부스 옆에 있습니다.",
    en: "The lost-and-found center is next to the main booth.",
  },
  {
    id: "entrance",
    label: "입출구 안내",
    ko: "입구는 왼쪽이고 출구는 오른쪽입니다.",
    en: "The entrance is on the left and the exit is on the right.",
  },
  {
    id: "wait",
    label: "잠시 대기",
    ko: "잠시만 기다려 주세요. 바로 도와드릴게요.",
    en: "Please wait a moment. I will help you right away.",
  },
  {
    id: "follow",
    label: "안내 동행",
    ko: "안전하게 안내해 드릴게요. 저를 따라오세요.",
    en: "I will guide you safely. Please follow me.",
  },
];

function getSavedToken() {
  return localStorage.getItem(STAFF_TOKEN_KEY) || "";
}

function setSavedToken(token) {
  if (!token) {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    return;
  }
  localStorage.setItem(STAFF_TOKEN_KEY, token);
}

export default function StaffPage() {
  const [staffNoInput, setStaffNoInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffToken, setStaffToken] = useState(getSavedToken());

  const [me, setMe] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [booths, setBooths] = useState([]);
  const [notices, setNotices] = useState([]);

  const [taskDraft, setTaskDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const [lostItemForm, setLostItemForm] = useState(LOST_ITEM_INITIAL_FORM);
  const [lostItemFile, setLostItemFile] = useState(null);
  const [lostItemSaving, setLostItemSaving] = useState(false);
  const [lostItemMessage, setLostItemMessage] = useState("");
  const [lostItems, setLostItems] = useState([]);
  const [lostItemEditingId, setLostItemEditingId] = useState(null);
  const [lostItemEditDraft, setLostItemEditDraft] = useState(null);
  const [lostItemUpdating, setLostItemUpdating] = useState(false);
  const [lostItemDeletingId, setLostItemDeletingId] = useState(null);

  const [showLostForm, setShowLostForm] = useState(false);
  const [showTeamList, setShowTeamList] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showInterpreter, setShowInterpreter] = useState(false);

  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL_TEAM);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [interpreterBusy, setInterpreterBusy] = useState(false);
  const [interpreterMessage, setInterpreterMessage] = useState("");
  const [koSourceText, setKoSourceText] = useState("");
  const [enSourceText, setEnSourceText] = useState("");
  const [koToEnText, setKoToEnText] = useState("");
  const [enToKoText, setEnToKoText] = useState("");
  const [lastRecognitionConfidence, setLastRecognitionConfidence] = useState(null);
  const [interpreterHistory, setInterpreterHistory] = useState([]);
  const [interpreterLane, setInterpreterLane] = useState("koToEn");
  const [mapAction, setMapAction] = useState("idle");
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!staffToken) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    Promise.all([fetchStaffBootstrap(staffToken), fetchLostItems()])
      .then(([data, lostData]) => {
        if (!mounted) return;
        setMe(data.me);
        setStaffList(data.staff || []);
        setNotices(data.notices || []);
        setBooths(data.booths || []);
        setTaskDraft(data.me?.currentTask || "");
        setNoteDraft(data.me?.currentNote || "");
        setLostItems(lostData || []);
      })
      .catch(() => {
        if (!mounted) return;
        setSavedToken("");
        setStaffToken("");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [staffToken]);

  useEffect(() => {
    if (!staffToken) return undefined;

    const stream = createStaffStream();
    stream.addEventListener("staff", (event) => {
      try {
        const next = JSON.parse(event.data);
        const safe = Array.isArray(next) ? next : [];
        setStaffList(safe);
        setMe((prev) => {
          if (!prev) return prev;
          return safe.find((item) => item.staffNo === prev.staffNo) || prev;
        });
      } catch {
        // ignore stream parse errors
      }
    });

    return () => stream.close();
  }, [staffToken]);

  useEffect(() => {
    if (!staffToken) return undefined;

    const stream = createLostItemStream();
    stream.addEventListener("lost-items", (event) => {
      try {
        const next = JSON.parse(event.data);
        if (Array.isArray(next)) {
          setLostItems(next);
        }
      } catch {
        // ignore stream parse errors
      }
    });

    return () => stream.close();
  }, [staffToken]);

  useEffect(() => {
    const canSpeech =
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    const canTts =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance !== "undefined";
    setSpeechSupported(canSpeech);
    setTtsSupported(canTts);
    setNetworkOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    function handleOnline() {
      setNetworkOnline(true);
    }

    function handleOffline() {
      setNetworkOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const boothMap = useMemo(() => {
    return new Map((booths || []).map((booth) => [booth.id, booth]));
  }, [booths]);

  const enrichedStaff = useMemo(() => {
    return (staffList || []).map((staff) => {
      const booth = staff.assignedBoothId ? boothMap.get(staff.assignedBoothId) : null;
      const sharingOn = staff.locationSharingEnabled !== false;
      const latitude = sharingOn ? staff.latitude ?? null : null;
      const longitude = sharingOn ? staff.longitude ?? null : null;

      return {
        ...staff,
        locationSharingEnabled: sharingOn,
        latitude,
        longitude,
        zoneName: booth?.name || "순환 구역",
      };
    });
  }, [staffList, boothMap]);

  const filteredStaff = useMemo(() => {
    return enrichedStaff.filter((item) => {
      const byQuery =
        query.trim() === "" ||
        item.name?.includes(query) ||
        item.staffNo?.toLowerCase().includes(query.toLowerCase()) ||
        item.zoneName?.includes(query) ||
        item.currentTask?.includes(query);
      const byTeam = teamFilter === ALL_TEAM || item.team === teamFilter;
      const byStatus = statusFilter === ALL_STATUS || item.status === statusFilter;
      return byQuery && byTeam && byStatus;
    });
  }, [enrichedStaff, query, teamFilter, statusFilter]);

  const visibleMapStaff = useMemo(
    () =>
      filteredStaff.filter(
        (item) => item.locationSharingEnabled && item.latitude != null && item.longitude != null,
      ),
    [filteredStaff],
  );

  const mapMarkerStaff = useMemo(
    () => spreadOverlappingMarkers(visibleMapStaff),
    [visibleMapStaff],
  );

  const myMapPoint = useMemo(() => {
    if (!me?.staffNo) return null;
    return visibleMapStaff.find((item) => item.staffNo === me.staffNo) || null;
  }, [visibleMapStaff, me?.staffNo]);

  const teamOptions = useMemo(() => {
    return Array.from(new Set(enrichedStaff.map((item) => item.team).filter(Boolean)));
  }, [enrichedStaff]);

  const statusSummary = useMemo(() => {
    const base = { STANDBY: 0, MOVING: 0, ON_DUTY: 0, URGENT: 0 };
    for (const item of enrichedStaff) {
      if (base[item.status] != null) {
        base[item.status] += 1;
      }
    }
    return base;
  }, [enrichedStaff]);

  const teamSummary = useMemo(() => {
    const counts = new Map();
    for (const member of filteredStaff) {
      const team = member.team || "미분류";
      counts.set(team, (counts.get(team) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredStaff]);

  const teamCountMap = useMemo(() => {
    const counts = new Map();
    for (const member of enrichedStaff) {
      const team = member.team || "미분류";
      counts.set(team, (counts.get(team) || 0) + 1);
    }
    return counts;
  }, [enrichedStaff]);

  const staffBoardByStatus = useMemo(() => {
    const board = {
      URGENT: [],
      ON_DUTY: [],
      MOVING: [],
      STANDBY: [],
    };

    for (const member of filteredStaff) {
      if (board[member.status]) {
        board[member.status].push(member);
      }
    }

    for (const status of Object.keys(board)) {
      board[status].sort((a, b) => {
        const aTime = a.lastUpdatedAt ? Date.parse(a.lastUpdatedAt) : 0;
        const bTime = b.lastUpdatedAt ? Date.parse(b.lastUpdatedAt) : 0;
        return bTime - aTime;
      });
    }

    return board;
  }, [filteredStaff]);

  const dedupedLostItems = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const item of lostItems || []) {
      if (!item || item.id == null || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
    return result;
  }, [lostItems]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setLoading(true);

    try {
      const data = await loginStaff(staffNoInput.trim().toUpperCase(), pinInput.trim());
      setSavedToken(data.staffToken);
      setStaffToken(data.staffToken);
    } catch (error) {
      setLoginError(error?.message || "로그인에 실패했습니다.");
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      if (staffToken) {
        await logoutStaff(staffToken);
      }
    } catch {
      // ignore logout API failure
    } finally {
      setSavedToken("");
      setStaffToken("");
      setMe(null);
      setStaffList([]);
      setBooths([]);
      setNotices([]);
      setTaskDraft("");
      setNoteDraft("");
      setLostItemForm(LOST_ITEM_INITIAL_FORM);
      setLostItemFile(null);
      setLostItemMessage("");
      setLostItems([]);
      setLostItemEditingId(null);
      setLostItemEditDraft(null);
      setLostItemDeletingId(null);
      setShowLostForm(false);
      setShowTeamList(false);
      setShowMap(false);
      setShowInterpreter(false);
      setInterpreterBusy(false);
      setInterpreterMessage("");
      setKoSourceText("");
      setEnSourceText("");
      setKoToEnText("");
      setEnToKoText("");
      setLastRecognitionConfidence(null);
      setInterpreterHistory([]);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  }

  async function updateMyRuntime(
    nextStatus = me?.status,
    nextLocationSharingEnabled = me?.locationSharingEnabled !== false,
    options = {},
  ) {
    if (!staffToken || !me) return;
    const silent = options.silent === true;

    if (!silent) {
      setSaving(true);
    }
    let latitude = null;
    let longitude = null;

    if (nextLocationSharingEnabled && navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            maximumAge: 60000,
            timeout: 2000,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch {
        // continue without location
      }
    }

    try {
      const updatedMe = await updateMyStaffStatus(staffToken, {
        status: nextStatus,
        currentTask: taskDraft,
        currentNote: noteDraft,
        latitude,
        longitude,
        locationSharingEnabled: nextLocationSharingEnabled,
      });

      setMe(updatedMe);
      setStaffList((prev) =>
        prev.map((item) => (item.staffNo === updatedMe.staffNo ? updatedMe : item)),
      );
    } finally {
      if (!silent) {
        setSaving(false);
      }
    }
  }

  useEffect(() => {
    if (!staffToken || !me || me.locationSharingEnabled === false) return undefined;
    const timer = window.setInterval(() => {
      updateMyRuntime(me.status, true, { silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [staffToken, me?.staffNo, me?.status, me?.locationSharingEnabled, taskDraft, noteDraft]);

  async function handleLostItemSubmit(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (!staffToken) return;
    if (lostItemFile && lostItemFile.size > LOST_ITEM_MAX_FILE_SIZE) {
      setLostItemMessage("이미지 용량은 10MB 이하만 업로드할 수 있습니다.");
      return;
    }

    setLostItemSaving(true);
    setLostItemMessage("");
    try {
      await createLostItem(lostItemForm, lostItemFile, staffToken);
      setLostItemForm(LOST_ITEM_INITIAL_FORM);
      setLostItemFile(null);
      setLostItemMessage("분실물이 등록되었습니다.");
      const refreshed = await fetchLostItems();
      setLostItems(refreshed || []);
    } catch (error) {
      setLostItemMessage(error?.message || "분실물 등록에 실패했습니다.");
    } finally {
      setLostItemSaving(false);
    }
  }

  function beginLostItemEdit(item) {
    setLostItemEditingId(item.id);
    setLostItemEditDraft({
      title: item.title || "",
      description: item.description || "",
      category: item.category || "기타",
      foundLocation: item.foundLocation || "",
      finderContact: item.finderContact || "",
      imageUrl: item.imageUrl || "",
      status: item.status || "REGISTERED",
      resolveNote: item.resolveNote || "",
    });
  }

  function cancelLostItemEdit() {
    setLostItemEditingId(null);
    setLostItemEditDraft(null);
  }

  async function saveLostItemEdit(itemId) {
    if (!staffToken || !lostItemEditDraft) return;
    setLostItemUpdating(true);
    setLostItemMessage("");
    try {
      const updated = await updateLostItem(itemId, lostItemEditDraft, staffToken);
      setLostItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
      setLostItemMessage("분실물 정보가 수정되었습니다.");
      cancelLostItemEdit();
    } catch (error) {
      setLostItemMessage(error?.message || "분실물 수정에 실패했습니다.");
    } finally {
      setLostItemUpdating(false);
    }
  }

  async function removeLostItem(itemId) {
    if (!staffToken) return;
    const ok = window.confirm("이 분실물을 삭제하시겠습니까?");
    if (!ok) return;

    setLostItemDeletingId(itemId);
    setLostItemMessage("");
    try {
      await deleteLostItem(itemId, staffToken);
      setLostItems((prev) => prev.filter((item) => item.id !== itemId));
      setLostItemMessage("분실물이 삭제되었습니다.");
      if (lostItemEditingId === itemId) {
        cancelLostItemEdit();
      }
    } catch (error) {
      setLostItemMessage(error?.message || "분실물 삭제에 실패했습니다.");
    } finally {
      setLostItemDeletingId(null);
    }
  }

  function speakText(text, lang) {
    if (!ttsSupported || !text?.trim()) return;

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  }

  async function copyText(text) {
    const clean = text?.trim();
    if (!clean) {
      setInterpreterMessage("복사할 문장이 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(clean);
      setInterpreterMessage("문장을 복사했습니다.");
    } catch {
      setInterpreterMessage("복사에 실패했습니다.");
    }
  }

  function recognizeOnce(lang) {
    return new Promise((resolve, reject) => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        reject(new Error("이 기기에서는 음성 인식을 지원하지 않습니다."));
        return;
      }

      const recognition = new Recognition();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;
      recognition.continuous = false;

      let completed = false;
      const fail = (error) => {
        if (completed) return;
        completed = true;
        reject(error);
      };
      const done = (payload) => {
        if (completed) return;
        completed = true;
        resolve(payload);
      };

      recognition.onresult = (event) => {
        const first = event.results?.[0]?.[0];
        const transcript = first?.transcript?.trim() || "";
        const confidence = typeof first?.confidence === "number" ? first.confidence : null;
        if (!transcript) {
          fail(new Error("음성을 인식하지 못했습니다."));
          return;
        }
        done({ transcript, confidence });
      };

      recognition.onerror = (event) => {
        fail(new Error(`음성 인식 오류: ${event.error || "unknown"}`));
      };

      recognition.onend = () => {
        if (!completed) {
          fail(new Error("음성 인식이 종료되었습니다. 다시 시도해 주세요."));
        }
      };

      try {
        recognition.start();
      } catch {
        fail(new Error("음성 인식을 시작하지 못했습니다."));
      }
    });
  }

  function detectLanguage(text) {
    const clean = (text || "").trim();
    if (!clean) return "auto";
    const koreanChars = (clean.match(/[가-힣]/g) || []).length;
    const latinChars = (clean.match(/[A-Za-z]/g) || []).length;
    if (koreanChars > latinChars) return "ko";
    if (latinChars > koreanChars) return "en";
    return "auto";
  }

  function pushInterpreterHistory(sourceText, translatedText, sourceLang, targetLang, confidence) {
    setInterpreterHistory((prev) => {
      const next = [
        ...prev,
        {
          sourceText,
          translatedText,
          sourceLang,
          targetLang,
          confidence,
          at: Date.now(),
        },
      ];
      return next.slice(-MAX_CONTEXT_TURNS);
    });
  }

  function presetTranslate(text, sourceLang, targetLang) {
    const clean = (text || "").trim();
    if (!clean) return null;
    const preset = INTERPRETER_PRESETS.find((item) =>
      sourceLang === "ko" && targetLang === "en"
        ? item.ko === clean
        : sourceLang === "en" && targetLang === "ko"
          ? item.en === clean
          : false,
    );
    if (!preset) return null;
    return sourceLang === "ko" ? preset.en : preset.ko;
  }

  async function translateForField(text, sourceLang, targetLang) {
    const clean = text?.trim();
    if (!clean) {
      throw new Error("번역할 문장을 먼저 입력해 주세요.");
    }

    const preset = presetTranslate(clean, sourceLang, targetLang);
    if (preset) {
      return {
        translatedText: preset,
        confidence: 0.99,
        provider: "preset-local",
        latencyMs: 0,
      };
    }

    if (!networkOnline) {
      return {
        translatedText:
          sourceLang === "ko" && targetLang === "en"
            ? `[EN] ${clean}`
            : sourceLang === "en" && targetLang === "ko"
              ? `[KO] ${clean}`
              : clean,
        confidence: 0.35,
        provider: "offline-fallback",
        latencyMs: 0,
      };
    }

    const contextHints = interpreterHistory
      .slice(-MAX_CONTEXT_TURNS)
      .map((item) => `${item.sourceLang}->${item.targetLang}: ${item.sourceText}`);

    return translateText({
      text: clean,
      sourceLang,
      targetLang,
      contextHints,
    });
  }

  async function runVoiceTranslate(sourceLang, targetLang, sourceStateSetter, targetStateSetter, targetTtsLang) {
    if (interpreterBusy) return;
    setInterpreterBusy(true);
    setInterpreterMessage(`${sourceLang === "ko" ? "한국어" : "영어"} 음성을 듣는 중...`);

    try {
      let sourcePayload = null;
      let lastError = null;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          sourcePayload = await recognizeOnce(sourceLang === "ko" ? "ko-KR" : "en-US");
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!sourcePayload) {
        throw lastError || new Error("음성 인식에 실패했습니다.");
      }

      const source = sourcePayload.transcript;
      const recognitionConfidence =
        typeof sourcePayload.confidence === "number" ? sourcePayload.confidence : null;
      setLastRecognitionConfidence(recognitionConfidence);
      sourceStateSetter(source);

      if (
        recognitionConfidence != null &&
        recognitionConfidence < LOW_CONFIDENCE_THRESHOLD
      ) {
        setInterpreterMessage(
          `인식 신뢰도 낮음(${Math.round(recognitionConfidence * 100)}%). 문장을 확인 후 다시 시도해 주세요.`,
        );
        setInterpreterBusy(false);
        return;
      }

      const autoDetected = detectLanguage(source);
      const effectiveSourceLang = autoDetected === "auto" ? sourceLang : autoDetected;
      const effectiveTargetLang =
        effectiveSourceLang === "ko" ? "en" : effectiveSourceLang === "en" ? "ko" : targetLang;

      setInterpreterMessage(
        `${effectiveSourceLang === "ko" ? "한→영" : "영→한"} 번역 중...`,
      );
      const translated = await translateForField(source, effectiveSourceLang, effectiveTargetLang);
      targetStateSetter(translated.translatedText);
      speakText(translated.translatedText, targetTtsLang);
      pushInterpreterHistory(
        source,
        translated.translatedText,
        effectiveSourceLang,
        effectiveTargetLang,
        translated.confidence,
      );
      setInterpreterMessage(
        `${effectiveSourceLang === "ko" ? "한→영" : "영→한"} 통역 완료 · ${
          translated.provider
        } · ${(translated.confidence * 100).toFixed(0)}%`,
      );
    } catch (error) {
      setInterpreterMessage(error?.message || "통역에 실패했습니다.");
    } finally {
      setInterpreterBusy(false);
    }
  }

  async function runTextTranslate(sourceText, sourceLang, targetLang, targetStateSetter, ttsLang) {
    if (interpreterBusy) return;
    setInterpreterBusy(true);
    setInterpreterMessage(`${sourceLang === "ko" ? "한→영" : "영→한"} 번역 중...`);
    try {
      const cleanSource = sourceText.trim();
      const autoDetected = detectLanguage(cleanSource);
      const effectiveSourceLang = autoDetected === "auto" ? sourceLang : autoDetected;
      const effectiveTargetLang =
        effectiveSourceLang === "ko" ? "en" : effectiveSourceLang === "en" ? "ko" : targetLang;
      const translated = await translateForField(cleanSource, effectiveSourceLang, effectiveTargetLang);
      targetStateSetter(translated.translatedText);
      speakText(translated.translatedText, ttsLang);
      pushInterpreterHistory(
        cleanSource,
        translated.translatedText,
        effectiveSourceLang,
        effectiveTargetLang,
        translated.confidence,
      );
      setInterpreterMessage(
        `${effectiveSourceLang === "ko" ? "한→영" : "영→한"} 번역 완료 · ${
          translated.provider
        } · ${(translated.confidence * 100).toFixed(0)}%`,
      );
    } catch (error) {
      setInterpreterMessage(error?.message || "번역에 실패했습니다.");
    } finally {
      setInterpreterBusy(false);
    }
  }

  async function handleKoToEnVoice() {
    setInterpreterLane("koToEn");
    await runVoiceTranslate("ko", "en", setKoSourceText, setKoToEnText, "en-US");
  }

  async function handleEnToKoVoice() {
    setInterpreterLane("enToKo");
    await runVoiceTranslate("en", "ko", setEnSourceText, setEnToKoText, "ko-KR");
  }

  async function handleKoToEnTextTranslate() {
    setInterpreterLane("koToEn");
    await runTextTranslate(koSourceText, "ko", "en", setKoToEnText, "en-US");
  }

  async function handleEnToKoTextTranslate() {
    setInterpreterLane("enToKo");
    await runTextTranslate(enSourceText, "en", "ko", setEnToKoText, "ko-KR");
  }

  async function handleActiveVoiceTranslate() {
    if (interpreterLane === "koToEn") {
      await handleKoToEnVoice();
      return;
    }
    await handleEnToKoVoice();
  }

  async function handleActiveTextTranslate() {
    if (interpreterLane === "koToEn") {
      await handleKoToEnTextTranslate();
      return;
    }
    await handleEnToKoTextTranslate();
  }

  function speakActiveResult() {
    if (interpreterLane === "koToEn") {
      speakText(koToEnText, "en-US");
      return;
    }
    speakText(enToKoText, "ko-KR");
  }

  async function copyActiveResult() {
    if (interpreterLane === "koToEn") {
      await copyText(koToEnText);
      return;
    }
    await copyText(enToKoText);
  }

  function toggleExclusivePanel(panelKey) {
    const current = {
      interpreter: showInterpreter,
      lost: showLostForm,
      team: showTeamList,
      map: showMap,
    };
    const willOpen = !current[panelKey];

    setShowInterpreter(panelKey === "interpreter" ? willOpen : false);
    setShowLostForm(panelKey === "lost" ? willOpen : false);
    setShowTeamList(panelKey === "team" ? willOpen : false);
    setShowMap(panelKey === "map" ? willOpen : false);
  }

  if (!staffToken) {
    return (
      <section className="cyber-page pt-4 pb-12">
        <article className="mx-auto max-w-md rounded-2xl border border-cyan-300/60 bg-slate-950/80 p-5 text-cyan-50 shadow-[0_0_32px_rgba(34,211,238,0.28)]">
          <p className="text-xs tracking-[0.16em] uppercase text-cyan-300/90">Staff Secure Access</p>
          <h2 className="mt-2 text-xl font-extrabold text-role-ops inline-flex items-center gap-1.5">
            <span className="visual-icon-badge visual-icon-badge--ops">
              <IconShield className="h-5 w-5 icon-role-ops" />
            </span>
            스태프 전용 관제 페이지
          </h2>
          <p className="mt-1 text-sm text-cyan-100/85">
            배정받은 <span className="font-bold">스태프 번호 + PIN</span>으로 로그인하세요.
          </p>

          <form onSubmit={handleLogin} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-cyan-200">스태프 번호</span>
              <input
                value={staffNoInput}
                onChange={(e) => setStaffNoInput(e.target.value)}
                placeholder="S001"
                className="mt-1 w-full rounded-lg border border-cyan-300/50 bg-slate-900/70 px-3 py-2.5 text-sm outline-none focus:border-cyan-200"
              />
            </label>
            <label className="block">
              <span className="text-xs text-cyan-200">PIN</span>
              <input
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="4자리 PIN"
                type="password"
                className="mt-1 w-full rounded-lg border border-cyan-300/50 bg-slate-900/70 px-3 py-2.5 text-sm outline-none focus:border-cyan-200"
              />
            </label>
            {loginError && (
              <p className="rounded-md border border-rose-300 bg-rose-500/15 px-2 py-1.5 text-xs text-rose-100">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 py-2.5 text-sm font-bold text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.45)] disabled:opacity-60"
            >
              {loading ? "접속 중..." : "스태프 페이지 입장"}
            </button>
          </form>
        </article>
      </section>
    );
  }

  if (loading) {
    return <p className="cyber-page pt-6 text-sm text-slate-400">스태프 대시보드 로딩 중...</p>;
  }

  return (
    <section className="cyber-page pt-4 pb-24 space-y-4">
      <article className="rounded-2xl border border-cyan-300/60 bg-slate-950/80 p-4 text-cyan-50">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs tracking-[0.16em] uppercase text-cyan-300/90">Field Console</p>
            <h2 className="mt-1 text-lg font-extrabold text-role-ops inline-flex items-center gap-1.5">
              <span className="visual-icon-badge visual-icon-badge--ops">
                <IconUsers className="h-5 w-5 icon-role-ops" />
              </span>
              {me?.name}
            </h2>
            <p className="text-xs text-cyan-100/85">
              {me?.staffNo} · {me?.team}
            </p>
            <div className="mt-2 inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextSharing = !(me?.locationSharingEnabled !== false);
                  setMe((prev) => (prev ? { ...prev, locationSharingEnabled: nextSharing } : prev));
                  updateMyRuntime(me?.status, nextSharing);
                }}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                  me?.locationSharingEnabled !== false
                    ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                    : "border-slate-400 bg-slate-700/50 text-slate-200"
                }`}
              >
                위치 공유 {me?.locationSharingEnabled !== false ? "ON" : "OFF"}
              </button>
              <span className="text-[11px] text-cyan-200/80">
                {me?.locationSharingEnabled !== false ? "지도 실시간 표시 중" : "지도 표시 중지"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-cyan-300/70 px-3 py-2 text-xs font-semibold text-cyan-100"
          >
            로그아웃
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-4 gap-2">
          {Object.keys(STATUS_META).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={me?.status === status}
              onClick={() => {
                if (me) setMe({ ...me, status });
                updateMyRuntime(status);
              }}
              className={`rounded-lg border px-2 py-2 text-center ${
                me?.status === status
                  ? "border-cyan-500 bg-cyan-600 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-700"
              }`}
            >
              <p className="text-[10px] font-semibold">{STATUS_META[status].label}</p>
              <p className="text-sm font-extrabold">{statusSummary[status] || 0}</p>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-rose-300/70 bg-rose-50 p-3">
        <button
          type="button"
          onClick={() => {
            if (me) setMe({ ...me, status: "URGENT" });
            updateMyRuntime("URGENT");
          }}
          className="w-full rounded-xl bg-rose-600 py-4 text-base font-extrabold text-white"
        >
          <span className="inline-flex items-center gap-2">
            <span className="visual-icon-badge-sm visual-icon-badge--alert">
              <IconAlert className="h-4 w-4 icon-role-alert" />
            </span>
            긴급 호출
          </span>
        </button>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={showInterpreter}
            onClick={() => toggleExclusivePanel("interpreter")}
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-3 text-sm font-bold text-violet-800"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3Zm0 13L6.74 13.1 12 10.2l5.26 2.9L12 16Z" />
              </svg>
              통역 {showInterpreter ? "닫기" : "열기"}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={showLostForm}
            onClick={() => toggleExclusivePanel("lost")}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M10 3h4l1 2h4a2 2 0 0 1 2 2v3H3V7a2 2 0 0 1 2-2h4l1-2Zm-7 9h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7Z" />
              </svg>
              분실물 {showLostForm ? "닫기" : "열기"}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={showTeamList}
            onClick={() => toggleExclusivePanel("team")}
            className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-3 text-sm font-bold text-cyan-800"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M16 11a3 3 0 1 0-2.99-3A3 3 0 0 0 16 11ZM8 11a3 3 0 1 0-2.99-3A3 3 0 0 0 8 11Zm0 2c-2.67 0-8 1.34-8 4v2h10v-2c0-1.16.48-2.18 1.26-3C10.22 13.39 8.85 13 8 13Zm8 0c-.29 0-.62.02-.97.05A4.99 4.99 0 0 1 18 17v2h6v-2c0-2.66-5.33-4-8-4Z" />
              </svg>
              팀현황 {showTeamList ? "닫기" : "보기"}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={showMap}
            onClick={() => toggleExclusivePanel("map")}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M15 5.1 9 3 3 5v16l6-2 6 2 6-2V3l-6 2.1ZM9 17l-4 1.34V6.66L9 5.33V17Zm6 1.67-4-1.34V5.33l4 1.34v12Zm6-.33-4 1.33V6.66l4-1.33v13.01Z" />
              </svg>
              지도 {showMap ? "닫기" : "보기"}
            </span>
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-600">내 업무</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {QUICK_TASKS.map((task) => (
            <button
              key={task}
              type="button"
              onClick={() => setTaskDraft(task)}
              className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700"
            >
              {task}
            </button>
          ))}
        </div>
        <input
          value={taskDraft}
          onChange={(e) => setTaskDraft(e.target.value)}
          placeholder="현재 업무"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => updateMyRuntime(me?.status)}
          disabled={saving}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </article>

      {showInterpreter && (
        <article className="rounded-xl border border-violet-300/60 bg-violet-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={interpreterLane === "koToEn"}
              onClick={() => setInterpreterLane("koToEn")}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${
                interpreterLane === "koToEn"
                  ? "border border-cyan-500 bg-cyan-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              한국어 → 영어
            </button>
            <button
              type="button"
              aria-pressed={interpreterLane === "enToKo"}
              onClick={() => setInterpreterLane("enToKo")}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${
                interpreterLane === "enToKo"
                  ? "border border-emerald-500 bg-emerald-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              영어 → 한국어
            </button>
          </div>
          <button
            type="button"
            onClick={handleActiveVoiceTranslate}
            disabled={interpreterBusy || !speechSupported}
            className="w-full rounded-xl border border-violet-400 bg-violet-600 px-4 py-4 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {interpreterLane === "koToEn" ? "한국어로 말하기" : "영어로 말하기"}
          </button>
          <textarea
            value={interpreterLane === "koToEn" ? koSourceText : enSourceText}
            onChange={(e) =>
              interpreterLane === "koToEn"
                ? setKoSourceText(e.target.value)
                : setEnSourceText(e.target.value)
            }
            rows={2}
            placeholder={interpreterLane === "koToEn" ? "한국어 입력" : "English input"}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleActiveTextTranslate}
              disabled={interpreterBusy}
              className="rounded-lg border border-violet-300 bg-violet-100 px-2 py-2 text-xs font-semibold text-violet-800 disabled:opacity-60"
            >
              번역
            </button>
            <button
              type="button"
              onClick={copyActiveResult}
              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700"
            >
              복사
            </button>
            <button
              type="button"
              onClick={speakActiveResult}
              disabled={!(interpreterLane === "koToEn" ? koToEnText : enToKoText)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              재생
            </button>
          </div>
          <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2 text-sm text-cyan-900 min-h-12">
            {interpreterLane === "koToEn"
              ? koToEnText || "영어 결과"
              : enToKoText || "한국어 결과"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INTERPRETER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setKoSourceText(preset.ko);
                  setEnSourceText(preset.en);
                  setKoToEnText(preset.en);
                  setEnToKoText(preset.ko);
                  setInterpreterMessage("프리셋 문장 적용");
                }}
                className="rounded-full border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </article>
      )}

      {showLostForm && (
        <article className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 space-y-3">
          <p className="text-sm font-bold text-emerald-900">분실물 등록</p>
          <input
            value={lostItemForm.title}
            onChange={(e) => setLostItemForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="분실물명"
            className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={lostItemForm.category}
              onChange={(e) => setLostItemForm((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="카테고리"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
            />
            <input
              value={lostItemForm.foundLocation}
              onChange={(e) => setLostItemForm((prev) => ({ ...prev, foundLocation: e.target.value }))}
              placeholder="발견 위치"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              required
            />
          </div>
          <textarea
            value={lostItemForm.description}
            onChange={(e) => setLostItemForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="설명"
            rows={2}
            className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
            required
          />
          <input
            value={lostItemForm.finderContact}
            onChange={(e) => setLostItemForm((prev) => ({ ...prev, finderContact: e.target.value }))}
            placeholder="연락 가능한 전화번호 (선택)"
            className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="w-full cursor-pointer rounded-lg border border-emerald-300 bg-white px-3 py-2 text-center text-xs font-semibold text-emerald-800">
              갤러리 선택
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLostItemFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            <label className="w-full cursor-pointer rounded-lg border border-emerald-300 bg-white px-3 py-2 text-center text-xs font-semibold text-emerald-800">
              카메라 촬영
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setLostItemFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-[11px] text-emerald-700/90">
            선택된 사진: {lostItemFile?.name || "없음"}
          </p>
          <button
            type="button"
            onClick={handleLostItemSubmit}
            disabled={lostItemSaving}
            className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {lostItemSaving ? "등록 중..." : "분실물 등록"}
          </button>
          {lostItemMessage && (
            <p className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs text-emerald-800">
              {lostItemMessage}
            </p>
          )}

          <div className="border-t border-emerald-200/80 pt-2">
            <p className="text-sm font-bold text-emerald-900">등록된 분실물 관리</p>
            <div className="mt-2 space-y-2">
              {dedupedLostItems.slice(0, 20).map((item) => {
                const editing = lostItemEditingId === item.id;
                const draft = lostItemEditDraft || {};

                return (
                  <div key={`lost-manage-${item.id}`} className="rounded-lg border border-emerald-200 bg-white p-2">
                    {editing ? (
                      <div className="space-y-2">
                        <input
                          value={draft.title || ""}
                          onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, title: e.target.value }))}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                          placeholder="분실물명"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={draft.category || ""}
                            onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, category: e.target.value }))}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                            placeholder="카테고리"
                          />
                          <input
                            value={draft.foundLocation || ""}
                            onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, foundLocation: e.target.value }))}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                            placeholder="발견 위치"
                          />
                        </div>
                        <textarea
                          value={draft.description || ""}
                          onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, description: e.target.value }))}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                          rows={2}
                          placeholder="설명"
                        />
                        <input
                          value={draft.finderContact || ""}
                          onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, finderContact: e.target.value }))}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                          placeholder="연락처"
                        />
                        <input
                          value={draft.imageUrl || ""}
                          onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, imageUrl: e.target.value }))}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                          placeholder="이미지 URL (기존 유지 시 변경 없음)"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={draft.status || "REGISTERED"}
                            onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, status: e.target.value }))}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                          >
                            {LOST_ITEM_STATUS_OPTIONS.map((option) => (
                              <option key={`lost-status-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={draft.resolveNote || ""}
                            onChange={(e) => setLostItemEditDraft((prev) => ({ ...prev, resolveNote: e.target.value }))}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                            placeholder="처리 메모"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => saveLostItemEdit(item.id)}
                            disabled={lostItemUpdating}
                            className="rounded border border-cyan-500 bg-cyan-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {lostItemUpdating ? "저장 중..." : "저장"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelLostItemEdit}
                            className="rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800">{item.title}</p>
                          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            {item.statusLabel || item.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">{item.category} · {item.foundLocation}</p>
                        <p className="mt-1 text-[11px] text-slate-700">{item.description}</p>
                        {item.claimantName && (
                          <p className="mt-1 text-[11px] text-amber-700">
                            주인 요청: {item.claimantName} ({item.claimantContact})
                          </p>
                        )}
                        {item.claimantNote && (
                          <p className="mt-0.5 text-[11px] text-amber-700/90">
                            요청 메모: {item.claimantNote}
                          </p>
                        )}
                        {item.claimedAt && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            요청 시각: {item.claimedAt?.replace("T", " ").slice(5, 16)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => beginLostItemEdit(item)}
                          className="mt-2 w-full rounded border border-emerald-300 bg-emerald-100 px-2 py-1.5 text-xs font-semibold text-emerald-800"
                        >
                          수정/상태변경
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLostItem(item.id)}
                          disabled={lostItemDeletingId === item.id}
                          className="mt-1 w-full rounded border border-rose-300 bg-rose-100 px-2 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-60"
                        >
                          {lostItemDeletingId === item.id ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {dedupedLostItems.length === 0 && (
                <p className="text-xs text-emerald-700">등록된 분실물이 없습니다.</p>
              )}
            </div>
          </div>
        </article>
      )}

      <article className="rounded-xl border border-amber-300/60 bg-amber-50/95 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-amber-900">중요 공지</p>
          <span className="text-xs text-amber-700">{notices.length}건</span>
        </div>
        <div className="mt-2 space-y-2">
          {(notices || []).slice(0, 2).map((notice) => (
            <div key={notice.id} className="rounded-md border border-amber-300 bg-white px-2.5 py-2">
              <p className="text-xs font-bold text-amber-900">[{notice.category}] {notice.title}</p>
            </div>
          ))}
          {notices.length === 0 && <p className="text-xs text-amber-700">현재 활성 공지가 없습니다.</p>}
        </div>
      </article>

      {showTeamList && (
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름/번호 검색"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={teamFilter === ALL_TEAM}
              onClick={() => setTeamFilter(ALL_TEAM)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                teamFilter === ALL_TEAM
                  ? "border-cyan-500 bg-cyan-600 text-white"
                  : "border-cyan-200 bg-cyan-50 text-cyan-800"
              }`}
            >
              전체 {enrichedStaff.length}
            </button>
            {teamOptions.map((team) => {
              const active = teamFilter === team;
              return (
                <button
                  key={`team-summary-${team}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTeamFilter(team)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    active
                      ? "border-cyan-500 bg-cyan-600 text-white"
                      : "border-cyan-200 bg-cyan-50 text-cyan-800"
                  }`}
                >
                  {team} {teamCountMap.get(team) || 0}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-slate-500">표시 {filteredStaff.length}명 / 전체 {enrichedStaff.length}명</p>

          <section className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="inline-flex items-center gap-1 text-xs font-bold text-rose-900">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                긴급
              </p>
              <span className="rounded-full border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                {staffBoardByStatus.URGENT.length}
              </span>
            </div>
            <div className="space-y-1">
              {staffBoardByStatus.URGENT.length === 0 && (
                <p className="text-[11px] text-rose-700">긴급 상태 없음</p>
              )}
              {staffBoardByStatus.URGENT.map((item) => (
                <div
                  key={`staff-board-URGENT-${item.staffNo}`}
                  className="rounded-md border border-white/70 bg-white px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800">
                      {item.name} <span className="font-normal text-slate-500">({item.staffNo})</span>
                    </p>
                    <span className="text-[11px] text-slate-500">
                      {item.lastUpdatedAt?.replace("T", " ").slice(11, 16)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {item.team} · {item.zoneName}
                  </p>
                  {item.currentTask && (
                    <p className="mt-0.5 text-[11px] text-slate-700">{item.currentTask}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {STATUS_BOARD_ORDER.filter((status) => status !== "URGENT").map((status) => (
              <section
                key={`status-board-${status}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800">
                    {STATUS_META[status]?.label || status}
                  </p>
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {staffBoardByStatus[status].length}
                  </span>
                </div>

                <div className="space-y-1">
                  {staffBoardByStatus[status].length === 0 && (
                    <p className="text-[11px] text-slate-500">해당 스태프 없음</p>
                  )}
                  {staffBoardByStatus[status].map((item) => (
                    <div
                      key={`staff-board-${status}-${item.staffNo}`}
                      className="rounded-md border border-white/70 bg-white px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800">
                          {item.name} <span className="font-normal text-slate-500">({item.staffNo})</span>
                        </p>
                        <span className="text-[11px] text-slate-500">
                          {item.lastUpdatedAt?.replace("T", " ").slice(11, 16)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {item.team} · {item.zoneName}
                      </p>
                      {item.currentTask && (
                        <p className="mt-0.5 text-[11px] text-slate-700">{item.currentTask}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      )}

      {showMap && (
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800 text-role-map inline-flex items-center gap-1.5">
            <IconMapPin className="h-4 w-4 icon-role-map" />
            스태프 위치 지도
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
            위치 공유 ON + 좌표 전송된 스태프만 지도에 표시됩니다. (표시 {visibleMapStaff.length}명)
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMapAction(`focus-me-${Date.now()}`)}
                className="rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700"
              >
                내 위치
              </button>
              <button
                type="button"
                onClick={() => setMapAction(`fit-all-${Date.now()}`)}
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
              >
                전체 보기
              </button>
            </div>
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            <MapContainer
              center={[AJOU_CENTER.latitude, AJOU_CENTER.longitude]}
              zoom={17}
              maxZoom={21}
              className="h-72 w-full"
            >
              <MapViewportController
                action={
                  mapAction.startsWith("focus-me")
                    ? "focus-me"
                    : mapAction.startsWith("fit-all")
                      ? "fit-all"
                      : "idle"
                }
                points={mapMarkerStaff}
                myPoint={myMapPoint}
              />
              <TileLayer attribution="&copy; OpenStreetMap 기여자" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {mapMarkerStaff.map((item) => {
                const freshness = getFreshness(item, nowMs);
                return (
                <CircleMarker
                  key={`${item.staffNo}-${item.latitude.toFixed(6)}-${item.longitude.toFixed(6)}`}
                  center={[item.latitude, item.longitude]}
                  radius={7}
                  pathOptions={{
                    color: freshness.border,
                    weight: 2,
                    fillColor: staffColorById(item.staffNo),
                    fillOpacity: 0.9,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]} permanent>
                    <span className="text-[10px] font-bold">
                      {staffInitial(item.name)} · {item.name} · {freshness.label}
                    </span>
                  </Tooltip>
                  <Popup>
                    <p className="text-xs font-bold">
                      {item.name} ({item.staffNo})
                    </p>
                    <p className="text-xs mt-1">팀: {item.team}</p>
                    <p className="text-xs mt-1">상태: {STATUS_META[item.status]?.label || item.status}</p>
                    <p className="text-xs mt-1">통신 상태: {freshness.label}</p>
                    {item.lastUpdatedAt && (
                      <p className="text-xs mt-1 text-slate-500">
                        위치 업데이트: {item.lastUpdatedAt.replace("T", " ").slice(5, 16)}
                      </p>
                    )}
                  </Popup>
                </CircleMarker>
              );
              })}
            </MapContainer>
          </div>
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="text-[11px] font-bold text-slate-700">상태 범례</p>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
              <div className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                실시간 (30초 이내)
              </div>
              <div className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                지연 (2분 이내)
              </div>
              <div className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                오프라인 (2분 초과)
              </div>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
