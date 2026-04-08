import { useEffect, useMemo, useState } from 'react';
import {
  createBooth,
  createEvent,
  createNotice,
  deleteBooth,
  deleteEvent,
  deleteNotice,
  fetchAdminDashboardKpis,
  fetchAdminNotices,
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
  updateBoothLiveStatus,
  updateEvent,
  updateNotice,
  uploadBoothImage,
} from '../api';
import { clearLogin, getAdminName, isLoggedIn, saveLogin } from '../utils/auth';

const initialBooth = { name: '', latitude: '', longitude: '', description: '', imageUrl: '', estimatedWaitMinutes: '', remainingStock: '', liveStatusMessage: '' };
const initialEvent = { title: '', startTime: '', endTime: '' };
const initialNotice = { title: '', content: '', category: '긴급', active: true };

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
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'admin1234' });

  const [kpi, setKpi] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  const [booths, setBooths] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);

  const [boothForm, setBoothForm] = useState(initialBooth);
  const [eventForm, setEventForm] = useState(initialEvent);
  const [noticeForm, setNoticeForm] = useState(initialNotice);

  const [editingBoothId, setEditingBoothId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingNoticeId, setEditingNoticeId] = useState(null);

  const [message, setMessage] = useState('');
  const [importFiles, setImportFiles] = useState({ booths: null, events: null });
  const [draggingBoothId, setDraggingBoothId] = useState(null);
  const [uploadFiles, setUploadFiles] = useState({});
  const [boothLiveDrafts, setBoothLiveDrafts] = useState({});

  const sortedBooths = useMemo(
    () => [...booths].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)),
    [booths]
  );

  async function loadAll() {
    const [boothData, eventData, noticeData, kpiData, logData] = await Promise.all([
      fetchBooths(),
      fetchEvents(),
      fetchAdminNotices(),
      fetchAdminDashboardKpis(),
      fetchAuditLogs(),
    ]);

    setBooths(boothData);
    setEvents(eventData);
    setNotices(noticeData);
    setKpi(kpiData);
    setAuditLogs(logData);

    const nextDrafts = {};
    boothData.forEach((booth) => {
      nextDrafts[booth.id] = {
        estimatedWaitMinutes: booth.estimatedWaitMinutes ?? '',
        remainingStock: booth.remainingStock ?? '',
        liveStatusMessage: booth.liveStatusMessage ?? '',
      };
    });
    setBoothLiveDrafts(nextDrafts);
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
      setMessage('관리자 로그인 성공');
    } catch (error) {
      setMessage(error.message);
    }
  }

  function handleLogout() {
    clearLogin();
    setLoggedIn(false);
    setAdminName('');
    setMessage('로그아웃되었습니다.');
  }

  async function handleQuickCongestionNotice() {
    try {
      await triggerCongestionReliefNotice();
      setMessage('혼잡 완화 안내 공지를 즉시 발행했습니다.');
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleQuickEventStartNotice(eventId) {
    try {
      await triggerEventStartNotice(eventId);
      setMessage('공연 시작 안내 공지를 발행했습니다.');
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSaveBoothLiveStatus(boothId) {
    const draft = boothLiveDrafts[boothId] || {};
    try {
      await updateBoothLiveStatus(boothId, {
        estimatedWaitMinutes: draft.estimatedWaitMinutes === '' ? null : Number(draft.estimatedWaitMinutes),
        remainingStock: draft.remainingStock === '' ? null : Number(draft.remainingStock),
        liveStatusMessage: draft.liveStatusMessage || null,
      });
      setMessage('부스 실시간 운영 정보를 저장했습니다.');
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
        estimatedWaitMinutes: boothForm.estimatedWaitMinutes === '' ? null : Number(boothForm.estimatedWaitMinutes),
        remainingStock: boothForm.remainingStock === '' ? null : Number(boothForm.remainingStock),
      };

      if (editingBoothId) {
        await updateBooth(editingBoothId, payload);
        setMessage('부스를 수정했습니다.');
      } else {
        await createBooth(payload);
        setMessage('부스를 추가했습니다.');
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
      };

      if (editingEventId) {
        await updateEvent(editingEventId, payload);
        setMessage('공연을 수정했습니다.');
      } else {
        await createEvent(payload);
        setMessage('공연을 추가했습니다.');
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
        setMessage('공지를 수정했습니다.');
      } else {
        await createNotice(noticeForm);
        setMessage('공지를 등록했습니다.');
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
      const result = type === 'booths' ? await importBoothCsv(file) : await importEventCsv(file);
      setMessage(`${type === 'booths' ? '부스' : '공연'} CSV ${result.imported}건 반영 완료`);
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleImageUpload(boothId) {
    const file = uploadFiles[boothId];
    if (!file) {
      setMessage('업로드할 이미지를 먼저 선택해 주세요.');
      return;
    }

    try {
      await uploadBoothImage(boothId, file);
      setMessage('부스 이미지를 업로드했습니다.');
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
      setMessage('부스 순서를 저장했습니다.');
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
        <h2 className="text-lg font-bold">관리자 로그인</h2>
        <p className="text-xs text-slate-500">기본 계정: admin / admin1234</p>
        <form className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" onSubmit={handleLogin}>
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="아이디" value={loginForm.username} onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))} required />
          <input type="password" className="w-full border rounded px-2 py-2 text-sm" placeholder="비밀번호" value={loginForm.password} onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))} required />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold">로그인</button>
        </form>
        {message && <p className="text-sm text-rose-600">{message}</p>}
      </section>
    );
  }

  return (
    <section className="cyber-page pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">운영 관리자</h2>
        <button type="button" onClick={handleLogout} className="text-xs rounded-lg border px-2 py-1">로그아웃</button>
      </div>
      <p className="text-xs text-slate-500">로그인 사용자: {adminName}</p>
      {message && <p className="text-sm text-teal-700">{message}</p>}

      <article className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">실시간 운영 KPI</h3>
          <button type="button" onClick={loadAll} className="text-xs rounded border px-2 py-1">갱신</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-teal-50 p-2">
            <p className="text-[10px] text-teal-700">오늘 총 방문</p>
            <p className="text-lg font-bold text-teal-800">{kpi?.todayVisitorCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <p className="text-[10px] text-amber-700">최대 혼잡 부스</p>
            <p className="text-xs font-bold text-amber-800 line-clamp-1">{kpi?.mostCongestedBooth?.boothName || '-'}</p>
            <p className="text-[10px] text-amber-700">{kpi?.mostCongestedBooth?.level || '-'} / {kpi?.mostCongestedBooth?.score ?? 0}</p>
          </div>
          <div className="rounded-lg bg-indigo-50 p-2">
            <p className="text-[10px] text-indigo-700">30분 내 공연</p>
            <p className="text-xs font-bold text-indigo-800 line-clamp-1">{kpi?.upcomingWithin30Minutes?.title || '-'}</p>
            <p className="text-[10px] text-indigo-700">{kpi?.upcomingWithin30Minutes?.startTime?.slice(11, 16) || '--:--'}</p>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
        <h3 className="font-semibold text-rose-800">운영자 즉시 조치 패널</h3>
        <button type="button" onClick={handleQuickCongestionNotice} className="w-full rounded-lg bg-rose-600 text-white py-2 text-sm font-semibold">
          혼잡 완화 안내 공지 자동 발행
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
              <span className="text-xs text-slate-500 ml-2">공연 시작 안내 발행</span>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold">운영 공지 관리</h3>
        <form className="space-y-2" onSubmit={handleNoticeSubmit}>
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="공지 제목" value={noticeForm.title} onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))} required />
          <textarea className="w-full border rounded px-2 py-2 text-sm" placeholder="공지 내용" rows={3} value={noticeForm.content} onChange={(e) => setNoticeForm((p) => ({ ...p, content: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-2">
            <select className="border rounded px-2 py-2 text-sm" value={noticeForm.category} onChange={(e) => setNoticeForm((p) => ({ ...p, category: e.target.value }))}>
              <option>긴급</option><option>분실물</option><option>우천</option><option>일반</option>
            </select>
            <label className="border rounded px-2 py-2 text-sm flex items-center gap-2">
              <input type="checkbox" checked={noticeForm.active} onChange={(e) => setNoticeForm((p) => ({ ...p, active: e.target.checked }))} />
              홈 노출 활성화
            </label>
          </div>
          <button className="w-full rounded bg-rose-600 text-white py-2 text-sm">{editingNoticeId ? '공지 수정' : '공지 등록'}</button>
        </form>

        <div className="space-y-2">
          {notices.map((notice) => (
            <div key={notice.id} className="rounded-lg border border-slate-200 p-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">[{notice.category}] {notice.title}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${notice.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {notice.active ? '활성' : '비활성'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{notice.content}</p>
              <div className="mt-2 flex gap-1 justify-end">
                <button type="button" className="px-2 py-1 rounded bg-slate-100 text-xs" onClick={() => {
                  setEditingNoticeId(notice.id);
                  setNoticeForm({ title: notice.title, content: notice.content, category: notice.category, active: notice.active });
                }}>수정</button>
                <button type="button" className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs" onClick={async () => {
                  if (!confirm('이 공지를 삭제할까요?')) return;
                  await deleteNotice(notice.id);
                  await loadAll();
                }}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold">부스 등록/수정</h3>
        <form className="space-y-2" onSubmit={handleBoothSubmit}>
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="부스 이름" value={boothForm.name} onChange={(e) => setBoothForm((p) => ({ ...p, name: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="border rounded px-2 py-2 text-sm" placeholder="위도" value={boothForm.latitude} onChange={(e) => setBoothForm((p) => ({ ...p, latitude: e.target.value }))} required />
            <input className="border rounded px-2 py-2 text-sm" placeholder="경도" value={boothForm.longitude} onChange={(e) => setBoothForm((p) => ({ ...p, longitude: e.target.value }))} required />
          </div>
          <textarea className="w-full border rounded px-2 py-2 text-sm" placeholder="설명" value={boothForm.description} onChange={(e) => setBoothForm((p) => ({ ...p, description: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="border rounded px-2 py-2 text-sm" placeholder="대기(분)" value={boothForm.estimatedWaitMinutes} onChange={(e) => setBoothForm((p) => ({ ...p, estimatedWaitMinutes: e.target.value }))} />
            <input className="border rounded px-2 py-2 text-sm" placeholder="잔여 수량" value={boothForm.remainingStock} onChange={(e) => setBoothForm((p) => ({ ...p, remainingStock: e.target.value }))} />
          </div>
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="실시간 운영 메모" value={boothForm.liveStatusMessage} onChange={(e) => setBoothForm((p) => ({ ...p, liveStatusMessage: e.target.value }))} />
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="이미지 URL(선택)" value={boothForm.imageUrl} onChange={(e) => setBoothForm((p) => ({ ...p, imageUrl: e.target.value }))} />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm">{editingBoothId ? '부스 수정' : '부스 추가'}</button>
        </form>

        <div className="space-y-2">
          <p className="text-xs text-slate-500">드래그 순서 저장 + 실시간 운영정보 즉시 입력</p>
          {sortedBooths.map((booth) => (
            <div key={booth.id} draggable onDragStart={() => setDraggingBoothId(booth.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDropBooth(booth.id)} className="border rounded p-2 text-sm bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">#{booth.displayOrder} {booth.name}</p>
                <div className="flex gap-1">
                  <button type="button" className="px-2 py-1 rounded bg-slate-100" onClick={() => {
                    setEditingBoothId(booth.id);
                    setBoothForm({
                      name: booth.name,
                      latitude: String(booth.latitude),
                      longitude: String(booth.longitude),
                      description: booth.description,
                      imageUrl: booth.imageUrl || '',
                      estimatedWaitMinutes: booth.estimatedWaitMinutes ?? '',
                      remainingStock: booth.remainingStock ?? '',
                      liveStatusMessage: booth.liveStatusMessage || '',
                    });
                  }}>수정</button>
                  <button type="button" className="px-2 py-1 rounded bg-rose-100 text-rose-700" onClick={async () => {
                    if (!confirm('이 부스를 삭제할까요?')) return;
                    await deleteBooth(booth.id);
                    await loadAll();
                  }}>삭제</button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <input className="border rounded px-2 py-1 text-xs" placeholder="대기분" value={boothLiveDrafts[booth.id]?.estimatedWaitMinutes ?? ''} onChange={(e) => setBoothLiveDrafts((p) => ({ ...p, [booth.id]: { ...p[booth.id], estimatedWaitMinutes: e.target.value } }))} />
                <input className="border rounded px-2 py-1 text-xs" placeholder="잔여수량" value={boothLiveDrafts[booth.id]?.remainingStock ?? ''} onChange={(e) => setBoothLiveDrafts((p) => ({ ...p, [booth.id]: { ...p[booth.id], remainingStock: e.target.value } }))} />
                <button type="button" className="rounded border py-1 text-xs font-semibold" onClick={() => handleSaveBoothLiveStatus(booth.id)}>실시간 저장</button>
              </div>
              <input className="mt-2 w-full border rounded px-2 py-1 text-xs" placeholder="운영 메모" value={boothLiveDrafts[booth.id]?.liveStatusMessage ?? ''} onChange={(e) => setBoothLiveDrafts((p) => ({ ...p, [booth.id]: { ...p[booth.id], liveStatusMessage: e.target.value } }))} />

              <div className="mt-2 flex items-center gap-2">
                <input type="file" accept="image/*" className="text-xs" onChange={(e) => setUploadFiles((prev) => ({ ...prev, [booth.id]: e.target.files?.[0] || null }))} />
                <button type="button" onClick={() => handleImageUpload(booth.id)} className="rounded border px-2 py-1 text-xs">이미지 업로드</button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold">공연 등록/수정</h3>
        <form className="space-y-2" onSubmit={handleEventSubmit}>
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="공연 제목" value={eventForm.title} onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" className="border rounded px-2 py-2 text-sm" value={eventForm.startTime} onChange={(e) => setEventForm((p) => ({ ...p, startTime: e.target.value }))} required />
            <input type="datetime-local" className="border rounded px-2 py-2 text-sm" value={eventForm.endTime} onChange={(e) => setEventForm((p) => ({ ...p, endTime: e.target.value }))} required />
          </div>
          <button className="w-full rounded bg-cyan-700 text-white py-2 text-sm">{editingEventId ? '공연 수정' : '공연 추가'}</button>
        </form>

        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="border rounded p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{event.title}</p>
                <div className="flex gap-1">
                  <button type="button" className="px-2 py-1 rounded bg-rose-50 text-rose-700" onClick={() => handleQuickEventStartNotice(event.id)}>시작안내</button>
                  <button type="button" className="px-2 py-1 rounded bg-slate-100" onClick={() => {
                    setEditingEventId(event.id);
                    setEventForm({ title: event.title, startTime: event.startTime.slice(0, 16), endTime: event.endTime.slice(0, 16) });
                  }}>수정</button>
                  <button type="button" className="px-2 py-1 rounded bg-rose-100 text-rose-700" onClick={async () => {
                    if (!confirm('이 공연을 삭제할까요?')) return;
                    await deleteEvent(event.id);
                    await loadAll();
                  }}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="font-semibold">CSV 일괄 업로드</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-xs text-slate-600">부스 CSV</p>
            <input type="file" accept=".csv" onChange={(e) => setImportFiles((prev) => ({ ...prev, booths: e.target.files?.[0] || null }))} className="text-xs" />
            <button type="button" onClick={() => handleImport('booths')} className="w-full rounded border py-1.5 text-xs">부스 업로드</button>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-600">공연 CSV</p>
            <input type="file" accept=".csv" onChange={(e) => setImportFiles((prev) => ({ ...prev, events: e.target.files?.[0] || null }))} className="text-xs" />
            <button type="button" onClick={() => handleImport('events')} className="w-full rounded border py-1.5 text-xs">공연 업로드</button>
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
                <p className="text-xs font-bold text-slate-700">{log.adminUsername} · {log.action} · {log.targetType}</p>
                <p className="text-[10px] text-slate-500">{log.createdAt.replace('T', ' ').slice(5, 16)}</p>
              </div>
              <p className="text-xs text-slate-600 mt-1">{log.details}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
