import { useEffect, useMemo, useState } from 'react';
import {
  createBooth,
  createEvent,
  deleteBooth,
  deleteEvent,
  fetchBooths,
  fetchEvents,
  importBoothCsv,
  importEventCsv,
  loginAdmin,
  reorderBooths,
  updateBooth,
  updateEvent,
  uploadBoothImage,
} from '../api';
import { clearLogin, getAdminName, isLoggedIn, saveLogin } from '../utils/auth';

const initialBooth = { name: '', latitude: '', longitude: '', description: '', imageUrl: '' };
const initialEvent = { title: '', startTime: '', endTime: '' };

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
  const [booths, setBooths] = useState([]);
  const [events, setEvents] = useState([]);
  const [boothForm, setBoothForm] = useState(initialBooth);
  const [eventForm, setEventForm] = useState(initialEvent);
  const [editingBoothId, setEditingBoothId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [message, setMessage] = useState('');
  const [importFiles, setImportFiles] = useState({ booths: null, events: null });
  const [draggingBoothId, setDraggingBoothId] = useState(null);
  const [uploadFiles, setUploadFiles] = useState({});

  const sortedBooths = useMemo(
    () => [...booths].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)),
    [booths]
  );

  async function loadAll() {
    const [boothData, eventData] = await Promise.all([fetchBooths(), fetchEvents()]);
    setBooths(boothData);
    setEvents(eventData);
  }

  useEffect(() => {
    if (!loggedIn) return;

    loadAll().catch(() => {
      setMessage('관리자 데이터를 불러오지 못했습니다. 다시 로그인해 주세요.');
    });
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

  async function handleBoothSubmit(e) {
    e.preventDefault();

    try {
      const payload = {
        ...boothForm,
        latitude: Number(boothForm.latitude),
        longitude: Number(boothForm.longitude),
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
      <section className="pt-4 space-y-3">
        <h2 className="text-lg font-bold">관리자 로그인</h2>
        <p className="text-xs text-slate-500">기본 계정: admin / admin1234</p>
        <form className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" onSubmit={handleLogin}>
          <input
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="아이디"
            value={loginForm.username}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
            required
          />
          <input
            type="password"
            className="w-full border rounded px-2 py-2 text-sm"
            placeholder="비밀번호"
            value={loginForm.password}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm font-semibold">로그인</button>
        </form>
        {message && <p className="text-sm text-rose-600">{message}</p>}
      </section>
    );
  }

  return (
    <section className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">관리자</h2>
        <button type="button" onClick={handleLogout} className="text-xs rounded-lg border px-2 py-1">로그아웃</button>
      </div>
      <p className="text-xs text-slate-500">로그인 사용자: {adminName}</p>
      {message && <p className="text-sm text-teal-700">{message}</p>}

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
        <h3 className="font-semibold">부스 등록/수정</h3>
        <form className="space-y-2" onSubmit={handleBoothSubmit}>
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="부스 이름" value={boothForm.name} onChange={(e) => setBoothForm((p) => ({ ...p, name: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="border rounded px-2 py-2 text-sm" placeholder="위도" value={boothForm.latitude} onChange={(e) => setBoothForm((p) => ({ ...p, latitude: e.target.value }))} required />
            <input className="border rounded px-2 py-2 text-sm" placeholder="경도" value={boothForm.longitude} onChange={(e) => setBoothForm((p) => ({ ...p, longitude: e.target.value }))} required />
          </div>
          <textarea className="w-full border rounded px-2 py-2 text-sm" placeholder="설명" value={boothForm.description} onChange={(e) => setBoothForm((p) => ({ ...p, description: e.target.value }))} required />
          <input className="w-full border rounded px-2 py-2 text-sm" placeholder="이미지 URL(선택)" value={boothForm.imageUrl} onChange={(e) => setBoothForm((p) => ({ ...p, imageUrl: e.target.value }))} />
          <button className="w-full rounded bg-teal-700 text-white py-2 text-sm">{editingBoothId ? '부스 수정' : '부스 추가'}</button>
          {editingBoothId && (
            <button type="button" className="w-full rounded border py-2 text-sm" onClick={() => {
              setEditingBoothId(null);
              setBoothForm(initialBooth);
            }}>
              편집 취소
            </button>
          )}
        </form>

        <div className="space-y-2">
          <p className="text-xs text-slate-500">드래그해서 순서 변경 후 자동 저장</p>
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
                <p className="font-semibold">#{booth.displayOrder} {booth.name}</p>
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
                        imageUrl: booth.imageUrl || '',
                      });
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-100 text-rose-700"
                    onClick={async () => {
                      if (!confirm('이 부스를 삭제할까요?')) return;
                      await deleteBooth(booth.id);
                      await loadAll();
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input type="file" accept="image/*" className="text-xs" onChange={(e) => setUploadFiles((prev) => ({ ...prev, [booth.id]: e.target.files?.[0] || null }))} />
                <button type="button" onClick={() => handleImageUpload(booth.id)} className="rounded border px-2 py-1 text-xs">
                  이미지 업로드
                </button>
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
          {editingEventId && (
            <button type="button" className="w-full rounded border py-2 text-sm" onClick={() => {
              setEditingEventId(null);
              setEventForm(initialEvent);
            }}>
              편집 취소
            </button>
          )}
        </form>

        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="border rounded p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{event.title}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-100"
                    onClick={() => {
                      setEditingEventId(event.id);
                      setEventForm({
                        title: event.title,
                        startTime: event.startTime.slice(0, 16),
                        endTime: event.endTime.slice(0, 16),
                      });
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-rose-100 text-rose-700"
                    onClick={async () => {
                      if (!confirm('이 공연을 삭제할까요?')) return;
                      await deleteEvent(event.id);
                      await loadAll();
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
