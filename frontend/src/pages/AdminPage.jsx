import { useEffect, useMemo, useState } from "react";
import {
  createBooth,
  createEvent,
  createNotice,
  deleteBooth,
  deleteEvent,
  deleteNotice,
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
  IconMapPin,
  IconSettings,
  IconShield,
  IconUsers,
} from "../components/UxIcons";
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

  const [kpi, setKpi] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [booths, setBooths] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);

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
      const [boothResult, eventResult, noticeResult, kpiResult, logResult, staffResult] = await Promise.allSettled([
        fetchBooths(),
        fetchEvents(),
        fetchAdminNotices(),
        fetchAdminDashboardKpis(),
        fetchAuditLogs(),
        fetchAdminStaff(),
      ]);

      const boothData = boothResult.status === "fulfilled" && Array.isArray(boothResult.value) ? boothResult.value : [];
      const eventData = eventResult.status === "fulfilled" && Array.isArray(eventResult.value) ? eventResult.value : [];
      const noticeData = noticeResult.status === "fulfilled" && Array.isArray(noticeResult.value) ? noticeResult.value : [];
      const logData = logResult.status === "fulfilled" && Array.isArray(logResult.value) ? logResult.value : [];
      const staffData = staffResult.status === "fulfilled" && Array.isArray(staffResult.value) ? staffResult.value : [];
      const kpiData = kpiResult.status === "fulfilled" ? kpiResult.value : null;

      setBooths(boothData);
      setEvents(eventData);
      setNotices(noticeData);
      setKpi(kpiData);
      setAuditLogs(logData);
      setStaffMembers(staffData);

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

      const anyUnauthorized = [noticeResult, kpiResult, logResult, staffResult].some(
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
      if (boothResult.status === "rejected") {
        setMessage(adminErrorMessage(boothResult.reason));
      }
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      setIsLoading(false);
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

  async function handleLogin(e) {
    e.preventDefault();
    if (!loginForm.username.trim() || !loginForm.password) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    await runAdminAction("admin-login", "로그인 처리 중...", async () => {
      const data = await loginAdmin(loginForm.username.trim(), loginForm.password);
      saveLogin(data.token, data.username);
      setAdminName(data.username);
      setLoggedIn(true);
      setMessage("관리자 로그인이 완료되었습니다.");
      setLoginForm({ username: "", password: "" });
    });
  }

  function handleLogout() {
    clearLogin();
    setLoggedIn(false);
    setAdminName("");
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

  if (!loggedIn) {
    return (
      <section className="cyber-page pt-4 space-y-3">
        <h2 className="text-lg font-bold text-role-ops inline-flex items-center gap-1.5">
          <IconShield className="h-5 w-5 icon-role-ops" />
          관리자 로그인
        </h2>
        <form className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" onSubmit={handleLogin}>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="아이디 0000"
            value={loginForm.username}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
            required
          />
          <input
            type="password"
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="비밀번호 0000"
            value={loginForm.password}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          <button
            className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold"
            type="submit"
            disabled={isActionBusy("admin-login") || isBusy}
          >
            로그인
          </button>
        </form>
        {message && <p className="text-sm text-rose-600">{message}</p>}
      </section>
    );
  }

  return (
    <section className="cyber-page pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-role-ops inline-flex items-center gap-1.5">
          <IconSettings className="h-5 w-5 icon-role-ops" />
          운영 관리자
        </h2>
        <button type="button" onClick={handleLogout} className="text-xs rounded-lg border px-2 py-1">
          로그아웃
        </button>
      </div>
      <p className="text-xs text-slate-500">로그인 사용자: {adminName}</p>
      {message && <p className="text-sm text-teal-700">{message}</p>}
      {isLoading && <p className="text-xs text-slate-500">관리자 대시보드 동기화 중...</p>}

      <article className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-role-log inline-flex items-center gap-1.5">
            <IconClipboard className="h-4 w-4 icon-role-log" />
            실시간 운영 KPI
          </h3>
          <button
            type="button"
            onClick={() => loadAll().catch((error) => setMessage(adminErrorMessage(error)))}
            className="text-xs rounded border px-2 py-1"
            disabled={isBusy}
          >
            갱신
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-teal-50 p-2">
            <p className="text-[10px] text-teal-700">오늘 총 방문</p>
            <p className="text-lg font-bold text-teal-800">{kpi?.todayVisitorCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <p className="text-[10px] text-amber-700">최대 혼잡 부스</p>
            <p className="text-xs font-bold text-amber-800 line-clamp-1">
              {kpi?.mostCongestedBooth?.boothName || "-"}
            </p>
            <p className="text-[10px] text-amber-700">
              {kpi?.mostCongestedBooth?.level || "-"} / {kpi?.mostCongestedBooth?.score ?? 0}
            </p>
          </div>
          <div className="rounded-lg bg-indigo-50 p-2">
            <p className="text-[10px] text-indigo-700">30분 내 공연</p>
            <p className="text-xs font-bold text-indigo-800 line-clamp-1">
              {kpi?.upcomingWithin30Minutes?.title || "-"}
            </p>
            <p className="text-[10px] text-indigo-700">
              {kpi?.upcomingWithin30Minutes?.startTime?.slice(11, 16) || "--:--"}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
        <h3 className="font-semibold text-rose-800 text-role-alert inline-flex items-center gap-1.5">
          <IconAlert className="h-4 w-4 icon-role-alert" />
          즉시 운영 조치
        </h3>
        <button
          type="button"
          onClick={() => handleQuickCongestionNotice().catch((error) => setMessage(adminErrorMessage(error)))}
          className="w-full rounded-lg bg-rose-600 text-white py-2 text-sm font-semibold"
          disabled={isBusy}
        >
          혼잡 완화 공지 발행
        </button>
        <div className="space-y-1">
          {events.map((event) => (
            <button
              key={`quick-${event.id}`}
              type="button"
              onClick={() => handleQuickEventStartNotice(event.id).catch((error) => setMessage(adminErrorMessage(error)))}
              className="w-full rounded-lg border border-rose-200 bg-white py-2 text-sm text-left px-3"
              disabled={isBusy || isActionBusy(`quick-event-notice-${event.id}`)}
            >
              <span className="font-semibold">{event.title}</span>
              <span className="text-xs text-slate-500 ml-2">공연 시작 공지 발행</span>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-alert inline-flex items-center gap-1.5">
          <IconAlert className="h-4 w-4 icon-role-alert" />
          운영 공지 관리
        </h3>
        <form
          className="space-y-2"
          onSubmit={(e) => handleNoticeSubmit(e).catch((error) => setMessage(adminErrorMessage(error)))}
        >
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="공지 제목"
            value={noticeForm.title}
            onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))}
            required
          />
          <textarea
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="공지 내용"
            rows={3}
            value={noticeForm.content}
            onChange={(e) => setNoticeForm((p) => ({ ...p, content: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded px-2 py-2 text-sm"
              value={noticeForm.category}
              onChange={(e) => setNoticeForm((p) => ({ ...p, category: e.target.value }))}
            >
              {NOTICE_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <label className="border rounded px-2 py-2 text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={noticeForm.active}
                onChange={(e) => setNoticeForm((p) => ({ ...p, active: e.target.checked }))}
              />
              홈 노출 활성화
            </label>
          </div>
          <button
            className="w-full rounded bg-rose-600 text-white py-2 text-sm"
            disabled={isBusy}
          >
            {editingNoticeId ? "공지 수정" : "공지 등록"}
          </button>
        </form>
        <div className="space-y-2">
          {notices.map((notice) => (
            <div key={notice.id} className="rounded-lg border border-slate-200 p-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">[{notice.category}] {notice.title}</p>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    notice.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {notice.active ? "활성" : "비활성"}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{notice.content}</p>
              <div className="mt-2 flex gap-1 justify-end">
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-slate-100 text-xs"
                  onClick={() => beginEditNotice(notice)}
                  disabled={isBusy}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs"
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

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-map inline-flex items-center gap-1.5">
          <IconMapPin className="h-4 w-4 icon-role-map" />
          부스 등록/수정
        </h3>
        <form
          className="space-y-2"
          onSubmit={(e) => handleBoothSubmit(e).catch((error) => setMessage(adminErrorMessage(error)))}
        >
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="부스 이름"
            value={boothForm.name}
            onChange={(e) => setBoothForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="위도"
              value={boothForm.latitude}
              onChange={(e) => setBoothForm((p) => ({ ...p, latitude: e.target.value }))}
              required
            />
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="경도"
              value={boothForm.longitude}
              onChange={(e) => setBoothForm((p) => ({ ...p, longitude: e.target.value }))}
              required
            />
          </div>
          <textarea
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="설명"
            value={boothForm.description}
            onChange={(e) => setBoothForm((p) => ({ ...p, description: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="대기 시간(분)"
              value={boothForm.estimatedWaitMinutes}
              onChange={(e) => setBoothForm((p) => ({ ...p, estimatedWaitMinutes: e.target.value }))}
            />
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="잔여 수량"
              value={boothForm.remainingStock}
              onChange={(e) => setBoothForm((p) => ({ ...p, remainingStock: e.target.value }))}
            />
          </div>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="실시간 운영 메모"
            value={boothForm.liveStatusMessage}
            onChange={(e) => setBoothForm((p) => ({ ...p, liveStatusMessage: e.target.value }))}
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="이미지 URL (선택)"
            value={boothForm.imageUrl}
            onChange={(e) => setBoothForm((p) => ({ ...p, imageUrl: e.target.value }))}
          />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm" disabled={isBusy}>
            {editingBoothId ? "부스 수정" : "부스 추가"}
          </button>
        </form>
        <p className="text-xs text-slate-500">드래그로 순서를 변경하고, 실시간 대기/잔여 정보를 즉시 저장할 수 있습니다.</p>
        <div className="space-y-2">
          {sortedBooths.map((booth) => (
            <div
              key={booth.id}
              draggable
              onDragStart={() => setDraggingBoothId(booth.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropBooth(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
              className="border rounded p-2 text-sm bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">
                  #{booth.displayOrder} {booth.name}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-100"
                    onClick={() => beginEditBooth(booth)}
                    disabled={isBusy}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-100 text-rose-700"
                    onClick={() => handleDeleteBooth(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
                    disabled={isBusy || isActionBusy(`booth-delete-${booth.id}`)}
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <input
                  className="border rounded px-2 py-1 text-xs"
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
                  className="border rounded px-2 py-1 text-xs"
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
                  className="rounded border py-1 text-xs font-semibold"
                  onClick={() => handleSaveBoothLiveStatus(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  disabled={isBusy || isActionBusy(`booth-live-save-${booth.id}`)}
                >
                  실시간 저장
                </button>
              </div>
              <input
                className="mt-2 w-full border rounded px-2 py-1 text-xs"
                placeholder="운영 메모"
                value={boothLiveDrafts[booth.id]?.liveStatusMessage ?? ""}
                onChange={(e) =>
                  setBoothLiveDrafts((p) => ({
                    ...p,
                    [booth.id]: { ...p[booth.id], liveStatusMessage: e.target.value },
                  }))
                }
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="text-xs"
                  onChange={(e) =>
                    setUploadFiles((prev) => ({ ...prev, [booth.id]: e.target.files?.[0] || null }))
                  }
                />
                <button
                  type="button"
                  onClick={() => handleImageUpload(booth.id).catch((error) => setMessage(adminErrorMessage(error)))}
                  className="rounded border px-2 py-1 text-xs"
                  disabled={isBusy || isActionBusy(`booth-image-${booth.id}`)}
                >
                  이미지 업로드
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-schedule inline-flex items-center gap-1.5">
          <IconCalendar className="h-4 w-4 icon-role-schedule" />
          공연 등록/수정
        </h3>
        <form
          className="space-y-2"
          onSubmit={(e) => handleEventSubmit(e).catch((error) => setMessage(adminErrorMessage(error)))}
        >
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="공연 제목"
            value={eventForm.title}
            onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              className="border rounded px-2 py-2 text-sm"
              value={eventForm.startTime}
              onChange={(e) => setEventForm((p) => ({ ...p, startTime: e.target.value }))}
              required
            />
            <input
              type="datetime-local"
              className="border rounded px-2 py-2 text-sm"
              value={eventForm.endTime}
              onChange={(e) => setEventForm((p) => ({ ...p, endTime: e.target.value }))}
              required
            />
          </div>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="라인업 이미지 URL"
            value={eventForm.imageUrl}
            onChange={(e) => setEventForm((p) => ({ ...p, imageUrl: e.target.value }))}
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="이미지 출처"
            value={eventForm.imageCredit}
            onChange={(e) => setEventForm((p) => ({ ...p, imageCredit: e.target.value }))}
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="이미지 초점 위치 예: center 42%"
            value={eventForm.imageFocus}
            onChange={(e) => setEventForm((p) => ({ ...p, imageFocus: e.target.value }))}
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="지연 시간(분)"
            value={eventForm.delayMinutes}
            onChange={(e) => setEventForm((p) => ({ ...p, delayMinutes: e.target.value }))}
          />
          <button className="w-full rounded bg-cyan-700 text-white py-2 text-sm" disabled={isBusy}>
            {editingEventId ? "공연 수정" : "공연 추가"}
          </button>
        </form>
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="border rounded p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{event.title}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-50 text-rose-700"
                    onClick={() =>
                      handleQuickEventStartNotice(event.id).catch((error) => setMessage(adminErrorMessage(error)))
                    }
                    disabled={isBusy || isActionBusy(`quick-event-notice-${event.id}`)}
                  >
                    시작 공지
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-100"
                    onClick={() => beginEditEvent(event)}
                    disabled={isBusy}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-100 text-rose-700"
                    onClick={() => handleDeleteEvent(event.id).catch((error) => setMessage(adminErrorMessage(error)))}
                    disabled={isBusy || isActionBusy(`event-delete-${event.id}`)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-ops inline-flex items-center gap-1.5">
          <IconUsers className="h-4 w-4 icon-role-ops" />
          스태프 배치 편집
        </h3>
        <p className="text-xs text-slate-500">팀/상태/담당 구역/업무를 수정하면 스태프 화면에 실시간 반영됩니다.</p>
        <div className="space-y-2 max-h-[34rem] overflow-auto pr-1">
          {staffMembers.map((staff) => (
            <div key={staff.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {staff.name} ({staff.staffNo})
                </p>
                <span className="text-[11px] text-slate-500">{staff.statusLabel}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  className="border rounded px-2 py-1 text-xs"
                  placeholder="팀"
                  value={staffDrafts[staff.id]?.team ?? ""}
                  onChange={(e) =>
                    setStaffDrafts((prev) => ({ ...prev, [staff.id]: { ...prev[staff.id], team: e.target.value } }))
                  }
                />
                <select
                  className="border rounded px-2 py-1 text-xs"
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
                className="mt-2 w-full border rounded px-2 py-1 text-xs"
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
                className="mt-2 w-full border rounded px-2 py-1 text-xs"
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
                className="mt-2 w-full border rounded px-2 py-1 text-xs"
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
                onClick={() => handleSaveStaff(staff.id).catch((error) => setMessage(adminErrorMessage(error)))}
                className="mt-2 w-full rounded border py-1.5 text-xs font-semibold"
                disabled={isBusy || isActionBusy(`staff-save-${staff.id}`)}
              >
                스태프 저장
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-log inline-flex items-center gap-1.5">
          <IconClipboard className="h-4 w-4 icon-role-log" />
          CSV 일괄 업로드
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-xs text-slate-600">부스 CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) =>
                setImportFiles((prev) => ({ ...prev, booths: e.target.files?.[0] || null }))
              }
              className="text-xs"
            />
            <button
              type="button"
              onClick={() => handleImport("booths").catch((error) => setMessage(adminErrorMessage(error)))}
              className="w-full rounded border py-1.5 text-xs"
              disabled={isBusy}
            >
              부스 업로드
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-600">공연 CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) =>
                setImportFiles((prev) => ({ ...prev, events: e.target.files?.[0] || null }))
              }
              className="text-xs"
            />
            <button
              type="button"
              onClick={() => handleImport("events").catch((error) => setMessage(adminErrorMessage(error)))}
              className="w-full rounded border py-1.5 text-xs"
              disabled={isBusy}
            >
              공연 업로드
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold">최근 관리자 작업 이력</h3>
        <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {auditLogs.length === 0 && <p className="text-sm text-slate-500">아직 기록이 없습니다.</p>}
          {auditLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-slate-200 p-2 bg-slate-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">
                  {log.adminUsername} / {log.action} / {log.targetType}
                </p>
                <p className="text-[10px] text-slate-500">{log.createdAt?.replace("T", " ").slice(5, 16)}</p>
              </div>
              <p className="text-xs text-slate-600 mt-1">{log.details}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
