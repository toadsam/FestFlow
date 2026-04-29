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
  updateBooth,
  updateAdminStaff,
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
  category: "湲닿툒",
  active: true,
};

function toApiDateTime(value) {
  return value.length === 16 ? `${value}:00` : value;
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
  const [loginForm, setLoginForm] = useState({
    username: "admin",
    password: "admin1234",
  });

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

  const [message, setMessage] = useState("");
  const [importFiles, setImportFiles] = useState({
    booths: null,
    events: null,
  });
  const [draggingBoothId, setDraggingBoothId] = useState(null);
  const [uploadFiles, setUploadFiles] = useState({});
  const [boothLiveDrafts, setBoothLiveDrafts] = useState({});
  const [staffDrafts, setStaffDrafts] = useState({});

  const sortedBooths = useMemo(
    () =>
      [...booths].sort(
        (a, b) => (a.displayOrder || 999) - (b.displayOrder || 999),
      ),
    [booths],
  );

  async function loadAll() {
    const [boothData, eventData, noticeData, kpiData, logData, staffData] =
      await Promise.all([
        fetchBooths(),
        fetchEvents(),
        fetchAdminNotices(),
        fetchAdminDashboardKpis(),
        fetchAuditLogs(),
        fetchAdminStaff(),
      ]);

    setBooths(boothData);
    setEvents(eventData);
    setNotices(noticeData);
    setKpi(kpiData);
    setAuditLogs(logData);
    setStaffMembers(staffData);

    const nextDrafts = {};
    boothData.forEach((booth) => {
      nextDrafts[booth.id] = {
        estimatedWaitMinutes: booth.estimatedWaitMinutes ?? "",
        remainingStock: booth.remainingStock ?? "",
        liveStatusMessage: booth.liveStatusMessage ?? "",
      };
    });
    setBoothLiveDrafts(nextDrafts);

    const nextStaffDrafts = {};
    staffData.forEach((staff) => {
      nextStaffDrafts[staff.id] = {
        team: staff.team ?? "",
        status: staff.status ?? "STANDBY",
        currentTask: staff.currentTask ?? "",
        currentNote: staff.currentNote ?? "",
        assignedBoothId: staff.assignedBoothId ?? "",
      };
    });
    setStaffDrafts(nextStaffDrafts);
  }

  useEffect(() => {
    if (!loggedIn) return;
    loadAll().catch((error) => setMessage(error.message));
  }, [loggedIn]);

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const data = await loginAdmin(loginForm.username, loginForm.password);
      saveLogin(data.token, data.username);
      setAdminName(data.username);
      setLoggedIn(true);
      setMessage("愿由ъ옄 濡쒓렇???깃났");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function handleLogout() {
    clearLogin();
    setLoggedIn(false);
    setAdminName("");
    setMessage("濡쒓렇?꾩썐?섏뿀?듬땲??");
  }

  async function handleQuickCongestionNotice() {
    try {
      await triggerCongestionReliefNotice();
      setMessage("?쇱옟 ?꾪솕 ?덈궡 怨듭?瑜?利됱떆 諛쒗뻾?덉뒿?덈떎.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleQuickEventStartNotice(eventId) {
    try {
      await triggerEventStartNotice(eventId);
      setMessage("怨듭뿰 ?쒖옉 ?덈궡 怨듭?瑜?諛쒗뻾?덉뒿?덈떎.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSaveBoothLiveStatus(boothId) {
    const draft = boothLiveDrafts[boothId] || {};
    try {
      await updateBoothLiveStatus(boothId, {
        estimatedWaitMinutes:
          draft.estimatedWaitMinutes === ""
            ? null
            : Number(draft.estimatedWaitMinutes),
        remainingStock:
          draft.remainingStock === "" ? null : Number(draft.remainingStock),
        liveStatusMessage: draft.liveStatusMessage || null,
      });
      setMessage("遺???ㅼ떆媛??댁쁺 ?뺣낫瑜???ν뻽?듬땲??");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSaveStaff(staffId) {
    const draft = staffDrafts[staffId] || {};
    try {
      await updateAdminStaff(staffId, {
        team: draft.team || null,
        status: draft.status || "STANDBY",
        currentTask: draft.currentTask || null,
        currentNote: draft.currentNote || null,
        assignedBoothId:
          draft.assignedBoothId === "" || draft.assignedBoothId == null
            ? null
            : Number(draft.assignedBoothId),
      });
      setMessage("?ㅽ깭??諛곗튂/?곹깭瑜???ν뻽?듬땲??");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleBoothSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        ...boothForm,
        latitude: Number(boothForm.latitude),
        longitude: Number(boothForm.longitude),
        estimatedWaitMinutes:
          boothForm.estimatedWaitMinutes === ""
            ? null
            : Number(boothForm.estimatedWaitMinutes),
        remainingStock:
          boothForm.remainingStock === ""
            ? null
            : Number(boothForm.remainingStock),
      };

      if (editingBoothId) {
        await updateBooth(editingBoothId, payload);
        setMessage("遺?ㅻ? ?섏젙?덉뒿?덈떎.");
      } else {
        await createBooth(payload);
        setMessage("遺?ㅻ? 異붽??덉뒿?덈떎.");
      }

      setBoothForm(initialBooth);
      setEditingBoothId(null);
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleEventSubmit(e) {
    e.preventDefault();

    try {
      const payload = {
        ...eventForm,
        startTime: toApiDateTime(eventForm.startTime),
        endTime: toApiDateTime(eventForm.endTime),
        delayMinutes:
          eventForm.delayMinutes === "" ? null : Number(eventForm.delayMinutes),
      };

      if (editingEventId) {
        await updateEvent(editingEventId, payload);
        setMessage("怨듭뿰???섏젙?덉뒿?덈떎.");
      } else {
        await createEvent(payload);
        setMessage("怨듭뿰??異붽??덉뒿?덈떎.");
      }

      setEventForm(initialEvent);
      setEditingEventId(null);
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleNoticeSubmit(e) {
    e.preventDefault();

    try {
      if (editingNoticeId) {
        await updateNotice(editingNoticeId, noticeForm);
        setMessage("怨듭?瑜??섏젙?덉뒿?덈떎.");
      } else {
        await createNotice(noticeForm);
        setMessage("怨듭?瑜??깅줉?덉뒿?덈떎.");
      }

      setNoticeForm(initialNotice);
      setEditingNoticeId(null);
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleImport(type) {
    const file = importFiles[type];
    if (!file) return;

    try {
      const result =
        type === "booths"
          ? await importBoothCsv(file)
          : await importEventCsv(file);
      setMessage(
        `${type === "booths" ? "부스" : "공연"} CSV ${result.imported}건 반영 완료`,
      );
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleImageUpload(boothId) {
    const file = uploadFiles[boothId];
    if (!file) {
      setMessage("?낅줈?쒗븷 ?대?吏瑜?癒쇱? ?좏깮??二쇱꽭??");
      return;
    }

    try {
      await uploadBoothImage(boothId, file);
      setMessage("遺???대?吏瑜??낅줈?쒗뻽?듬땲??");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleDropBooth(targetBoothId) {
    if (!draggingBoothId || draggingBoothId === targetBoothId) return;

    const reordered = moveItem(sortedBooths, draggingBoothId, targetBoothId);
    setBooths(reordered);

    try {
      await reorderBooths(reordered.map((item) => item.id));
      setMessage("遺???쒖꽌瑜???ν뻽?듬땲??");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDraggingBoothId(null);
    }
  }

  if (!loggedIn) {
    return (
      <section className="cyber-page pt-4 space-y-3">
        <h2 className="text-lg font-bold text-role-ops inline-flex items-center gap-1.5">
          <IconShield className="h-5 w-5 icon-role-ops" />
          관리자 로그인
        </h2>
        <p className="text-xs text-slate-500">湲곕낯 怨꾩젙: admin / admin1234</p>
        <form
          className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
          onSubmit={handleLogin}
        >
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="아이디"
            value={loginForm.username}
            onChange={(e) =>
              setLoginForm((prev) => ({ ...prev, username: e.target.value }))
            }
            required
          />
          <input
            type="password"
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="鍮꾨?踰덊샇"
            value={loginForm.password}
            onChange={(e) =>
              setLoginForm((prev) => ({ ...prev, password: e.target.value }))
            }
            required
          />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold">
            濡쒓렇??
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
          ?댁쁺 愿由ъ옄
        </h2>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs rounded-lg border px-2 py-1"
        >
          濡쒓렇?꾩썐
        </button>
      </div>
      <p className="text-xs text-slate-500">濡쒓렇???ъ슜?? {adminName}</p>
      {message && <p className="text-sm text-teal-700">{message}</p>}

      <article className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-role-log inline-flex items-center gap-1.5">
            <IconClipboard className="h-4 w-4 icon-role-log" />
            ?ㅼ떆媛??댁쁺 KPI
          </h3>
          <button
            type="button"
            onClick={loadAll}
            className="text-xs rounded border px-2 py-1"
          >
            媛깆떊
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-teal-50 p-2">
            <p className="text-[10px] text-teal-700">?ㅻ뒛 珥?諛⑸Ц</p>
            <p className="text-lg font-bold text-teal-800">
              {kpi?.todayVisitorCount ?? 0}
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <p className="text-[10px] text-amber-700">최대 혼잡 부스</p>
            <p className="text-xs font-bold text-amber-800 line-clamp-1">
              {kpi?.mostCongestedBooth?.boothName || "-"}
            </p>
            <p className="text-[10px] text-amber-700">
              {kpi?.mostCongestedBooth?.level || "-"} /{" "}
              {kpi?.mostCongestedBooth?.score ?? 0}
            </p>
          </div>
          <div className="rounded-lg bg-indigo-50 p-2">
            <p className="text-[10px] text-indigo-700">30遺???怨듭뿰</p>
            <p className="text-xs font-bold text-indigo-800 line-clamp-1">
              {kpi?.upcomingWithin30Minutes?.title || "-"}
            </p>
            <p className="text-[10px] text-indigo-700">
              {kpi?.upcomingWithin30Minutes?.startTime?.slice(11, 16) ||
                "--:--"}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
        <h3 className="font-semibold text-rose-800 text-role-alert inline-flex items-center gap-1.5">
          <IconAlert className="h-4 w-4 icon-role-alert" />
          ?댁쁺??利됱떆 議곗튂 ?⑤꼸
        </h3>
        <button
          type="button"
          onClick={handleQuickCongestionNotice}
          className="w-full rounded-lg bg-rose-600 text-white py-2 text-sm font-semibold"
        >
          ?쇱옟 ?꾪솕 ?덈궡 怨듭? ?먮룞 諛쒗뻾
        </button>
        <div className="space-y-1">
          {events.map((event) => (
            <button
              key={`quick-${event.id}`}
              type="button"
              onClick={() => handleQuickEventStartNotice(event.id)}
              className="w-full rounded-lg border border-rose-200 bg-white py-2 text-sm text-left px-3"
            >
              <span className="font-semibold">{event.title}</span>
              <span className="text-xs text-slate-500 ml-2">
                怨듭뿰 ?쒖옉 ?덈궡 諛쒗뻾
              </span>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-alert inline-flex items-center gap-1.5">
          <IconAlert className="h-4 w-4 icon-role-alert" />
          운영 공지 관리
        </h3>
        <form className="space-y-2" onSubmit={handleNoticeSubmit}>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="怨듭? ?쒕ぉ"
            value={noticeForm.title}
            onChange={(e) =>
              setNoticeForm((p) => ({ ...p, title: e.target.value }))
            }
            required
          />
          <textarea
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="怨듭? ?댁슜"
            rows={3}
            value={noticeForm.content}
            onChange={(e) =>
              setNoticeForm((p) => ({ ...p, content: e.target.value }))
            }
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded px-2 py-2 text-sm"
              value={noticeForm.category}
              onChange={(e) =>
                setNoticeForm((p) => ({ ...p, category: e.target.value }))
              }
            >
              <option>湲닿툒</option>
              <option>분실물</option>
              <option>?곗쿇</option>
              <option>?쇰컲</option>
            </select>
            <label className="border rounded px-2 py-2 text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={noticeForm.active}
                onChange={(e) =>
                  setNoticeForm((p) => ({ ...p, active: e.target.checked }))
                }
              />
              ???몄텧 ?쒖꽦??
            </label>
          </div>
          <button className="w-full rounded bg-rose-600 text-white py-2 text-sm">
            {editingNoticeId ? "怨듭? ?섏젙" : "怨듭? ?깅줉"}
          </button>
        </form>

        <div className="space-y-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="rounded-lg border border-slate-200 p-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  [{notice.category}] {notice.title}
                </p>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${notice.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {notice.active ? "활성" : "비활성"}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                {notice.content}
              </p>
              <div className="mt-2 flex gap-1 justify-end">
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-slate-100 text-xs"
                  onClick={() => {
                    setEditingNoticeId(notice.id);
                    setNoticeForm({
                      title: notice.title,
                      content: notice.content,
                      category: notice.category,
                      active: notice.active,
                    });
                  }}
                >
                  ?섏젙
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs"
                  onClick={async () => {
                    if (!confirm("??怨듭?瑜???젣?좉퉴??")) return;
                    await deleteNotice(notice.id);
                    await loadAll();
                  }}
                >
                  ??젣
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-map inline-flex items-center gap-1.5">
          <IconMapPin className="h-4 w-4 icon-role-map" />
          遺???깅줉/?섏젙
        </h3>
        <form className="space-y-2" onSubmit={handleBoothSubmit}>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="遺???대쫫"
            value={boothForm.name}
            onChange={(e) =>
              setBoothForm((p) => ({ ...p, name: e.target.value }))
            }
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="?꾨룄"
              value={boothForm.latitude}
              onChange={(e) =>
                setBoothForm((p) => ({ ...p, latitude: e.target.value }))
              }
              required
            />
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="寃쎈룄"
              value={boothForm.longitude}
              onChange={(e) =>
                setBoothForm((p) => ({ ...p, longitude: e.target.value }))
              }
              required
            />
          </div>
          <textarea
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="?ㅻ챸"
            value={boothForm.description}
            onChange={(e) =>
              setBoothForm((p) => ({ ...p, description: e.target.value }))
            }
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="?湲?遺?"
              value={boothForm.estimatedWaitMinutes}
              onChange={(e) =>
                setBoothForm((p) => ({
                  ...p,
                  estimatedWaitMinutes: e.target.value,
                }))
              }
            />
            <input
              className="border rounded px-2 py-2 text-sm"
              placeholder="?붿뿬 ?섎웾"
              value={boothForm.remainingStock}
              onChange={(e) =>
                setBoothForm((p) => ({ ...p, remainingStock: e.target.value }))
              }
            />
          </div>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="?ㅼ떆媛??댁쁺 硫붾え"
            value={boothForm.liveStatusMessage}
            onChange={(e) =>
              setBoothForm((p) => ({ ...p, liveStatusMessage: e.target.value }))
            }
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="?대?吏 URL(?좏깮)"
            value={boothForm.imageUrl}
            onChange={(e) =>
              setBoothForm((p) => ({ ...p, imageUrl: e.target.value }))
            }
          />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm">
            {editingBoothId ? "遺???섏젙" : "遺??異붽?"}
          </button>
        </form>

        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            ?쒕옒洹??쒖꽌 ???+ ?ㅼ떆媛??댁쁺?뺣낫 利됱떆 ?낅젰
          </p>
          {sortedBooths.map((booth) => (
            <div
              key={booth.id}
              draggable
              onDragStart={() => setDraggingBoothId(booth.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropBooth(booth.id)}
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
                    onClick={() => {
                      setEditingBoothId(booth.id);
                      setBoothForm({
                        name: booth.name,
                        latitude: String(booth.latitude),
                        longitude: String(booth.longitude),
                        description: booth.description,
                        imageUrl: booth.imageUrl || "",
                        estimatedWaitMinutes: booth.estimatedWaitMinutes ?? "",
                        remainingStock: booth.remainingStock ?? "",
                        liveStatusMessage: booth.liveStatusMessage || "",
                      });
                    }}
                  >
                    ?섏젙
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-100 text-rose-700"
                    onClick={async () => {
                      if (!confirm("??遺?ㅻ? ??젣?좉퉴??")) return;
                      await deleteBooth(booth.id);
                      await loadAll();
                    }}
                  >
                    ??젣
                  </button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <input
                  className="border rounded px-2 py-1 text-xs"
                  placeholder="?湲곕텇"
                  value={boothLiveDrafts[booth.id]?.estimatedWaitMinutes ?? ""}
                  onChange={(e) =>
                    setBoothLiveDrafts((p) => ({
                      ...p,
                      [booth.id]: {
                        ...p[booth.id],
                        estimatedWaitMinutes: e.target.value,
                      },
                    }))
                  }
                />
                <input
                  className="border rounded px-2 py-1 text-xs"
                  placeholder="?붿뿬?섎웾"
                  value={boothLiveDrafts[booth.id]?.remainingStock ?? ""}
                  onChange={(e) =>
                    setBoothLiveDrafts((p) => ({
                      ...p,
                      [booth.id]: {
                        ...p[booth.id],
                        remainingStock: e.target.value,
                      },
                    }))
                  }
                />
                <button
                  type="button"
                  className="rounded border py-1 text-xs font-semibold"
                  onClick={() => handleSaveBoothLiveStatus(booth.id)}
                >
                  ?ㅼ떆媛????
                </button>
              </div>
              <input
                className="mt-2 w-full border rounded px-2 py-1 text-xs"
                placeholder="?댁쁺 硫붾え"
                value={boothLiveDrafts[booth.id]?.liveStatusMessage ?? ""}
                onChange={(e) =>
                  setBoothLiveDrafts((p) => ({
                    ...p,
                    [booth.id]: {
                      ...p[booth.id],
                      liveStatusMessage: e.target.value,
                    },
                  }))
                }
              />

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  onChange={(e) =>
                    setUploadFiles((prev) => ({
                      ...prev,
                      [booth.id]: e.target.files?.[0] || null,
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() => handleImageUpload(booth.id)}
                  className="rounded border px-2 py-1 text-xs"
                >
                  ?대?吏 ?낅줈??
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold text-role-schedule inline-flex items-center gap-1.5">
          <IconCalendar className="h-4 w-4 icon-role-schedule" />
          怨듭뿰 ?깅줉/?섏젙
        </h3>
        <form className="space-y-2" onSubmit={handleEventSubmit}>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="怨듭뿰 ?쒕ぉ"
            value={eventForm.title}
            onChange={(e) =>
              setEventForm((p) => ({ ...p, title: e.target.value }))
            }
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              className="border rounded px-2 py-2 text-sm"
              value={eventForm.startTime}
              onChange={(e) =>
                setEventForm((p) => ({ ...p, startTime: e.target.value }))
              }
              required
            />
            <input
              type="datetime-local"
              className="border rounded px-2 py-2 text-sm"
              value={eventForm.endTime}
              onChange={(e) =>
                setEventForm((p) => ({ ...p, endTime: e.target.value }))
              }
              required
            />
          </div>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="라인업 이미지 URL"
            value={eventForm.imageUrl}
            onChange={(e) =>
              setEventForm((p) => ({ ...p, imageUrl: e.target.value }))
            }
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="이미지 출처"
            value={eventForm.imageCredit}
            onChange={(e) =>
              setEventForm((p) => ({ ...p, imageCredit: e.target.value }))
            }
          />
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="이미지 초점 위치 예: center 42% 또는 57% 42%"
            value={eventForm.imageFocus}
            onChange={(e) =>
              setEventForm((p) => ({ ...p, imageFocus: e.target.value }))
            }
          />
          <button className="w-full rounded bg-cyan-700 text-white py-2 text-sm">
            {editingEventId ? "怨듭뿰 ?섏젙" : "怨듭뿰 異붽?"}
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
                    onClick={() => handleQuickEventStartNotice(event.id)}
                  >
                    ?쒖옉?덈궡
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-100"
                    onClick={() => {
                      setEditingEventId(event.id);
                      setEventForm({
                        title: event.title,
                        startTime: event.startTime.slice(0, 16),
                        endTime: event.endTime.slice(0, 16),
                        imageUrl: event.imageUrl || "",
                        imageCredit: event.imageCredit || "",
                        imageFocus: event.imageFocus || "",
                        statusOverride: event.statusOverride || "",
                        liveMessage: event.liveMessage || "",
                        delayMinutes: event.delayMinutes ?? "",
                      });
                    }}
                  >
                    ?섏젙
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-100 text-rose-700"
                    onClick={async () => {
                      if (!confirm("??怨듭뿰????젣?좉퉴??")) return;
                      await deleteEvent(event.id);
                      await loadAll();
                    }}
                  >
                    ??젣
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
        <p className="text-xs text-slate-500">
          팀/상태/담당 구역/업무를 수정하면 스태프 화면에 실시간 반영됩니다.
        </p>
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
                    setStaffDrafts((prev) => ({
                      ...prev,
                      [staff.id]: { ...prev[staff.id], team: e.target.value },
                    }))
                  }
                />
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={staffDrafts[staff.id]?.status ?? "STANDBY"}
                  onChange={(e) =>
                    setStaffDrafts((prev) => ({
                      ...prev,
                      [staff.id]: { ...prev[staff.id], status: e.target.value },
                    }))
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
                    [staff.id]: {
                      ...prev[staff.id],
                      assignedBoothId: e.target.value,
                    },
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
                onClick={() => handleSaveStaff(staff.id)}
                className="mt-2 w-full rounded border py-1.5 text-xs font-semibold"
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
            <p className="text-xs text-slate-600">遺??CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) =>
                setImportFiles((prev) => ({
                  ...prev,
                  booths: e.target.files?.[0] || null,
                }))
              }
              className="text-xs"
            />
            <button
              type="button"
              onClick={() => handleImport("booths")}
              className="w-full rounded border py-1.5 text-xs"
            >
              遺???낅줈??
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-600">怨듭뿰 CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) =>
                setImportFiles((prev) => ({
                  ...prev,
                  events: e.target.files?.[0] || null,
                }))
              }
              className="text-xs"
            />
            <button
              type="button"
              onClick={() => handleImport("events")}
              className="w-full rounded border py-1.5 text-xs"
            >
              怨듭뿰 ?낅줈??
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold">理쒓렐 愿由ъ옄 ?묒뾽 ?대젰</h3>
        <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {auditLogs.length === 0 && (
            <p className="text-sm text-slate-500">?꾩쭅 湲곕줉???놁뒿?덈떎.</p>
          )}
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-slate-200 p-2 bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">
                  {log.adminUsername} 쨌 {log.action} 쨌 {log.targetType}
                </p>
                <p className="text-[10px] text-slate-500">
                  {log.createdAt.replace("T", " ").slice(5, 16)}
                </p>
              </div>
              <p className="text-xs text-slate-600 mt-1">{log.details}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

