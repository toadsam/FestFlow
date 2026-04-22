import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createOpsMasterBooth,
  createOpsMasterEvent,
  createOpsMasterNotice,
  deleteOpsMasterBooth,
  deleteOpsMasterEvent,
  deleteOpsMasterNotice,
  fetchOpsMasterBootstrap,
  reorderOpsMasterBooths,
  triggerOpsMasterCongestionReliefNotice,
  triggerOpsMasterEventStartNotice,
  updateOpsMasterBooth,
  updateOpsMasterBoothLiveStatus,
  updateOpsMasterEvent,
  updateOpsMasterNotice,
} from "../api";
import {
  IconAlert,
  IconCalendar,
  IconClipboard,
  IconMapPin,
  IconSettings,
  IconShield,
} from "../components/UxIcons";

const MASTER_KEY_STORAGE_KEY = "festflow_ops_master_key";
const NOTICE_CATEGORIES = ["긴급", "분실물", "안내", "일반"];

const initialNotice = {
  title: "",
  content: "",
  category: "안내",
  active: true,
};
const initialEvent = { title: "", startTime: "", endTime: "" };
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

function toApiDateTime(value) {
  return value.length === 16 ? `${value}:00` : value;
}

function toInputDateTime(value) {
  return value ? value.slice(0, 16) : "";
}

function confirmAction(message) {
  return window.confirm(`정말 실행할까요?\n\n${message}`);
}

export default function OpsMasterPage() {
  const [searchParams] = useSearchParams();
  const initialKey =
    searchParams.get("key") ||
    sessionStorage.getItem(MASTER_KEY_STORAGE_KEY) ||
    "";

  const [tab, setTab] = useState("notice");
  const [keyInput, setKeyInput] = useState(initialKey);
  const [key, setKey] = useState(initialKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [data, setData] = useState(null);
  const [boothLiveDrafts, setBoothLiveDrafts] = useState({});

  const [noticeForm, setNoticeForm] = useState(initialNotice);
  const [eventForm, setEventForm] = useState(initialEvent);
  const [boothForm, setBoothForm] = useState(initialBooth);

  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingBoothId, setEditingBoothId] = useState(null);

  const booths = useMemo(
    () =>
      (data?.booths || [])
        .slice()
        .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)),
    [data],
  );

  async function load() {
    if (!key) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      const next = await fetchOpsMasterBootstrap(key);
      setData(next);

      const nextLiveDrafts = {};
      next.booths.forEach((booth) => {
        nextLiveDrafts[booth.id] = {
          estimatedWaitMinutes: booth.estimatedWaitMinutes ?? "",
          remainingStock: booth.remainingStock ?? "",
          liveStatusMessage: booth.liveStatusMessage ?? "",
        };
      });
      setBoothLiveDrafts(nextLiveDrafts);

      setError("");
    } catch (e) {
      setData(null);
      setBoothLiveDrafts({});
      setError(
        e.message === "Failed to fetch"
          ? "서버 연결에 실패했습니다. 백엔드 실행 상태를 확인해 주세요."
          : e.message,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [key]);

  function submitKey(e) {
    e.preventDefault();
    const next = keyInput.trim();
    sessionStorage.setItem(MASTER_KEY_STORAGE_KEY, next);
    setKey(next);
    setLoading(true);
    setError("");
    setMessage("");
  }

  function clearKey() {
    sessionStorage.removeItem(MASTER_KEY_STORAGE_KEY);
    setKeyInput("");
    setKey("");
    setData(null);
    setError("");
    setMessage("");
    setLoading(false);
  }

  async function handleQuickCongestionNotice() {
    if (!confirmAction("혼잡 완화 공지를 즉시 발행합니다.")) return;
    try {
      await triggerOpsMasterCongestionReliefNotice(key);
      setMessage("혼잡 완화 공지를 발행했습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleQuickEventStartNotice(eventId) {
    if (!confirmAction("공연 시작 공지를 즉시 발행합니다.")) return;
    try {
      await triggerOpsMasterEventStartNotice(eventId, key);
      setMessage("공연 시작 공지를 발행했습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleNoticeSubmit(e) {
    e.preventDefault();
    if (
      !confirmAction(
        editingNoticeId
          ? "공지 수정 내용을 저장합니다."
          : "새 공지를 등록합니다.",
      )
    )
      return;
    try {
      if (editingNoticeId) {
        await updateOpsMasterNotice(editingNoticeId, noticeForm, key);
        setMessage("공지 수정이 완료되었습니다.");
      } else {
        await createOpsMasterNotice(noticeForm, key);
        setMessage("공지 등록이 완료되었습니다.");
      }
      setNoticeForm(initialNotice);
      setEditingNoticeId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteNotice(id) {
    if (!confirmAction("이 공지를 삭제합니다.")) return;
    try {
      await deleteOpsMasterNotice(id, key);
      setMessage("공지 삭제가 완료되었습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleEventSubmit(e) {
    e.preventDefault();
    if (
      !confirmAction(
        editingEventId
          ? "공연 수정 내용을 저장합니다."
          : "새 공연을 등록합니다.",
      )
    )
      return;
    try {
      const payload = {
        title: eventForm.title,
        startTime: toApiDateTime(eventForm.startTime),
        endTime: toApiDateTime(eventForm.endTime),
      };

      if (editingEventId) {
        await updateOpsMasterEvent(editingEventId, payload, key);
        setMessage("공연 수정이 완료되었습니다.");
      } else {
        await createOpsMasterEvent(payload, key);
        setMessage("공연 등록이 완료되었습니다.");
      }

      setEventForm(initialEvent);
      setEditingEventId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteEvent(id) {
    if (!confirmAction("이 공연을 삭제합니다.")) return;
    try {
      await deleteOpsMasterEvent(id, key);
      setMessage("공연 삭제가 완료되었습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleBoothSubmit(e) {
    e.preventDefault();
    if (
      !confirmAction(
        editingBoothId
          ? "부스 수정 내용을 저장합니다."
          : "새 부스를 등록합니다.",
      )
    )
      return;
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
        await updateOpsMasterBooth(editingBoothId, payload, key);
        setMessage("부스 수정이 완료되었습니다.");
      } else {
        await createOpsMasterBooth(payload, key);
        setMessage("부스 등록이 완료되었습니다.");
      }

      setBoothForm(initialBooth);
      setEditingBoothId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteBooth(id) {
    if (!confirmAction("이 부스를 삭제합니다.")) return;
    try {
      await deleteOpsMasterBooth(id, key);
      setMessage("부스 삭제가 완료되었습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSaveLiveStatus(boothId) {
    if (!confirmAction("해당 부스의 실시간 운영 상태를 저장합니다.")) return;
    try {
      const draft = boothLiveDrafts[boothId] || {};
      await updateOpsMasterBoothLiveStatus(
        boothId,
        {
          estimatedWaitMinutes:
            draft.estimatedWaitMinutes === ""
              ? null
              : Number(draft.estimatedWaitMinutes),
          remainingStock:
            draft.remainingStock === "" ? null : Number(draft.remainingStock),
          liveStatusMessage: draft.liveStatusMessage || null,
        },
        key,
      );
      setMessage("실시간 운영 상태를 저장했습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function moveBooth(boothId, direction) {
    const index = booths.findIndex((item) => item.id === boothId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= booths.length) {
      return;
    }

    const next = [...booths];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);

    if (!confirmAction("부스 노출 순서를 변경합니다.")) return;
    try {
      await reorderOpsMasterBooths(
        next.map((booth) => booth.id),
        key,
      );
      setMessage("부스 순서를 변경했습니다.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="cyber-page pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold inline-flex items-center gap-1.5">
          <IconShield className="h-5 w-5 icon-role-ops" />
          통합 운영 콘솔
        </h2>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          새로고침
        </button>
      </div>

      <form
        onSubmit={submitKey}
        className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
      >
        <p className="text-sm font-semibold inline-flex items-center gap-1.5">
          <IconSettings className="h-4 w-4 icon-role-ops" />
          운영 키 입력
        </p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            className="border rounded px-2 py-2 text-sm"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="통합 운영 키"
          />
          <button
            type="submit"
            className="rounded border px-3 py-2 text-sm font-semibold"
          >
            적용
          </button>
          <button
            type="button"
            onClick={clearKey}
            className="rounded border px-3 py-2 text-sm"
          >
            초기화
          </button>
        </div>
      </form>

      {!key && (
        <p className="text-sm text-rose-600">
          운영 키를 입력해 주세요. 현재 기본 통합 운영 키는 `0`입니다.
        </p>
      )}
      {loading && <p className="text-sm text-slate-600">불러오는 중...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {message && <p className="text-sm text-teal-700">{message}</p>}

      {data && (
        <>
          <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <h3 className="font-semibold inline-flex items-center gap-1.5">
              <IconClipboard className="h-4 w-4 icon-role-log" />
              상황 요약
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-teal-50 p-2">
                <p className="text-[10px] text-teal-700">오늘 총 방문</p>
                <p className="font-bold text-teal-800">
                  {data.kpi?.todayVisitorCount ?? 0}
                </p>
              </div>
              <div className="rounded bg-amber-50 p-2">
                <p className="text-[10px] text-amber-700">최대 혼잡</p>
                <p className="text-xs font-bold text-amber-800 line-clamp-1">
                  {data.kpi?.mostCongestedBooth?.boothName || "-"}
                </p>
              </div>
              <div className="rounded bg-indigo-50 p-2">
                <p className="text-[10px] text-indigo-700">30분 내 공연</p>
                <p className="text-xs font-bold text-indigo-800 line-clamp-1">
                  {data.kpi?.upcomingWithin30Minutes?.title || "-"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleQuickCongestionNotice}
                className="w-full rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white"
              >
                혼잡 완화 공지 즉시 발행
              </button>
              <div className="grid grid-cols-2 gap-2">
                {data.events.slice(0, 4).map((event) => (
                  <button
                    key={`quick-${event.id}`}
                    type="button"
                    onClick={() => handleQuickEventStartNotice(event.id)}
                    className="rounded border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700"
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <button
              type="button"
              onClick={() => setTab("notice")}
              className={`rounded py-2 text-xs font-semibold ${tab === "notice" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              공지
            </button>
            <button
              type="button"
              onClick={() => setTab("event")}
              className={`rounded py-2 text-xs font-semibold ${tab === "event" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              공연
            </button>
            <button
              type="button"
              onClick={() => setTab("booth")}
              className={`rounded py-2 text-xs font-semibold ${tab === "booth" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              부스
            </button>
            <button
              type="button"
              onClick={() => setTab("log")}
              className={`rounded py-2 text-xs font-semibold ${tab === "log" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              로그
            </button>
          </div>

          {tab === "notice" && (
            <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <h3 className="font-semibold inline-flex items-center gap-1.5">
                <IconAlert className="h-4 w-4 icon-role-alert" />
                실시간 공지 관리
              </h3>
              <form className="space-y-2" onSubmit={handleNoticeSubmit}>
                <input
                  className="w-full rounded border px-2 py-2 text-sm"
                  placeholder="공지 제목"
                  value={noticeForm.title}
                  onChange={(e) =>
                    setNoticeForm((p) => ({ ...p, title: e.target.value }))
                  }
                  required
                />
                <textarea
                  className="w-full rounded border px-2 py-2 text-sm"
                  rows={3}
                  placeholder="공지 내용"
                  value={noticeForm.content}
                  onChange={(e) =>
                    setNoticeForm((p) => ({ ...p, content: e.target.value }))
                  }
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="rounded border px-2 py-2 text-sm"
                    value={noticeForm.category}
                    onChange={(e) =>
                      setNoticeForm((p) => ({ ...p, category: e.target.value }))
                    }
                  >
                    {NOTICE_CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 rounded border px-2 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={noticeForm.active}
                      onChange={(e) =>
                        setNoticeForm((p) => ({
                          ...p,
                          active: e.target.checked,
                        }))
                      }
                    />
                    사용자 노출
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full rounded bg-teal-700 py-2 text-sm font-semibold text-white"
                >
                  {editingNoticeId ? "공지 수정" : "공지 등록"}
                </button>
              </form>

              <div className="space-y-2">
                {data.notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="rounded border border-slate-200 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        [{notice.category}] {notice.title}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${notice.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {notice.active ? "노출중" : "숨김"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {notice.content}
                    </p>
                    <div className="mt-2 flex gap-2 justify-end">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
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
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-700"
                        onClick={() => handleDeleteNotice(notice.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          {tab === "event" && (
            <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <h3 className="font-semibold inline-flex items-center gap-1.5">
                <IconCalendar className="h-4 w-4 icon-role-schedule" />
                공연 일정 관리
              </h3>
              <form className="space-y-2" onSubmit={handleEventSubmit}>
                <input
                  className="w-full rounded border px-2 py-2 text-sm"
                  placeholder="공연명"
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm((p) => ({ ...p, title: e.target.value }))
                  }
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    className="rounded border px-2 py-2 text-sm"
                    value={eventForm.startTime}
                    onChange={(e) =>
                      setEventForm((p) => ({ ...p, startTime: e.target.value }))
                    }
                    required
                  />
                  <input
                    type="datetime-local"
                    className="rounded border px-2 py-2 text-sm"
                    value={eventForm.endTime}
                    onChange={(e) =>
                      setEventForm((p) => ({ ...p, endTime: e.target.value }))
                    }
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded bg-cyan-700 py-2 text-sm font-semibold text-white"
                >
                  {editingEventId ? "공연 수정" : "공연 등록"}
                </button>
              </form>

              <div className="space-y-2">
                {data.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded border border-slate-200 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{event.title}</p>
                      <span className="text-xs text-slate-500">
                        {event.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.startTime?.replace("T", " ").slice(0, 16)} ~{" "}
                      {event.endTime?.replace("T", " ").slice(0, 16)}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => handleQuickEventStartNotice(event.id)}
                      >
                        시작 공지
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => {
                          setEditingEventId(event.id);
                          setEventForm({
                            title: event.title,
                            startTime: toInputDateTime(event.startTime),
                            endTime: toInputDateTime(event.endTime),
                          });
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-700"
                        onClick={() => handleDeleteEvent(event.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          {tab === "booth" && (
            <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <h3 className="font-semibold inline-flex items-center gap-1.5">
                <IconMapPin className="h-4 w-4 icon-role-map" />
                부스 운영 관리
              </h3>

              <form className="space-y-2" onSubmit={handleBoothSubmit}>
                <input
                  className="w-full rounded border px-2 py-2 text-sm"
                  placeholder="부스 이름"
                  value={boothForm.name}
                  onChange={(e) =>
                    setBoothForm((p) => ({ ...p, name: e.target.value }))
                  }
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded border px-2 py-2 text-sm"
                    placeholder="위도"
                    value={boothForm.latitude}
                    onChange={(e) =>
                      setBoothForm((p) => ({ ...p, latitude: e.target.value }))
                    }
                    required
                  />
                  <input
                    className="rounded border px-2 py-2 text-sm"
                    placeholder="경도"
                    value={boothForm.longitude}
                    onChange={(e) =>
                      setBoothForm((p) => ({ ...p, longitude: e.target.value }))
                    }
                    required
                  />
                </div>
                <textarea
                  className="w-full rounded border px-2 py-2 text-sm"
                  placeholder="설명"
                  value={boothForm.description}
                  onChange={(e) =>
                    setBoothForm((p) => ({ ...p, description: e.target.value }))
                  }
                  required
                />
                <input
                  className="w-full rounded border px-2 py-2 text-sm"
                  placeholder="이미지 URL (선택)"
                  value={boothForm.imageUrl}
                  onChange={(e) =>
                    setBoothForm((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                />
                <button
                  type="submit"
                  className="w-full rounded bg-teal-700 py-2 text-sm font-semibold text-white"
                >
                  {editingBoothId ? "부스 수정" : "부스 등록"}
                </button>
              </form>

              <div className="space-y-2">
                {booths.map((booth, index) => (
                  <div
                    key={booth.id}
                    className="rounded border border-slate-200 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        #{booth.displayOrder} {booth.name}
                      </p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => moveBooth(booth.id, -1)}
                          disabled={index === 0}
                        >
                          위
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => moveBooth(booth.id, 1)}
                          disabled={index === booths.length - 1}
                        >
                          아래
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <input
                        className="rounded border px-2 py-2 text-xs"
                        placeholder="대기 분"
                        value={
                          boothLiveDrafts[booth.id]?.estimatedWaitMinutes ?? ""
                        }
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
                        className="rounded border px-2 py-2 text-xs"
                        placeholder="잔여 수량"
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
                        className="rounded border px-2 py-2 text-xs font-semibold"
                        onClick={() => handleSaveLiveStatus(booth.id)}
                      >
                        실시간 저장
                      </button>
                    </div>
                    <input
                      className="mt-2 w-full rounded border px-2 py-2 text-xs"
                      placeholder="운영 메모"
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
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => {
                          setEditingBoothId(booth.id);
                          setBoothForm({
                            name: booth.name,
                            latitude: String(booth.latitude),
                            longitude: String(booth.longitude),
                            description: booth.description,
                            imageUrl: booth.imageUrl || "",
                            estimatedWaitMinutes:
                              booth.estimatedWaitMinutes ?? "",
                            remainingStock: booth.remainingStock ?? "",
                            liveStatusMessage: booth.liveStatusMessage || "",
                          });
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-700"
                        onClick={() => handleDeleteBooth(booth.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          {tab === "log" && (
            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="font-semibold inline-flex items-center gap-1.5">
                <IconClipboard className="h-4 w-4 icon-role-log" />
                최근 운영 로그
              </h3>
              <div className="mt-2 max-h-[420px] space-y-2 overflow-auto pr-1">
                {data.auditLogs?.length === 0 && (
                  <p className="text-sm text-slate-500">
                    아직 기록이 없습니다.
                  </p>
                )}
                {data.auditLogs?.map((log) => (
                  <div
                    key={log.id}
                    className="rounded border border-slate-200 bg-slate-50 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">
                        {log.adminUsername} / {log.action} / {log.targetType}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {log.createdAt?.replace("T", " ").slice(5, 16)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{log.details}</p>
                  </div>
                ))}
              </div>
            </article>
          )}
        </>
      )}
    </section>
  );
}


