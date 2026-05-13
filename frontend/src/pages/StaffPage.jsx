import { useEffect, useMemo, useState } from "react";
import {
  createLostItem,
  createLostItemStream,
  createStaffAiLostItemAssist,
  createStaffAiReplyDraft,
  createStaffStream,
  fetchLostItems,
  fetchStaffAiZoneSummary,
  fetchStaffBootstrap,
  loginStaff,
  logoutStaff,
  updateMyStaffStatus,
} from "../api";
import {
  IconAlert,
  IconBox,
  IconChat,
  IconMapPin,
  IconShield,
  IconUsers,
} from "../components/UxIcons";

const STAFF_TOKEN_KEY = "festflow_staff_token_v2";
const STATUS_META = {
  STANDBY: { label: "대기중", color: "slate" },
  MOVING: { label: "이동중", color: "amber" },
  ON_DUTY: { label: "업무중", color: "green" },
  URGENT: { label: "긴급", color: "red" },
};
const QUICK_TASKS = ["입구 동선 안내", "대기열 정리", "분실물 대응", "무대 안전 관리"];
const EMPTY_LOST_FORM = {
  title: "",
  description: "",
  category: "기타",
  foundLocation: "",
  finderContact: "",
};

function getSavedToken() {
  return localStorage.getItem(STAFF_TOKEN_KEY) || "";
}

function setSavedToken(token) {
  if (token) localStorage.setItem(STAFF_TOKEN_KEY, token);
  else localStorage.removeItem(STAFF_TOKEN_KEY);
}

function statusLabel(status) {
  return STATUS_META[status]?.label || status || "대기중";
}

export default function StaffPage() {
  const [staffToken, setStaffToken] = useState(getSavedToken());
  const [staffNoInput, setStaffNoInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(Boolean(staffToken));
  const [message, setMessage] = useState("");

  const [me, setMe] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [booths, setBooths] = useState([]);
  const [notices, setNotices] = useState([]);
  const [lostItems, setLostItems] = useState([]);
  const [taskDraft, setTaskDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [locationSharing, setLocationSharing] = useState(false);

  const [lostForm, setLostForm] = useState(EMPTY_LOST_FORM);
  const [lostFile, setLostFile] = useState(null);
  const [lostSaving, setLostSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState("");

  async function load(token = staffToken) {
    if (!token) return;
    setLoading(true);
    try {
      const [bootstrap, lostData] = await Promise.all([
        fetchStaffBootstrap(token),
        fetchLostItems(token),
      ]);
      setMe(bootstrap.me);
      setStaffList(bootstrap.staff || []);
      setBooths(bootstrap.booths || []);
      setNotices(bootstrap.notices || []);
      setLostItems(lostData || []);
      setTaskDraft(bootstrap.me?.currentTask || "");
      setNoteDraft(bootstrap.me?.currentNote || "");
      setLocationSharing(bootstrap.me?.locationSharingEnabled === true);
      setMessage("");
    } catch (error) {
      setSavedToken("");
      setStaffToken("");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffToken]);

  useEffect(() => {
    if (!staffToken) return undefined;

    let staffStream = null;
    try {
      staffStream = createStaffStream();
      staffStream.addEventListener("staff", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) {
            setStaffList(next);
            setMe((prev) => next.find((item) => item.staffNo === prev?.staffNo) || prev);
          }
        } catch {
          // Ignore malformed stream payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    let lostStream = null;
    try {
      lostStream = createLostItemStream();
      lostStream.addEventListener("lost-items", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setLostItems(next);
        } catch {
          // Ignore malformed stream payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    return () => {
      staffStream?.close();
      lostStream?.close();
    };
  }, [staffToken]);

  const statusSummary = useMemo(() => {
    const base = { STANDBY: 0, MOVING: 0, ON_DUTY: 0, URGENT: 0 };
    staffList.forEach((staff) => {
      if (base[staff.status] != null) base[staff.status] += 1;
    });
    return base;
  }, [staffList]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await loginStaff(staffNoInput.trim().toUpperCase(), pinInput.trim());
      setSavedToken(data.staffToken);
      setStaffToken(data.staffToken);
      setMessage("스태프 로그인이 완료되었습니다.");
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      if (staffToken) await logoutStaff(staffToken);
    } catch {
      // Logout should still clear the local session.
    }
    setSavedToken("");
    setStaffToken("");
    setMe(null);
    setStaffList([]);
    setBooths([]);
    setNotices([]);
    setLostItems([]);
  }

  async function saveMyStatus(nextStatus = me?.status, nextTask = taskDraft) {
    if (!staffToken || !me) return;
    try {
      let latitude = me.latitude ?? null;
      let longitude = me.longitude ?? null;
      if (locationSharing && navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              maximumAge: 60000,
              timeout: 2500,
            });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {
          // Keep previous coordinate when location permission is unavailable.
        }
      }
      const updated = await updateMyStaffStatus(staffToken, {
        status: nextStatus,
        currentTask: nextTask,
        currentNote: noteDraft,
        latitude: locationSharing ? latitude : null,
        longitude: locationSharing ? longitude : null,
        locationSharingEnabled: locationSharing,
      });
      setMe(updated);
      setStaffList((prev) => prev.map((item) => (item.staffNo === updated.staffNo ? updated : item)));
      setMessage("스태프 상태를 저장했습니다.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCreateLostItem(event) {
    event.preventDefault();
    if (!lostForm.title.trim() || !lostForm.foundLocation.trim()) {
      setMessage("분실물명과 발견 위치를 입력해 주세요.");
      return;
    }
    setLostSaving(true);
    try {
      await createLostItem(lostForm, lostFile, staffToken);
      setLostForm(EMPTY_LOST_FORM);
      setLostFile(null);
      setMessage("분실물을 등록했습니다.");
      const next = await fetchLostItems(staffToken);
      setLostItems(next || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLostSaving(false);
    }
  }

  async function runAi(type) {
    if (!staffToken) return;
    setAiBusy(true);
    try {
      const result =
        type === "zone"
          ? await fetchStaffAiZoneSummary(staffToken)
          : type === "lost"
            ? await createStaffAiLostItemAssist("분실물 센터 응대 문구를 작성해줘.", staffToken)
            : await createStaffAiReplyDraft("축제 방문객에게 친절한 안내 답변을 작성해줘.", staffToken);
      setAiText(result.answer || result.content || result.message || "AI 응답을 생성했습니다.");
    } catch (error) {
      setAiText(error.message);
    } finally {
      setAiBusy(false);
    }
  }

  if (!staffToken) {
    return (
      <section className="uni-page staff-page staff-login-page">
        <header className="plain-page-header">
          <span />
          <h1>스태프</h1>
          <span />
        </header>
        <form className="staff-login-card" onSubmit={handleLogin}>
          <IconShield className="h-10 w-10" />
          <h2>운영진 전용 로그인</h2>
          <p>현장 상태, 분실물, 공지 대응을 위한 스태프 화면입니다.</p>
          <input
            value={staffNoInput}
            onChange={(event) => setStaffNoInput(event.target.value)}
            placeholder="스태프 번호"
          />
          <input
            type="password"
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value)}
            placeholder="PIN"
          />
          <button type="submit" className="primary-wide-button" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
          {message && <p className="app-inline-note app-inline-note--danger">{message}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="uni-page staff-page">
      <header className="plain-page-header">
        <span />
        <h1>스태프</h1>
        <button type="button" onClick={handleLogout}>로그아웃</button>
      </header>

      <section className="staff-status-card">
        <div>
          <p>스태프 현황</p>
          <h2>{staffList.length || 0}</h2>
          <span>{me?.name || me?.staffNo || "내 계정"} · {statusLabel(me?.status)}</span>
        </div>
        <div className="staff-kpi-grid">
          {Object.entries(statusSummary).map(([status, count]) => (
            <article key={status}>
              <strong>{count}</strong>
              <span>{statusLabel(status)}</span>
            </article>
          ))}
        </div>
      </section>

      {message && <p className="app-inline-note">{message}</p>}

      <section className="uni-card staff-control-card">
        <div className="uni-section-head">
          <h2>내 상태</h2>
          <button type="button" onClick={() => saveMyStatus()}>저장</button>
        </div>
        <div className="staff-status-buttons">
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <button
              key={status}
              type="button"
              className={me?.status === status ? `staff-status-button staff-status-button--${meta.color} active` : `staff-status-button staff-status-button--${meta.color}`}
              onClick={() => saveMyStatus(status)}
            >
              {meta.label}
            </button>
          ))}
        </div>
        <label className="settings-row">
          <span>현장 지도 표시</span>
          <input
            type="checkbox"
            checked={locationSharing}
            onChange={(event) => setLocationSharing(event.target.checked)}
          />
        </label>
        <input
          value={taskDraft}
          onChange={(event) => setTaskDraft(event.target.value)}
          placeholder="현재 업무"
        />
        <textarea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder="운영 메모"
          rows={2}
        />
        <div className="quick-task-grid">
          {QUICK_TASKS.map((task) => (
            <button key={task} type="button" onClick={() => {
              setTaskDraft(task);
              saveMyStatus(me?.status, task);
            }}>
              {task}
            </button>
          ))}
        </div>
      </section>

      <section className="staff-map-card">
        <div className="uni-section-head">
          <h2>현장 지도</h2>
          <span>{staffList.filter((staff) => staff.locationSharingEnabled).length}명 표시</span>
        </div>
        <div className="staff-map-art">
          {staffList.slice(0, 8).map((staff, index) => (
            <span
              key={staff.staffNo || staff.id || index}
              className={`staff-map-dot staff-map-dot--${STATUS_META[staff.status]?.color || "slate"}`}
              style={{
                left: `${18 + ((index * 23) % 64)}%`,
                top: `${24 + ((index * 17) % 54)}%`,
              }}
              title={staff.name}
            >
              {String(staff.name || staff.staffNo || "?").slice(0, 1)}
            </span>
          ))}
        </div>
      </section>

      <section className="uni-section">
        <div className="uni-section-head">
          <h2>빠른 미션</h2>
          <span>진행 중 {staffList.filter((staff) => staff.status === "ON_DUTY").length}</span>
        </div>
        <div className="safety-grid">
          <button type="button" className="safety-card" onClick={() => runAi("zone")} disabled={aiBusy}>
            <IconMapPin className="h-5 w-5" />
            <strong>AI 구역 요약</strong>
          </button>
          <button type="button" className="safety-card" onClick={() => runAi("lost")} disabled={aiBusy}>
            <IconBox className="h-5 w-5" />
            <strong>분실물 응대</strong>
          </button>
          <button type="button" className="safety-card" onClick={() => runAi("reply")} disabled={aiBusy}>
            <IconChat className="h-5 w-5" />
            <strong>응대 문구</strong>
          </button>
        </div>
        {aiText && <p className="app-inline-note app-inline-note--success">{aiText}</p>}
      </section>

      <form className="uni-card lost-register-form" onSubmit={handleCreateLostItem}>
        <div className="uni-section-head">
          <h2>분실물 등록</h2>
          <span>{lostItems.length}건</span>
        </div>
        <input
          value={lostForm.title}
          onChange={(event) => setLostForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="분실물명"
        />
        <div className="form-grid-2">
          <input
            value={lostForm.category}
            onChange={(event) => setLostForm((prev) => ({ ...prev, category: event.target.value }))}
            placeholder="카테고리"
          />
          <input
            value={lostForm.foundLocation}
            onChange={(event) => setLostForm((prev) => ({ ...prev, foundLocation: event.target.value }))}
            placeholder="발견 위치"
          />
        </div>
        <textarea
          value={lostForm.description}
          onChange={(event) => setLostForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="설명"
          rows={2}
        />
        <input
          value={lostForm.finderContact}
          onChange={(event) => setLostForm((prev) => ({ ...prev, finderContact: event.target.value }))}
          placeholder="연락처"
        />
        <input type="file" accept="image/*" onChange={(event) => setLostFile(event.target.files?.[0] || null)} />
        <button type="submit" className="primary-wide-button" disabled={lostSaving}>
          {lostSaving ? "등록 중..." : "분실물 등록"}
        </button>
      </form>

      <section className="uni-section">
        <div className="uni-section-head">
          <h2>공지사항</h2>
          <span>{notices.length}건</span>
        </div>
        <div className="notice-list">
          {notices.slice(0, 3).map((notice) => (
            <article key={notice.id || notice.title} className="notice-row">
              <IconAlert className="h-4 w-4" />
              <strong>{notice.title}</strong>
              <small>{notice.createdAt?.replace("T", " ").slice(5, 10) || "오늘"}</small>
            </article>
          ))}
          {notices.length === 0 && <p className="empty-copy">현재 활성 공지가 없습니다.</p>}
        </div>
      </section>

      <section className="uni-card staff-mini-card">
        <IconUsers className="h-5 w-5" />
        <p>담당 구역: {booths.find((booth) => booth.id === me?.assignedBoothId)?.name || "순환 구역"}</p>
      </section>
    </section>
  );
}
