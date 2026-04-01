import { getAccessToken } from './utils/auth';

const API_BASE = 'http://localhost:8080/api';

function withAuth(headers = {}) {
  const token = getAccessToken();
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

async function parseJson(response, errorMessage) {
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.message ? ` (${data.message})` : '';
    } catch {
      detail = '';
    }
    throw new Error(`${errorMessage}${detail}`);
  }
  return response.json();
}

export function getApiBase() {
  return API_BASE;
}

export async function loginAdmin(username, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return parseJson(response, '로그인에 실패했습니다.');
}

export async function fetchBooths() {
  const response = await fetch(`${API_BASE}/booths`);
  return parseJson(response, '부스 목록을 가져오지 못했습니다.');
}

export async function fetchBoothById(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}`);
  return parseJson(response, '부스 정보를 가져오지 못했습니다.');
}

export async function fetchCongestion(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/congestion`);
  return parseJson(response, '혼잡도 조회에 실패했습니다.');
}

export async function fetchEvents() {
  const response = await fetch(`${API_BASE}/events`);
  return parseJson(response, '공연 목록을 가져오지 못했습니다.');
}

export async function sendGps(latitude, longitude) {
  const response = await fetch(`${API_BASE}/gps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  });
  return parseJson(response, 'GPS 전송에 실패했습니다.');
}

export async function askChat(question) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return parseJson(response, '챗봇 응답에 실패했습니다.');
}

export async function createBooth(payload) {
  const response = await fetch(`${API_BASE}/admin/booths`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '부스 생성에 실패했습니다.');
}

export async function updateBooth(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '부스 수정에 실패했습니다.');
}

export async function updateBoothLiveStatus(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}/live-status`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '부스 실시간 정보 업데이트에 실패했습니다.');
}

export async function uploadBoothImage(id, file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/admin/booths/${id}/image`, {
    method: 'POST',
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, '이미지 업로드에 실패했습니다.');
}

export async function reorderBooths(boothIds) {
  const response = await fetch(`${API_BASE}/admin/booths/reorder`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ boothIds }),
  });

  if (!response.ok) {
    throw new Error('부스 순서 저장에 실패했습니다.');
  }
}

export async function deleteBooth(id) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: 'DELETE',
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error('부스 삭제에 실패했습니다.');
  }
}

export async function createEvent(payload) {
  const response = await fetch(`${API_BASE}/admin/events`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '공연 생성에 실패했습니다.');
}

export async function updateEvent(id, payload) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '공연 수정에 실패했습니다.');
}

export async function deleteEvent(id) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: 'DELETE',
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error('공연 삭제에 실패했습니다.');
  }
}

export async function importBoothCsv(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/admin/import/booths`, {
    method: 'POST',
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, '부스 CSV 업로드에 실패했습니다.');
}

export async function importEventCsv(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/admin/import/events`, {
    method: 'POST',
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, '공연 CSV 업로드에 실패했습니다.');
}

export async function fetchActiveNotices() {
  const response = await fetch(`${API_BASE}/notices/active`);
  return parseJson(response, '공지 목록을 가져오지 못했습니다.');
}

export async function fetchAdminNotices() {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    headers: withAuth(),
  });
  return parseJson(response, '관리자 공지 목록을 가져오지 못했습니다.');
}

export async function createNotice(payload) {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '공지 생성에 실패했습니다.');
}

export async function updateNotice(id, payload) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '공지 수정에 실패했습니다.');
}

export async function deleteNotice(id) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: 'DELETE',
    headers: withAuth(),
  });
  if (!response.ok) {
    throw new Error('공지 삭제에 실패했습니다.');
  }
}

export async function fetchAdminDashboardKpis() {
  const response = await fetch(`${API_BASE}/admin/dashboard/kpis`, {
    headers: withAuth(),
  });
  return parseJson(response, '대시보드 KPI를 가져오지 못했습니다.');
}

export async function fetchAuditLogs() {
  const response = await fetch(`${API_BASE}/admin/audit-logs`, {
    headers: withAuth(),
  });
  return parseJson(response, '감사 로그를 가져오지 못했습니다.');
}

export async function triggerCongestionReliefNotice() {
  const response = await fetch(`${API_BASE}/admin/actions/congestion-relief-notice`, {
    method: 'POST',
    headers: withAuth(),
  });
  return parseJson(response, '혼잡 완화 공지 발행에 실패했습니다.');
}

export async function triggerEventStartNotice(eventId) {
  const response = await fetch(`${API_BASE}/admin/actions/events/${eventId}/start-notice`, {
    method: 'POST',
    headers: withAuth(),
  });
  return parseJson(response, '공연 시작 공지 발행에 실패했습니다.');
}

export async function fetchTrafficHourly() {
  const response = await fetch(`${API_BASE}/analytics/traffic-hourly`);
  return parseJson(response, '시간대별 방문량 조회에 실패했습니다.');
}

export async function fetchPopularBooths() {
  const response = await fetch(`${API_BASE}/analytics/popular-booths`);
  return parseJson(response, '인기 부스 랭킹 조회에 실패했습니다.');
}

export async function fetchHeatmap() {
  const response = await fetch(`${API_BASE}/analytics/congestion-heatmap`);
  return parseJson(response, '혼잡 히트맵 조회에 실패했습니다.');
}

export function createCongestionStream() {
  return new EventSource(`${API_BASE}/stream/congestion`);
}

export function createEventStream() {
  return new EventSource(`${API_BASE}/stream/events`);
}

export function createNoticeStream() {
  return new EventSource(`${API_BASE}/stream/notices`);
}

export function createBoothStream() {
  return new EventSource(`${API_BASE}/stream/booths`);
}

export function downloadBoothCsv() {
  window.open(`${API_BASE}/export/booths.csv`, '_blank', 'noopener,noreferrer');
}

export function downloadEventCsv() {
  window.open(`${API_BASE}/export/events.csv`, '_blank', 'noopener,noreferrer');
}
