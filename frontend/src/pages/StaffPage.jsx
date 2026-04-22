import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import {
  createLostItem,
  createStaffStream,
  fetchStaffBootstrap,
  loginStaff,
  logoutStaff,
  translateText,
  updateMyStaffStatus,
} from "../api";
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

const ALL_TEAM = "ALL";
const ALL_STATUS = "ALL";
const LOW_CONFIDENCE_THRESHOLD = 0.72;
const MAX_CONTEXT_TURNS = 3;

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

  useEffect(() => {
    if (!staffToken) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    fetchStaffBootstrap(staffToken)
      .then((data) => {
        if (!mounted) return;
        setMe(data.me);
        setStaffList(data.staff || []);
        setNotices(data.notices || []);
        setBooths(data.booths || []);
        setTaskDraft(data.me?.currentTask || "");
        setNoteDraft(data.me?.currentNote || "");
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

  const boothMap = useMemo(() => {
    return new Map((booths || []).map((booth) => [booth.id, booth]));
  }, [booths]);

  const enrichedStaff = useMemo(() => {
    return (staffList || []).map((staff, index) => {
      const booth = staff.assignedBoothId ? boothMap.get(staff.assignedBoothId) : null;
      const latitude =
        staff.latitude ?? booth?.latitude ?? AJOU_CENTER.latitude + ((index % 11) - 5) * 0.0002;
      const longitude =
        staff.longitude ?? booth?.longitude ?? AJOU_CENTER.longitude + ((index % 9) - 4) * 0.0002;

      return {
        ...staff,
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

  async function updateMyRuntime(nextStatus = me?.status) {
    if (!staffToken || !me) return;

    setSaving(true);
    let latitude = null;
    let longitude = null;

    if (navigator.geolocation) {
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
      });

      setMe(updatedMe);
      setStaffList((prev) =>
        prev.map((item) => (item.staffNo === updatedMe.staffNo ? updatedMe : item)),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLostItemSubmit(event) {
    event.preventDefault();
    if (!staffToken) return;

    setLostItemSaving(true);
    setLostItemMessage("");
    try {
      await createLostItem(lostItemForm, lostItemFile, staffToken);
      setLostItemForm(LOST_ITEM_INITIAL_FORM);
      setLostItemFile(null);
      setLostItemMessage("분실물이 등록되었습니다.");
    } catch (error) {
      setLostItemMessage(error?.message || "분실물 등록에 실패했습니다.");
    } finally {
      setLostItemSaving(false);
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

  if (!staffToken) {
    return (
      <section className="cyber-page pt-4 pb-12">
        <article className="mx-auto max-w-md rounded-2xl border border-cyan-300/60 bg-slate-950/80 p-5 text-cyan-50 shadow-[0_0_32px_rgba(34,211,238,0.28)]">
          <p className="text-xs tracking-[0.16em] uppercase text-cyan-300/90">Staff Secure Access</p>
          <h2 className="mt-2 text-xl font-extrabold">스태프 전용 관제 페이지</h2>
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
      <article className="rounded-2xl border border-cyan-300/60 bg-slate-950/80 p-4 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.2)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs tracking-[0.16em] uppercase text-cyan-300/90">Staff Field Mode</p>
            <h2 className="mt-1 text-lg font-extrabold">현장 스태프 빠른 화면</h2>
            <p className="mt-1 text-xs text-cyan-100/85">
              {me?.name} ({me?.staffNo}) · {me?.team}
            </p>
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

      <article className="rounded-xl border border-rose-300/70 bg-rose-50 p-3 space-y-2">
        <button
          type="button"
          onClick={() => {
            if (me) {
              setMe({ ...me, status: "URGENT" });
            }
            updateMyRuntime("URGENT");
          }}
          className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white shadow-[0_0_14px_rgba(225,29,72,0.35)]"
        >
          긴급 호출 / 지원 요청
        </button>
        <p className="text-[11px] text-rose-800">긴급 상태로 즉시 전환하고 위치/업무 상태를 함께 전송합니다.</p>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-sm font-semibold text-slate-800">내 상태</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(STATUS_META).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={me?.status === status}
              onClick={() => {
                if (me) {
                  setMe({ ...me, status });
                }
                updateMyRuntime(status);
              }}
              className={`rounded-xl px-3 py-3 text-sm font-bold transition ${
                me?.status === status
                  ? "bg-cyan-600 text-white shadow-[0_0_14px_rgba(8,145,178,0.35)]"
                  : "border border-slate-300 bg-slate-50 text-slate-700"
              }`}
            >
              {STATUS_META[status].label}
            </button>
          ))}
        </div>

        <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
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
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          placeholder="현장 메모 (선택)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => updateMyRuntime(me?.status)}
          disabled={saving}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "저장 중..." : "내 상태/업무 저장"}
        </button>
      </article>

      <article className="rounded-xl border border-amber-300/60 bg-amber-50/95 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-amber-900">중요 공지</p>
          <span className="text-xs text-amber-700">{notices.length}건</span>
        </div>
        <div className="mt-2 space-y-2">
          {(notices || []).slice(0, 2).map((notice) => (
            <div key={notice.id} className="rounded-md border border-amber-300 bg-white px-2.5 py-2">
              <p className="text-xs font-bold text-amber-900">[{notice.category}] {notice.title}</p>
              <p className="mt-1 text-xs text-amber-800">{notice.content}</p>
            </div>
          ))}
          {notices.length === 0 && <p className="text-xs text-amber-700">현재 활성 공지가 없습니다.</p>}
        </div>
      </article>

      <article className="rounded-xl border border-violet-300/60 bg-violet-50 p-3 space-y-3">
        <button
          type="button"
          aria-pressed={showInterpreter}
          onClick={() => setShowInterpreter((prev) => !prev)}
          className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-left"
        >
          <p className="text-sm font-bold text-violet-900">
            {showInterpreter ? "통역 모드 닫기" : "통역 모드 열기 (한↔영)"}
          </p>
          <p className="text-[11px] text-violet-800/90">
            {networkOnline ? "온라인" : "오프라인"} · {showInterpreter ? "펼침" : "접힘"}
          </p>
        </button>

        {showInterpreter && (
          <>
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
          {interpreterLane === "koToEn"
            ? "버튼 누르고 한국어로 말하기"
            : "버튼 누르고 영어로 말하기"}
        </button>

        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-violet-900">
          {interpreterMessage || "대기 중"} · 신뢰도{" "}
          {lastRecognitionConfidence == null ? "-" : `${Math.round(lastRecognitionConfidence * 100)}%`}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
          <p className="text-[11px] font-semibold text-slate-700">
            {interpreterLane === "koToEn"
              ? "직원이 말할 문장 (한국어)"
              : "방문객이 말한 문장 (영어)"}
          </p>
          <textarea
            value={interpreterLane === "koToEn" ? koSourceText : enSourceText}
            onChange={(e) =>
              interpreterLane === "koToEn"
                ? setKoSourceText(e.target.value)
                : setEnSourceText(e.target.value)
            }
            rows={2}
            placeholder={
              interpreterLane === "koToEn"
                ? "예: 메인 무대는 오른쪽으로 100m 이동하시면 됩니다."
                : "Example: I cannot find the lost-and-found center."
            }
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleActiveTextTranslate}
              disabled={interpreterBusy}
              className="rounded-lg border border-violet-300 bg-violet-100 px-2 py-2 text-xs font-semibold text-violet-800 disabled:opacity-60"
            >
              번역하기
            </button>
            <button
              type="button"
              onClick={copyActiveResult}
              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700"
            >
              결과 복사
            </button>
            <button
              type="button"
              onClick={speakActiveResult}
              disabled={!(interpreterLane === "koToEn" ? koToEnText : enToKoText)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              결과 들려주기
            </button>
          </div>
          <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2 text-sm text-cyan-900 min-h-12">
            {interpreterLane === "koToEn"
              ? koToEnText || "여기에 영어 통역 결과가 표시됩니다."
              : enToKoText || "여기에 한국어 통역 결과가 표시됩니다."}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-violet-900">자주 쓰는 문장</p>
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
                  setInterpreterMessage("프리셋 문장을 불러왔습니다.");
                }}
                className="rounded-full border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
          </>
        )}
      </article>

      <article className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 space-y-2">
        <button
          type="button"
          aria-pressed={showLostForm}
          onClick={() => setShowLostForm((prev) => !prev)}
          className="w-full rounded-lg border border-emerald-400 bg-white px-3 py-2 text-sm font-bold text-emerald-800"
        >
          {showLostForm ? "분실물 등록 닫기" : "분실물 등록 열기"}
        </button>

        {showLostForm && (
          <form className="space-y-2" onSubmit={handleLostItemSubmit}>
            <input
              value={lostItemForm.title}
              onChange={(e) => setLostItemForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="분실물명"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              required
            />
            <textarea
              value={lostItemForm.description}
              onChange={(e) => setLostItemForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="상세 설명"
              rows={2}
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              required
            />
            <input
              value={lostItemForm.foundLocation}
              onChange={(e) => setLostItemForm((prev) => ({ ...prev, foundLocation: e.target.value }))}
              placeholder="발견 위치"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
              required
            />
            <div className="grid grid-cols-3 gap-2">
              {LOST_ITEM_CATEGORIES.map((category) => {
                const active = lostItemForm.category === category;
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLostItemForm((prev) => ({ ...prev, category }))}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-emerald-500 bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                        : "border-emerald-200 bg-white text-emerald-900 hover:border-emerald-400"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
            <input
              value={lostItemForm.finderContact}
              onChange={(e) => setLostItemForm((prev) => ({ ...prev, finderContact: e.target.value }))}
              placeholder="연락처(선택)"
              className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLostItemFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={lostItemSaving}
              className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {lostItemSaving ? "등록 중..." : "분실물 등록"}
            </button>
          </form>
        )}

        {lostItemMessage && (
          <p className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs text-emerald-800">
            {lostItemMessage}
          </p>
        )}
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={showTeamList}
            onClick={() => setShowTeamList((prev) => !prev)}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            {showTeamList ? "팀 현황 닫기" : "팀 현황 보기"}
          </button>
          <button
            type="button"
            aria-pressed={showMap}
            onClick={() => setShowMap((prev) => !prev)}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            {showMap ? "지도 닫기" : "지도 보기"}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2">
          {Object.keys(STATUS_META).map((status) => (
            <div key={status} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
              <p className="text-[11px] text-slate-500">{STATUS_META[status].label}</p>
              <p className="mt-0.5 text-sm font-extrabold text-slate-800">{statusSummary[status] || 0}</p>
            </div>
          ))}
        </div>
      </article>

      {showTeamList && (
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름/번호/구역/업무 검색"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {[{ value: ALL_TEAM, label: "전체 팀" }, ...teamOptions.map((team) => ({ value: team, label: team }))].map(
              (option) => {
                const active = teamFilter === option.value;
                return (
                  <button
                    key={`team-filter-${option.value}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTeamFilter(option.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                      active
                        ? "border-cyan-500 bg-cyan-600 text-white shadow-[0_0_12px_rgba(8,145,178,0.4)]"
                        : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              },
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { value: ALL_STATUS, label: "전체 상태" },
              ...Object.keys(STATUS_META).map((status) => ({
                value: status,
                label: STATUS_META[status].label,
              })),
            ].map((option) => {
              const active = statusFilter === option.value;
              return (
                <button
                  key={`status-filter-${option.value}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(option.value)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                    active
                      ? "border-cyan-500 bg-cyan-600 text-white shadow-[0_0_12px_rgba(8,145,178,0.4)]"
                      : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-slate-500">필터 결과 {filteredStaff.length}명 / 전체 {enrichedStaff.length}명</p>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {filteredStaff.map((item) => (
              <div
                key={`staff-card-${item.staffNo}`}
                className={`rounded-lg border p-2.5 ${
                  item.staffNo === me?.staffNo ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {item.name} <span className="text-xs text-slate-500">({item.staffNo})</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">{item.team}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      STATUS_META[item.status]?.chip || "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {item.statusLabel || STATUS_META[item.status]?.label}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-700">업무: {item.currentTask || "-"}</p>
                <p className="mt-1 text-xs text-slate-700">위치: {item.zoneName}</p>
                {item.currentNote && (
                  <p className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                    메모: {item.currentNote}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">갱신: {item.lastUpdatedAt?.replace("T", " ").slice(5, 16)}</p>
              </div>
            ))}
          </div>
        </article>
      )}

      {showMap && (
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">스태프 위치 지도</p>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            <MapContainer
              center={[AJOU_CENTER.latitude, AJOU_CENTER.longitude]}
              zoom={17}
              maxZoom={21}
              className="h-72 w-full"
            >
              <TileLayer attribution="&copy; OpenStreetMap 기여자" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {filteredStaff.map((item) => (
                <CircleMarker
                  key={item.staffNo}
                  center={[item.latitude, item.longitude]}
                  radius={7}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 1.5,
                    fillColor: STATUS_META[item.status]?.map || "#64748b",
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <p className="text-xs font-bold">
                      {item.name} ({item.staffNo})
                    </p>
                    <p className="text-xs mt-1">팀: {item.team}</p>
                    <p className="text-xs">상태: {item.statusLabel || STATUS_META[item.status]?.label}</p>
                    <p className="text-xs">업무: {item.currentTask || "-"}</p>
                    <p className="text-xs">위치: {item.zoneName}</p>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </article>
      )}
    </section>
  );
}
