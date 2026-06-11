import { useEffect, useMemo, useState } from "react";
import {
  createAdminAiNoticeDraft,
  createBooth,
  createEvent,
  createNotice,
  deleteBooth,
  deleteEvent,
  deleteNotice,
  fetchAdminAiBriefing,
  fetchAdminDashboardKpis,
  fetchAdminNotices,
  fetchAdminStaff,
  fetchAuditLogs,
  fetchBooths,
  fetchEvents,
  importBoothCsv,
  importEventCsv,
  loginAdmin,
  reorderBooths,
  triggerCongestionReliefNotice,
  triggerEventStartNotice,
  updateAdminStaff,
  updateBooth,
  updateBoothLiveStatus,
  updateEvent,
  updateNotice,
  uploadBoothImage,
} from "../api";
import {
  IconAlert,
  IconCalendar,
  IconClipboard,
  IconEye,
  IconEyeOff,
  IconClock,
  IconMapPin,
  IconRefresh,
  IconSettings,
  IconShield,
  IconSparkles,
  IconUsers,
} from "../components/UxIcons";
import OpsMasterPage from "./OpsMasterPage";
import { clearLogin, getAdminName, isLoggedIn, saveLogin } from "../utils/auth";

const NOTICE_CATEGORIES = ["긴급", "분실물", "우천", "일반"];

const initialBooth = {
  name: "",
  latitude: "",
  longitude: "",
  description: "",
  imageUrl: "",
  estimatedWaitMinutes: "",
  remainingStock: "",
  liveStatusMessage: "",
};

const initialEvent = {
  title: "",
  startTime: "",
  endTime: "",
  imageUrl: "",
  imageCredit: "",
  imageFocus: "",
  statusOverride: "",
  liveMessage: "",
  delayMinutes: "",
};

const initialNotice = {
  title: "",
  content: "",
  category: "긴급",
  active: true,
};

function adminErrorMessage(error) {
  if (error?.status === 401 || error?.status === 403) {
    return "권한이 만료되었거나 로그인이 필요합니다. 다시 로그인해 주세요.";
  }
  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }
  return "요청을 처리하지 못했습니다.";
}

function isUnauthorizedLike(error) {
  return error?.status === 401 || error?.status === 403;
}

function parseNumber(value, label, { required = false } = {}) {
  const raw = value == null ? "" : String(value).trim();
  if (raw === "") {
    if (required) {
      throw new Error(`${label}은(는) 필수 값입니다.`);
    }
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}은(는) 숫자 형식이어야 합니다.`);
  }
  return parsed;
}

function toApiDateTime(value) {
  return value && value.length === 16 ? `${value}:00` : value;
}

function normalizeNoticeCategory(category) {
  if (NOTICE_CATEGORIES.includes(category)) return category;
  if (category === "분실물") return "분실물";
  if (category === "긴급") return "긴급";
  return "일반";
}

function moveItem(list, fromId, toId) {
  const fromIndex = list.findIndex((item) => item.id === fromId);
  const toIndex = list.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;

  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [adminName, setAdminName] = useState(getAdminName());
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const [kpi, setKpi] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [booths, setBooths] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [aiBriefing, setAiBriefing] = useState(null);
  const [aiNoticeDraft, setAiNoticeDraft] = useState(null);
  const [aiDraftType, setAiDraftType] = useState("congestion");
  const [aiPrompt, setAiPrompt] = useState("");

  const [boothForm, setBoothForm] = useState(initialBooth);
  const [eventForm, setEventForm] = useState(initialEvent);
  const [noticeForm, setNoticeForm] = useState(initialNotice);
  const [editingBoothId, setEditingBoothId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingNoticeId, setEditingNoticeId] = useState(null);

  const [importFiles, setImportFiles] = useState({ booths: null, events: null });
  const [uploadFiles, setUploadFiles] = useState({});
  const [draggingBoothId, setDraggingBoothId] = useState(null);
  const [boothLiveDrafts, setBoothLiveDrafts] = useState({});
  const [staffDrafts, setStaffDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState({});

  const sortedBooths = useMemo(
    () => [...booths].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)),
    [booths],
  );
  const isBusy = isLoading || Object.keys(actionBusy).length > 0;
  const isLoginPending = isActionBusy("admin-login");

  function isActionBusy(actionKey) {
    return Boolean(actionBusy[actionKey]);
  }

  async function runAdminAction(actionKey, progressMessage, action, successMessage = "") {
    if (isActionBusy(actionKey)) return;
    setActionBusy((prev) => ({ ...prev, [actionKey]: true }));
    setMessage(progressMessage);
    try {
      await action();
      if (successMessage) setMessage(successMessage);
    } catch (error) {
      if (isUnauthorizedLike(error)) {
        clearLogin();
        setLoggedIn(false);
        setAdminName("");
      }
      throw error;
    } finally {
      setActionBusy((prev) => {
        const next = { ...prev };
        delete next[actionKey];
        return next;
      });
    }
  }

  async function loadAll() {
    setIsLoading(true);
    setMessage("관리자 대시보드 동기화 중...");

    try {
      const [boothResult, eventResult, noticeResult, kpiResult, logResult, staffResult, aiResult] = await Promise.allSettled([
        fetchBooths(),
        fetchEvents(),
        fetchAdminNotices(),
        fetchAdminDashboardKpis(),
        fetchAuditLogs(),
        fetchAdminStaff(),
        fetchAdminAiBriefing(),
      ]);

      const boothData = boothResult.status === "fulfilled" && Array.isArray(boothResult.value) ? boothResult.value : [];
      const eventData = eventResult.status === "fulfilled" && Array.isArray(eventResult.value) ? eventResult.value : [];
      const noticeData = noticeResult.status === "fulfilled" && Array.isArray(noticeResult.value) ? noticeResult.value : [];
      const logData = logResult.status === "fulfilled" && Array.isArray(logResult.value) ? logResult.value : [];
      const staffData = staffResult.status === "fulfilled" && Array.isArray(staffResult.value) ? staffResult.value : [];
      const kpiData = kpiResult.status === "fulfilled" ? kpiResult.value : null;
      const aiData = aiResult.status === "fulfilled" ? aiResult.value : null;

      setBooths(boothData);
      setEvents(eventData);
      setNotices(noticeData);
      setKpi(kpiData);
      setAuditLogs(logData);
      setStaffMembers(staffData);
      if (aiData) {
        setAiBriefing(aiData);
      }

      if (boothResult.status === "fulfilled") {
        setBoothLiveDrafts(
          Object.fromEntries(
            boothData.map((booth) => [
              booth.id,
              {
                estimatedWaitMinutes: booth.estimatedWaitMinutes ?? "",
                remainingStock: booth.remainingStock ?? "",
                liveStatusMessage: booth.liveStatusMessage ?? "",
              },
            ]),
          ),
        );
      } else {
        setBoothLiveDrafts({});
      }

      if (staffResult.status === "fulfilled") {
        setStaffDrafts(
          Object.fromEntries(
            staffData.map((staff) => [
              staff.id,
              {
                team: staff.team ?? "",
                status: staff.status ?? "STANDBY",
                currentTask: staff.currentTask ?? "",
                currentNote: staff.currentNote ?? "",
                assignedBoothId: staff.assignedBoothId ?? "",
              },
            ]),
          ),
        );
      } else {
        setStaffDrafts({});
      }

      const anyUnauthorized = [noticeResult, kpiResult, logResult, staffResult, aiResult].some(
        (result) => result.status === "rejected" && isUnauthorizedLike(result.reason),
      );
      if (anyUnauthorized) {
        clearLogin();
        setLoggedIn(false);
        setAdminName("");
        setBooths([]);
        setEvents([]);
        setNotices([]);
        setKpi(null);
        setAuditLogs([]);
        setStaffMembers([]);
        setAiBriefing(null);
        setAiNoticeDraft(null);
        setBoothLiveDrafts({});
        setStaffDrafts({});
        setMessage("권한이 만료되었거나 로그인이 필요합니다. 다시 로그인해 주세요.");
        return;
      }

      if (eventResult.status === "rejected") {
        setMessage(adminErrorMessage(eventResult.reason));
      }
      if (noticeResult.status === "rejected") {
        setMessage(adminErrorMessage(noticeResult.reason));
      }
      if (kpiResult.status === "rejected") {
        setMessage(adminErrorMessage(kpiResult.reason));
      }
      if (logResult.status === "rejected") {
        setMessage(adminErrorMessage(logResult.reason));
      }
      if (staffResult.status === "rejected") {
        setMessage(adminErrorMessage(staffResult.reason));
      }
      if (aiResult.status === "rejected" && !isUnauthorizedLike(aiResult.reason)) {
        setMessage(adminErrorMessage(aiResult.reason));
      }
      if (boothResult.status === "rejected") {
        setMessage(adminErrorMessage(boothResult.reason));
      }
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshAiBriefing({ silent = false } = {}) {
    try {
      const next = await fetchAdminAiBriefing();
      setAiBriefing(next);
      if (!silent) {
        setMessage("AI 운영 브리핑을 갱신했습니다.");
      }
    } catch (error) {
      if (isUnauthorizedLike(error)) {
        clearLogin();
        setLoggedIn(false);
        setAdminName("");
        return;
      }
      if (!silent) {
        setMessage(adminErrorMessage(error));
      }
    }
  }

  function resetBoothForm() {
    setBoothForm(initialBooth);
    setEditingBoothId(null);
  }

  function resetEventForm() {
    setEventForm(initialEvent);
    setEditingEventId(null);
  }

  function resetNoticeForm() {
    setNoticeForm(initialNotice);
    setEditingNoticeId(null);
  }

  function beginEditBooth(booth) {
    setEditingBoothId(booth.id);
    setBoothForm({
      name: booth.name || "",
      latitude: String(booth.latitude ?? ""),
      longitude: String(booth.longitude ?? ""),
      description: booth.description || "",
      imageUrl: booth.imageUrl || "",
      estimatedWaitMinutes: booth.estimatedWaitMinutes ?? "",
      remainingStock: booth.remainingStock ?? "",
      liveStatusMessage: booth.liveStatusMessage || "",
    });
  }

  function beginEditEvent(event) {
    setEditingEventId(event.id);
    setEventForm({
      title: event.title || "",
      startTime: event.startTime?.slice(0, 16) || "",
      endTime: event.endTime?.slice(0, 16) || "",
      imageUrl: event.imageUrl || "",
      imageCredit: event.imageCredit || "",
      imageFocus: event.imageFocus || "",
      statusOverride: event.statusOverride || "",
      liveMessage: event.liveMessage || "",
      delayMinutes: event.delayMinutes ?? "",
    });
  }

  function beginEditNotice(notice) {
    setEditingNoticeId(notice.id);
    setNoticeForm({
      title: notice.title || "",
      content: notice.content || "",
      category: notice.category || "긴급",
      active: Boolean(notice.active),
    });
  }

  useEffect(() => {
    if (loggedIn) {
      loadAll();
    }
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    const timer = window.setInterval(() => {
      refreshAiBriefing({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loggedIn]);

  async function handleLogin(e) {
    e.preventDefault();
    if (!loginForm.username.trim() || !loginForm.password) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      await runAdminAction("admin-login", "로그인 처리 중...", async () => {
        const data = await loginAdmin(loginForm.username.trim(), loginForm.password);
        saveLogin(data.token, data.username);
        setAdminName(data.username);
        setLoggedIn(true);
        setMessage("관리자 로그인이 완료되었습니다.");
        setLoginForm({ username: "", password: "" });
        setShowPassword(false);
      });
    } catch (error) {
      setMessage(adminErrorMessage(error));
    }
  }

  function handleLogout() {
    clearLogin();
    setLoggedIn(false);
    setAdminName("");
    setAiBriefing(null);
    setAiNoticeDraft(null);
    setMessage("로그아웃되었습니다.");
  }

  async function handleQuickCongestionNotice() {
    if (!window.confirm("혼잡 완화 공지를 즉시 발행할까요?")) return;
    await runAdminAction("quick-congestion-notice", "혼잡 완화 공지를 발행 중입니다.", async () => {
      await triggerCongestionReliefNotice();
      setMessage("혼잡 완화 공지를 발행했습니다.");
      await loadAll();
    });
  }

  async function handleQuickEventStartNotice(eventId) {
    if (!window.confirm("공연 시작 공지를 발행할까요?")) return;
    await runAdminAction(`quick-event-notice-${eventId}`, "공연 시작 공지를 발행 중입니다.", async () => {
      await triggerEventStartNotice(eventId);
      setMessage("공연 시작 공지를 발행했습니다.");
      await loadAll();
    });
  }

  async function handleAiNoticeDraft() {
    await runAdminAction("admin-ai-notice-draft", "AI가 현재 혼잡 상황과 공지 문구를 분석 중입니다.", async () => {
      const draft = await createAdminAiNoticeDraft(aiDraftType, aiPrompt);
      setAiNoticeDraft(draft);
      setNoticeForm({
        title: draft.draftTitle || "축제 운영 안내",
        content: draft.draftContent || draft.summary || "현장 상황에 따라 안내를 확인해 주세요.",
        category: normalizeNoticeCategory(draft.draftCategory),
        active: true,
      });
      setEditingNoticeId(null);
      setMessage("AI 공지 추천을 공지 입력칸에 반영했습니다. 확인 후 등록하세요.");
      scrollToAdminSection("admin-notices");
    });
  }

  async function handleSaveBoothLiveStatus(boothId) {
    await runAdminAction(`booth-live-save-${boothId}`, "부스 실시간 정보를 저장 중입니다.", async () => {
      const draft = boothLiveDrafts[boothId] || {};
      const estimatedWaitMinutes = parseNumber(draft.estimatedWaitMinutes, "대기 분", { required: false });
      const remainingStock = parseNumber(draft.remainingStock, "잔여 수량", { required: false });

      await updateBoothLiveStatus(boothId, {
        estimatedWaitMinutes,
        remainingStock,
        liveStatusMessage: draft.liveStatusMessage || null,
      });
      setMessage("부스 실시간 운영 정보를 저장했습니다.");
      await loadAll();
    });
  }

  async function handleSaveStaff(staffId) {
    await runAdminAction(`staff-save-${staffId}`, "스태프 정보를 저장 중입니다.", async () => {
      const draft = staffDrafts[staffId] || {};
      await updateAdminStaff(staffId, {
        team: draft.team || null,
        status: draft.status || "STANDBY",
        currentTask: draft.currentTask || null,
        currentNote: draft.currentNote || null,
        assignedBoothId: draft.assignedBoothId === "" || draft.assignedBoothId == null ? null : Number(draft.assignedBoothId),
      });
      setMessage("스태프 정보를 저장했습니다.");
      await loadAll();
    });
  }

  async function handleBoothSubmit(e) {
    e.preventDefault();
    const parsedLatitude = parseNumber(boothForm.latitude, "위도", { required: true });
    const parsedLongitude = parseNumber(boothForm.longitude, "경도", { required: true });
    const estimatedWaitMinutes = parseNumber(boothForm.estimatedWaitMinutes, "대기 분", { required: false });
    const remainingStock = parseNumber(boothForm.remainingStock, "잔여 수량", { required: false });

    await runAdminAction(editingBoothId ? `booth-update-${editingBoothId}` : "booth-create", "부스를 저장 중입니다.", async () => {
      const payload = {
        name: boothForm.name.trim(),
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        description: boothForm.description.trim(),
        imageUrl: boothForm.imageUrl.trim(),
        estimatedWaitMinutes,
        remainingStock,
        liveStatusMessage: boothForm.liveStatusMessage.trim(),
      };

      if (editingBoothId) {
        await updateBooth(editingBoothId, payload);
        setMessage("부스를 수정했습니다.");
      } else {
        await createBooth(payload);
        setMessage("부스를 등록했습니다.");
      }

      resetBoothForm();
      await loadAll();
    });
  }

  async function handleEventSubmit(e) {
    e.preventDefault();
    const startTime = toApiDateTime(eventForm.startTime);
    const endTime = toApiDateTime(eventForm.endTime);

    if (!startTime || !endTime) {
      setMessage("공연 시작/종료 시간을 입력해 주세요.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
      setMessage("공연 시작 시간은 종료 시간보다 빨라야 합니다.");
      return;
    }

    const delayMinutes = parseNumber(eventForm.delayMinutes, "지연 시간", { required: false });

    await runAdminAction(editingEventId ? `event-update-${editingEventId}` : "event-create", "공연을 저장 중입니다.", async () => {
      const payload = {
        title: eventForm.title.trim(),
        startTime,
        endTime,
        imageUrl: eventForm.imageUrl.trim(),
        imageCredit: eventForm.imageCredit.trim(),
        imageFocus: eventForm.imageFocus.trim(),
        statusOverride: eventForm.statusOverride.trim(),
        liveMessage: eventForm.liveMessage.trim(),
        delayMinutes,
      };

      if (editingEventId) {
        await updateEvent(editingEventId, payload);
        setMessage("공연을 수정했습니다.");
      } else {
        await createEvent(payload);
        setMessage("공연을 등록했습니다.");
      }
      resetEventForm();
      await loadAll();
    });
  }

  async function handleNoticeSubmit(e) {
    e.preventDefault();

    await runAdminAction(editingNoticeId ? `notice-update-${editingNoticeId}` : "notice-create", "공지사항을 저장 중입니다.", async () => {
      if (editingNoticeId) {
        await updateNotice(editingNoticeId, noticeForm);
        setMessage("공지를 수정했습니다.");
      } else {
        await createNotice(noticeForm);
        setMessage("공지를 등록했습니다.");
      }
      resetNoticeForm();
      await loadAll();
    });
  }

  async function handleDeleteNotice(id) {
    if (!window.confirm("선택한 공지를 삭제할까요?")) return;
    await runAdminAction(`notice-delete-${id}`, "공지 삭제 중입니다.", async () => {
      await deleteNotice(id);
      setMessage("공지 삭제가 완료되었습니다.");
      await loadAll();
    });
  }

  async function handleDeleteBooth(id) {
    if (!window.confirm("선택한 부스를 삭제할까요?")) return;
    await runAdminAction(`booth-delete-${id}`, "부스 삭제 중입니다.", async () => {
      await deleteBooth(id);
      setMessage("부스 삭제가 완료되었습니다.");
      await loadAll();
    });
  }

  async function handleDeleteEvent(id) {
    if (!window.confirm("선택한 공연을 삭제할까요?")) return;
    await runAdminAction(`event-delete-${id}`, "공연 삭제 중입니다.", async () => {
      await deleteEvent(id);
      setMessage("공연 삭제가 완료되었습니다.");
      await loadAll();
    });
  }

  async function handleImport(type) {
    const file = importFiles[type];
    if (!file) {
      setMessage("업로드할 CSV 파일을 선택해 주세요.");
      return;
    }

    if (file.size <= 0) {
      setMessage("빈 파일은 업로드할 수 없습니다.");
      return;
    }

    const key = type === "booths" ? "booth-import-csv" : "event-import-csv";
    await runAdminAction(key, "CSV 업로드 중입니다.", async () => {
      const result = type === "booths" ? await importBoothCsv(file) : await importEventCsv(file);
      const count = result?.imported ?? 0;
      setMessage(`${type === "booths" ? "부스" : "공연"} CSV ${count}건 반영 완료`);
      setImportFiles((prev) => ({ ...prev, [type]: null }));
      await loadAll();
    });
  }

  async function handleImageUpload(boothId) {
    const file = uploadFiles[boothId];
    if (!file) {
      setMessage("업로드할 이미지를 먼저 선택해 주세요.");
      return;
    }

    await runAdminAction(`booth-image-${boothId}`, "부스 이미지를 업로드 중입니다.", async () => {
      await uploadBoothImage(boothId, file);
      setMessage("부스 이미지를 업로드했습니다.");
      await loadAll();
      setUploadFiles((prev) => ({ ...prev, [boothId]: null }));
    });
  }

  async function handleDropBooth(targetBoothId) {
    if (!draggingBoothId || draggingBoothId === targetBoothId) {
      setDraggingBoothId(null);
      return;
    }

    const reordered = moveItem(sortedBooths, draggingBoothId, targetBoothId);
    setBooths(reordered);

    await runAdminAction("booth-reorder", "부스 순서를 저장 중입니다.", async () => {
      await reorderBooths(reordered.map((item) => item.id));
      setMessage("부스 순서를 저장했습니다.");
      await loadAll();
    }).finally(() => {
      setDraggingBoothId(null);
    });
  }

  const activeNoticeCount = notices.filter((notice) => notice.active).length;
  const liveEventCount = events.filter((event) => {
    const start = new Date(event.startTime || "").getTime();
    const end = new Date(event.endTime || "").getTime();
    const now = Date.now();
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end;
  }).length;
  const urgentNotice = notices.find((notice) => notice.active && notice.category === "긴급")
    || notices.find((notice) => notice.active)
    || null;
  const congestionPercent = Math.max(0, Math.min(100, Math.round(Number(kpi?.mostCongestedBooth?.score ?? 0))));
  const congestionLabel =
    congestionPercent >= 85 ? "혼잡" : congestionPercent >= 60 ? "주의" : congestionPercent >= 30 ? "보통" : "원활";
  const isDashboardPending =
    isLoading
    && !kpi
    && booths.length === 0
    && events.length === 0
    && notices.length === 0
    && staffMembers.length === 0
    && auditLogs.length === 0;
  const displayBoothCount = isDashboardPending ? "..." : String(sortedBooths.length);
  const displayLiveEventCount = isDashboardPending ? "..." : String(liveEventCount);
  const displayUrgentNoticeCount = isDashboardPending
    ? "..."
    : String(notices.filter((notice) => notice.active && notice.category === "긴급").length);
  const displayCongestionValue = isDashboardPending ? "..." : `${congestionPercent}%`;
  const displayCongestionLabel = isDashboardPending ? "불러오는 중" : congestionLabel;
  const nextEventTitle = isDashboardPending ? "공연 확인 중" : kpi?.upcomingWithin30Minutes?.title || "예정 공연 없음";
  const nextEventTime = isDashboardPending
    ? "데이터 동기화 중"
    : kpi?.upcomingWithin30Minutes?.startTime?.slice(11, 16) || "대기중";
  const hotBoothTitle = isDashboardPending ? "혼잡도 확인 중" : kpi?.mostCongestedBooth?.boothName || "혼잡 부스 없음";
  const hotBoothMeta = isDashboardPending
    ? "실시간 수집 중"
    : kpi?.mostCongestedBooth?.score != null
      ? `혼잡도 ${Math.round(Number(kpi.mostCongestedBooth.score))}%`
      : "원활";
  const adminShortcutCards = [
    {
      id: "admin-booths",
      title: "부스",
      description: "현장 정보",
      icon: IconMapPin,
      tone: "blue",
      meta: `${sortedBooths.length}개`,
    },
    {
      id: "admin-events",
      title: "공연",
      description: "일정 관리",
      icon: IconCalendar,
      tone: "violet",
      meta: `${events.length}개`,
    },
    {
      id: "admin-notices",
      title: "공지",
      description: "긴급 안내",
      icon: IconAlert,
      tone: "rose",
      meta: `${activeNoticeCount}개`,
    },
    {
      id: "admin-ai-ops",
      title: "AI",
      description: "운영 판단",
      icon: IconSparkles,
      tone: "violet",
      meta: aiBriefing?.confidence || "분석",
    },
    {
      id: "admin-master",
      title: "통합 운영",
      description: "마스터 기능",
      icon: IconSettings,
      tone: "green",
      meta: "전체",
    },
    {
      id: "admin-staff",
      title: "스태프",
      description: "배치 편집",
      icon: IconUsers,
      tone: "sky",
      meta: `${staffMembers.length}명`,
    },
    {
      id: "admin-booths",
      title: "이미지",
      description: "부스 업로드",
      icon: IconShield,
      tone: "amber",
      meta: "부스",
    },
    {
      id: "admin-csv",
      title: "CSV",
      description: "일괄 반영",
      icon: IconClipboard,
      tone: "green",
      meta: "업로드",
    },
  ];

  function scrollToAdminSection(id) {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!loggedIn) {
    return (
      <section className="auth-entry-screen" data-i18n-skip>
        <div className="auth-entry-orb auth-entry-orb--violet" aria-hidden="true" />
        <div className="auth-entry-orb auth-entry-orb--cyan" aria-hidden="true" />
        <form className="auth-entry-card" onSubmit={handleLogin}>
          <p className="auth-entry-brand">Fest-A</p>
          <div className="auth-entry-copy">
            <h1>관리자 전용 페이지</h1>
            <p>안전하고 체계적인 축제 운영을 위한 관리자 시스템입니다.</p>
          </div>
          <div className="auth-entry-field">
            <input
              className="auth-entry-input"
              placeholder="아이디"
              value={loginForm.username}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
              autoComplete="username"
              required
            />
          </div>
          <div className="auth-entry-field auth-entry-field--password">
            <input
              type={showPassword ? "text" : "password"}
              className="auth-entry-input"
              placeholder="비밀번호"
              value={loginForm.password}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="current-password"
              required
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
          <button
            className="auth-entry-submit"
            type="submit"
            disabled={isLoginPending || isBusy}
          >
            {isLoginPending || isBusy ? "로그인 중" : "로그인"}
          </button>
          {message && !isLoginPending && <p className="auth-entry-message">{message}</p>}
          <p className="auth-entry-helper">
            관리자 계정이 없으신가요? <strong>문의하기</strong>
          </p>
        </form>
      </section>
    );
  }

  return (
    <section className="cyber-page admin-console-page" data-i18n-skip>
      <header className="admin-console-hero">
        <div className="admin-console-hero__top">
          <div className="admin-console-hero__copy">
            <span className="admin-console-hero__eyebrow">Fest-A Control</span>
            <h1>관리자 대시보드</h1>
            <p>{adminName} 계정으로 로그인됨 · 축제 운영 흐름을 한 화면에서 관리합니다.</p>
          </div>
          <div className="admin-console-hero__actions">
            <button
              type="button"
              onClick={() => loadAll().catch((error) => setMessage(adminErrorMessage(error)))}
              disabled={isBusy}
            >
              <IconRefresh className="h-4 w-4" />
              <span>새로고침</span>
            </button>
            <button type="button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <div className="admin-console-hero__summary-grid">
          <article className="admin-console-hero__summary-card">
            <span>다음 공연</span>
            <strong>{nextEventTitle}</strong>
            <small>
              <IconClock className="h-4 w-4" />
              <em>{nextEventTime}</em>
            </small>
          </article>
          <article className="admin-console-hero__summary-card admin-console-hero__summary-card--warm">
            <span>주의 부스</span>
            <strong>{hotBoothTitle}</strong>
            <small>{hotBoothMeta}</small>
          </article>
        </div>

        {(message || isLoading) && (
          <p className="admin-console-status">
            {isLoading ? "관리자 대시보드 동기화 중..." : message}
          </p>
        )}

        <div className="admin-console-kpi-grid">
          <article className="admin-console-kpi-card">
            <span>부스 수</span>
            <strong>{displayBoothCount}</strong>
            <small>전체</small>
          </article>
          <article className="admin-console-kpi-card">
            <span>진행 공연</span>
            <strong>{displayLiveEventCount}</strong>
            <small>진행중</small>
          </article>
          <article className="admin-console-kpi-card admin-console-kpi-card--alert">
            <span>긴급 공지</span>
            <strong>{displayUrgentNoticeCount}</strong>
            <small>활성중</small>
          </article>
          <article className="admin-console-kpi-card">
            <span>실시간 혼잡도</span>
            <strong>{displayCongestionValue}</strong>
            <small>{displayCongestionLabel}</small>
          </article>
        </div>

        <div className="admin-console-alert-banner">
          <div className="admin-console-alert-banner__icon">
            <IconAlert className="h-5 w-5" />
          </div>
          <div className="admin-console-alert-banner__copy">
            <strong>{isDashboardPending ? "데이터 불러오는 중" : urgentNotice ? "긴급 상황 알림" : "운영 상태 요약"}</strong>
            <p>
              {isDashboardPending
                ? "관리자 대시보드 데이터를 불러오고 있습니다."
                : urgentNotice
                ? `${urgentNotice.title} 공지가 ${urgentNotice.active ? "활성화" : "등록"}되어 있습니다.`
                : `${kpi?.upcomingWithin30Minutes?.title || "예정 공연 없음"} · ${kpi?.mostCongestedBooth?.boothName || "혼잡 부스 없음"}`}
            </p>
          </div>
          <button type="button" onClick={() => scrollToAdminSection(urgentNotice ? "admin-notices" : "admin-events")}>
            상세 보기
          </button>
        </div>
      </header>

      <section className="admin-console-action-strip">
        <button
          type="button"
          className="admin-console-action-card admin-console-action-card--rose"
          onClick={() => handleQuickCongestionNotice().catch((error) => setMessage(adminErrorMessage(error)))}
          disabled={isBusy || isActionBusy("quick-congestion-notice")}
        >
          <span>즉시 대응</span>
          <strong>혼잡 완화 공지</strong>
          <small>메인 홈에 빠르게 안내를 발행합니다.</small>
        </button>
        <button
          type="button"
          className="admin-console-action-card admin-console-action-card--blue"
          onClick={() => scrollToAdminSection("admin-notices")}
        >
          <span>공지 센터</span>
          <strong>긴급 공지 관리</strong>
          <small>{activeNoticeCount}개 활성 공지를 바로 수정합니다.</small>
        </button>
        <button
          type="button"
          className="admin-console-action-card admin-console-action-card--violet"
          onClick={() => handleAiNoticeDraft().catch((error) => setMessage(adminErrorMessage(error)))}
          disabled={isBusy || isActionBusy("admin-ai-notice-draft")}
        >
          <span>AI 대응</span>
          <strong>공지 추천 생성</strong>
          <small>현재 혼잡 상황에 맞는 안내 문구를 준비합니다.</small>
        </button>
      </section>

      <section className="admin-console-section-shell">
        <div className="admin-console-section-headline">
          <h3>운영 도구</h3>
          <span>빠른 이동</span>
        </div>
        <div className="admin-console-shortcut-grid">
          {adminShortcutCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={`${card.id}-${card.title}`}
                type="button"
                className={`admin-console-shortcut admin-console-shortcut--${card.tone}`}
                onClick={() => scrollToAdminSection(card.id)}
              >
                <div className="admin-console-shortcut__icon">
                  <Icon className="h-5 w-5" />
                </div>
                <strong>{card.title}</strong>
                <small>{card.description}</small>
                <em>{card.meta}</em>
              </button>
            );
          })}
        </div>
      </section>

      <article id="admin-master" className="admin-console-panel admin-console-panel--master">
        <div className="admin-console-panel__head">
          <div>
            <span>통합 운영자</span>
            <h3>마스터 운영 콘솔</h3>
          </div>
          <strong>부스 · 공연 · 공지 · 로그</strong>
        </div>
        <p className="admin-console-hint">
          기존 /ops/master 기능을 관리자 페이지 안으로 통합했습니다. 로컬에서는 운영 키 0000으로 자동 연결됩니다.
        </p>
        <OpsMasterPage embedded />
      </article>

      <article id="admin-ai-ops" className="admin-console-panel admin-console-panel--ai-ops">
        <div className="admin-console-panel__head">
          <div>
            <span>실시간 운영 판단</span>
            <h3>AI 혼잡 분석 / 공지 추천</h3>
          </div>
          <button
            type="button"
            className="admin-console-mini-button"
            onClick={() => refreshAiBriefing().catch((error) => setMessage(adminErrorMessage(error)))}
            disabled={isBusy || isActionBusy("admin-ai-notice-draft")}
          >
            AI 갱신
          </button>
        </div>
        <div className="admin-console-ai-summary">
          <div>
            <span>{aiBriefing?.title || "AI 운영 브리핑"}</span>
            <strong>{aiBriefing?.summary || "현재 현장 데이터를 분석해 혼잡 구역과 운영 조치를 추천합니다."}</strong>
          </div>
          <em>{aiBriefing?.confidence || "대기"}</em>
        </div>
        <div className="admin-console-ai-grid">
          <div>
            <p>감지된 상황</p>
            {(aiBriefing?.highlights?.length ? aiBriefing.highlights : ["혼잡 데이터 수집 대기 중"]).slice(0, 4).map((item, index) => (
              <span key={`ai-highlight-${index}`}>{item}</span>
            ))}
          </div>
          <div>
            <p>추천 조치</p>
            {(aiBriefing?.recommendedActions?.length ? aiBriefing.recommendedActions : ["혼잡 부스와 무대 상태를 확인하세요."]).slice(0, 4).map((item, index) => (
              <span key={`ai-action-${index}`}>{item}</span>
            ))}
          </div>
        </div>
        <div className="admin-console-ai-draft">
          <select
            className="admin-console-input admin-console-input--dense"
            value={aiDraftType}
            onChange={(e) => setAiDraftType(e.target.value)}
          >
            <option value="congestion">혼잡 완화</option>
            <option value="event">공연 안내</option>
            <option value="booth">부스 운영</option>
            <option value="lost">분실물 안내</option>
          </select>
          <input
            className="admin-console-input admin-console-input--dense"
            placeholder="추가 요청 예: 주점 쪽 우회 안내 강조"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <button
            type="button"
            className="admin-console-submit admin-console-submit--violet"
            onClick={() => handleAiNoticeDraft().catch((error) => setMessage(adminErrorMessage(error)))}
            disabled={isBusy || isActionBusy("admin-ai-notice-draft")}
          >
            공지 추천
          </button>
        </div>
        {aiNoticeDraft?.draftTitle && (
          <div className="admin-console-ai-preview">
            <span>{normalizeNoticeCategory(aiNoticeDraft.draftCategory)}</span>
            <strong>{aiNoticeDraft.draftTitle}</strong>
            <p>{aiNoticeDraft.draftContent}</p>
          </div>
        )}
      </article>

      <article id="admin-notices" className="admin-console-panel admin-console-panel--notice">
        <div className="admin-console-panel__head">
          <div>
            <span>콘텐츠 관리</span>
            <h3>공지 등록 / 수정</h3>
          </div>
          <strong>{activeNoticeCount}개 활성</strong>
        </div>
        <form
          className="admin-console-form"
          onSubmit={(e) => handleNoticeSubmit(e).catch((error) => setMessage(adminErrorMessage(error)))}
        >
          <input
            className="admin-console-input"
            placeholder="공지 제목"
            value={noticeForm.title}
            onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))}
            required
          />
          <textarea
            className="admin-console-input admin-console-textarea"
            placeholder="공지 내용"
            rows={3}
            value={noticeForm.content}
            onChange={(e) => setNoticeForm((p) => ({ ...p, content: e.target.value }))}
            required
          />
          <div className="admin-console-inline-grid">
            <select
              className="admin-console-input"
              value={noticeForm.category}
              onChange={(e) => setNoticeForm((p) => ({ ...p, category: e.target.value }))}
            >
              {NOTICE_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <label className="admin-console-checkline">
              <input
                type="checkbox"
                checked={noticeForm.active}
                onChange={(e) => setNoticeForm((p) => ({ ...p, active: e.target.checked }))}
              />
              홈 노출 활성화
            </label>
          </div>
          <button className="admin-console-submit admin-console-submit--rose" disabled={isBusy}>
            {editingNoticeId ? "공지 수정" : "공지 등록"}
          </button>
        </form>
        <div className="admin-console-list">
          {notices.map((notice) => (
            <div key={notice.id} className="admin-console-list-card">
              <div className="admin-console-list-card__head">
                <p>[{notice.category}] {notice.title}</p>
                <span className={notice.active ? "admin-console-badge admin-console-badge--green" : "admin-console-badge"}>
                  {notice.active ? "활성" : "비활성"}
                </span>
              </div>
              <small>{notice.content}</small>
              <div className="admin-console-action-row">
                <button type="button" onClick={() => beginEditNotice(notice)} disabled={isBusy}>수정</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleDeleteNotice(notice.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  disabled={isBusy || isActionBusy(`notice-delete-${notice.id}`)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article id="admin-booths" className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>현장 관리</span>
            <h3>부스 등록 / 수정</h3>
          </div>
          <strong>{sortedBooths.length}개 운영중</strong>
        </div>
        <form
          className="admin-console-form"
          onSubmit={(e) => handleBoothSubmit(e).catch((error) => setMessage(adminErrorMessage(error)))}
        >
          <input
            className="admin-console-input"
            placeholder="부스 이름"
            value={boothForm.name}
            onChange={(e) => setBoothForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <div className="admin-console-inline-grid">
            <input
              className="admin-console-input"
              placeholder="위도"
              value={boothForm.latitude}
              onChange={(e) => setBoothForm((p) => ({ ...p, latitude: e.target.value }))}
              required
            />
            <input
              className="admin-console-input"
              placeholder="경도"
              value={boothForm.longitude}
              onChange={(e) => setBoothForm((p) => ({ ...p, longitude: e.target.value }))}
              required
            />
          </div>
          <textarea
            className="admin-console-input admin-console-textarea"
            placeholder="설명"
            value={boothForm.description}
            onChange={(e) => setBoothForm((p) => ({ ...p, description: e.target.value }))}
            required
          />
          <div className="admin-console-inline-grid">
            <input
              className="admin-console-input"
              placeholder="대기 시간(분)"
              value={boothForm.estimatedWaitMinutes}
              onChange={(e) => setBoothForm((p) => ({ ...p, estimatedWaitMinutes: e.target.value }))}
            />
            <input
              className="admin-console-input"
              placeholder="잔여 수량"
              value={boothForm.remainingStock}
              onChange={(e) => setBoothForm((p) => ({ ...p, remainingStock: e.target.value }))}
            />
          </div>
          <input
            className="admin-console-input"
            placeholder="실시간 운영 메모"
            value={boothForm.liveStatusMessage}
            onChange={(e) => setBoothForm((p) => ({ ...p, liveStatusMessage: e.target.value }))}
          />
          <input
            className="admin-console-input"
            placeholder="이미지 URL (선택)"
            value={boothForm.imageUrl}
            onChange={(e) => setBoothForm((p) => ({ ...p, imageUrl: e.target.value }))}
          />
          <button className="admin-console-submit" disabled={isBusy}>
            {editingBoothId ? "부스 수정" : "부스 추가"}
          </button>
        </form>
        <p className="admin-console-hint">드래그로 순서를 바꾸고, 대기/잔여 정보와 이미지를 같은 카드에서 즉시 저장합니다.</p>
        <div className="admin-console-list">
          {sortedBooths.map((booth) => (
            <div
              key={booth.id}
              draggable
              onDragStart={() => setDraggingBoothId(booth.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropBooth(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
              className={`admin-console-list-card ${draggingBoothId === booth.id ? "is-dragging" : ""}`}
            >
              <div className="admin-console-list-card__head">
                <p>#{booth.displayOrder} {booth.name}</p>
                <div className="admin-console-action-row">
                  <button type="button" onClick={() => beginEditBooth(booth)} disabled={isBusy}>수정</button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => handleDeleteBooth(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
                    disabled={isBusy || isActionBusy(`booth-delete-${booth.id}`)}
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="admin-console-inline-grid admin-console-inline-grid--triple">
                <input
                  className="admin-console-input admin-console-input--dense"
                  placeholder="대기 분"
                  value={boothLiveDrafts[booth.id]?.estimatedWaitMinutes ?? ""}
                  onChange={(e) =>
                    setBoothLiveDrafts((p) => ({
                      ...p,
                      [booth.id]: { ...p[booth.id], estimatedWaitMinutes: e.target.value },
                    }))
                  }
                />
                <input
                  className="admin-console-input admin-console-input--dense"
                  placeholder="잔여 수량"
                  value={boothLiveDrafts[booth.id]?.remainingStock ?? ""}
                  onChange={(e) =>
                    setBoothLiveDrafts((p) => ({
                      ...p,
                      [booth.id]: { ...p[booth.id], remainingStock: e.target.value },
                    }))
                  }
                />
                <button
                  type="button"
                  className="admin-console-mini-button"
                  onClick={() => handleSaveBoothLiveStatus(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  disabled={isBusy || isActionBusy(`booth-live-save-${booth.id}`)}
                >
                  실시간 저장
                </button>
              </div>
              <input
                className="admin-console-input admin-console-input--dense"
                placeholder="운영 메모"
                value={boothLiveDrafts[booth.id]?.liveStatusMessage ?? ""}
                onChange={(e) =>
                  setBoothLiveDrafts((p) => ({
                    ...p,
                    [booth.id]: { ...p[booth.id], liveStatusMessage: e.target.value },
                  }))
                }
              />
              <div className="admin-console-file-row">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="admin-console-file-input"
                  onChange={(e) =>
                    setUploadFiles((prev) => ({ ...prev, [booth.id]: e.target.files?.[0] || null }))
                  }
                />
                <button
                  type="button"
                  className="admin-console-mini-button"
                  onClick={() => handleImageUpload(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  disabled={isBusy || isActionBusy(`booth-image-${booth.id}`)}
                >
                  이미지 업로드
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article id="admin-events" className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>콘텐츠 관리</span>
            <h3>공연 등록 / 수정</h3>
          </div>
          <strong>{events.length}개 일정</strong>
        </div>
        <form
          className="admin-console-form"
          onSubmit={(e) => handleEventSubmit(e).catch((error) => setMessage(adminErrorMessage(error)))}
        >
          <input
            className="admin-console-input"
            placeholder="공연 제목"
            value={eventForm.title}
            onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))}
            required
          />
          <div className="admin-console-inline-grid">
            <input
              type="datetime-local"
              className="admin-console-input"
              value={eventForm.startTime}
              onChange={(e) => setEventForm((p) => ({ ...p, startTime: e.target.value }))}
              required
            />
            <input
              type="datetime-local"
              className="admin-console-input"
              value={eventForm.endTime}
              onChange={(e) => setEventForm((p) => ({ ...p, endTime: e.target.value }))}
              required
            />
          </div>
          <input
            className="admin-console-input"
            placeholder="라인업 이미지 URL"
            value={eventForm.imageUrl}
            onChange={(e) => setEventForm((p) => ({ ...p, imageUrl: e.target.value }))}
          />
          <div className="admin-console-inline-grid">
            <input
              className="admin-console-input"
              placeholder="이미지 출처"
              value={eventForm.imageCredit}
              onChange={(e) => setEventForm((p) => ({ ...p, imageCredit: e.target.value }))}
            />
            <input
              className="admin-console-input"
              placeholder="지연 시간(분)"
              value={eventForm.delayMinutes}
              onChange={(e) => setEventForm((p) => ({ ...p, delayMinutes: e.target.value }))}
            />
          </div>
          <input
            className="admin-console-input"
            placeholder="이미지 초점 위치 예: center 42%"
            value={eventForm.imageFocus}
            onChange={(e) => setEventForm((p) => ({ ...p, imageFocus: e.target.value }))}
          />
          <button className="admin-console-submit admin-console-submit--violet" disabled={isBusy}>
            {editingEventId ? "공연 수정" : "공연 추가"}
          </button>
        </form>
        <div className="admin-console-list">
          {events.map((event) => (
            <div key={event.id} className="admin-console-list-card">
              <div className="admin-console-list-card__head">
                <p>{event.title}</p>
                <span className="admin-console-badge admin-console-badge--blue">
                  {event.startTime?.slice(11, 16) || "--:--"}
                </span>
              </div>
              <small>{event.startTime?.slice(0, 16).replace("T", " ")} ~ {event.endTime?.slice(11, 16) || "--:--"}</small>
              <div className="admin-console-action-row">
                <button
                  type="button"
                  onClick={() => handleQuickEventStartNotice(event.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  disabled={isBusy || isActionBusy(`quick-event-notice-${event.id}`)}
                >
                  시작 공지
                </button>
                <button type="button" onClick={() => beginEditEvent(event)} disabled={isBusy}>수정</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleDeleteEvent(event.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  disabled={isBusy || isActionBusy(`event-delete-${event.id}`)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article id="admin-staff" className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>운영 인력</span>
            <h3>스태프 배치 편집</h3>
          </div>
          <strong>{staffMembers.length}명</strong>
        </div>
        <p className="admin-console-hint">팀, 상태, 담당 구역, 현재 업무를 수정하면 스태프 화면에 실시간 반영됩니다.</p>
        <div className="admin-console-list admin-console-list--compact">
          {staffMembers.map((staff) => (
            <div key={staff.id} className="admin-console-list-card">
              <div className="admin-console-list-card__head">
                <p>{staff.name} ({staff.staffNo})</p>
                <span className="admin-console-badge">{staff.statusLabel}</span>
              </div>
              <div className="admin-console-inline-grid">
                <input
                  className="admin-console-input admin-console-input--dense"
                  placeholder="팀"
                  value={staffDrafts[staff.id]?.team ?? ""}
                  onChange={(e) =>
                    setStaffDrafts((prev) => ({ ...prev, [staff.id]: { ...prev[staff.id], team: e.target.value } }))
                  }
                />
                <select
                  className="admin-console-input admin-console-input--dense"
                  value={staffDrafts[staff.id]?.status ?? "STANDBY"}
                  onChange={(e) =>
                    setStaffDrafts((prev) => ({ ...prev, [staff.id]: { ...prev[staff.id], status: e.target.value } }))
                  }
                >
                  <option value="STANDBY">대기</option>
                  <option value="MOVING">이동</option>
                  <option value="ON_DUTY">업무중</option>
                  <option value="URGENT">긴급</option>
                </select>
              </div>
              <select
                className="admin-console-input admin-console-input--dense"
                value={staffDrafts[staff.id]?.assignedBoothId ?? ""}
                onChange={(e) =>
                  setStaffDrafts((prev) => ({
                    ...prev,
                    [staff.id]: { ...prev[staff.id], assignedBoothId: e.target.value },
                  }))
                }
              >
                <option value="">순환 구역(미지정)</option>
                {sortedBooths.map((booth) => (
                  <option key={`staff-booth-${staff.id}-${booth.id}`} value={booth.id}>
                    #{booth.displayOrder} {booth.name}
                  </option>
                ))}
              </select>
              <input
                className="admin-console-input admin-console-input--dense"
                placeholder="현재 업무"
                value={staffDrafts[staff.id]?.currentTask ?? ""}
                onChange={(e) =>
                  setStaffDrafts((prev) => ({
                    ...prev,
                    [staff.id]: { ...prev[staff.id], currentTask: e.target.value },
                  }))
                }
              />
              <input
                className="admin-console-input admin-console-input--dense"
                placeholder="현장 메모"
                value={staffDrafts[staff.id]?.currentNote ?? ""}
                onChange={(e) =>
                  setStaffDrafts((prev) => ({
                    ...prev,
                    [staff.id]: { ...prev[staff.id], currentNote: e.target.value },
                  }))
                }
              />
              <button
                type="button"
                className="admin-console-submit admin-console-submit--sky"
                onClick={() => handleSaveStaff(staff.id).catch((error) => setMessage(adminErrorMessage(error)))}
                disabled={isBusy || isActionBusy(`staff-save-${staff.id}`)}
              >
                스태프 저장
              </button>
            </div>
          ))}
        </div>
      </article>

      <article id="admin-csv" className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>대량 작업</span>
            <h3>CSV 일괄 업로드</h3>
          </div>
          <strong>부스 / 공연</strong>
        </div>
        <div className="admin-console-upload-grid">
          <div className="admin-console-upload-card">
            <p>부스 CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFiles((prev) => ({ ...prev, booths: e.target.files?.[0] || null }))}
              className="admin-console-file-input"
            />
            <button
              type="button"
              className="admin-console-submit"
              onClick={() => handleImport("booths").catch((error) => setMessage(adminErrorMessage(error)))}
              disabled={isBusy}
            >
              부스 업로드
            </button>
          </div>
          <div className="admin-console-upload-card">
            <p>공연 CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFiles((prev) => ({ ...prev, events: e.target.files?.[0] || null }))}
              className="admin-console-file-input"
            />
            <button
              type="button"
              className="admin-console-submit admin-console-submit--violet"
              onClick={() => handleImport("events").catch((error) => setMessage(adminErrorMessage(error)))}
              disabled={isBusy}
            >
              공연 업로드
            </button>
          </div>
        </div>
      </article>

      <article id="admin-audit" className="admin-console-panel">
        <div className="admin-console-panel__head">
          <div>
            <span>최근 기록</span>
            <h3>관리자 작업 이력</h3>
          </div>
          <strong>{auditLogs.length}건</strong>
        </div>
        <div className="admin-console-list admin-console-list--compact">
          {auditLogs.length === 0 && <p className="admin-console-hint">아직 기록이 없습니다.</p>}
          {auditLogs.map((log) => (
            <div key={log.id} className="admin-console-list-card">
              <div className="admin-console-list-card__head">
                <p>{log.adminUsername} / {log.action}</p>
                <span className="admin-console-badge">{log.createdAt?.replace("T", " ").slice(5, 16)}</span>
              </div>
              <small>{log.targetType}</small>
              <small>{log.details}</small>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
