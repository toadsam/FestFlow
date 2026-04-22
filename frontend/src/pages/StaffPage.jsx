import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import {
  createLostItem,
  createStaffStream,
  fetchStaffBootstrap,
  loginStaff,
  logoutStaff,
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

  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL_TEAM);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);

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
