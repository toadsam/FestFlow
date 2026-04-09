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
  return parseJson(response, '濡쒓렇?몄뿉 ?ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchBooths() {
  const response = await fetch(`${API_BASE}/booths`);
  return parseJson(response, '遺??紐⑸줉??媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function fetchBoothById(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}`);
  return parseJson(response, '遺???뺣낫瑜?媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function fetchCongestion(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/congestion`);
  return parseJson(response, '?쇱옟??議고쉶???ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchEvents() {
  const response = await fetch(`${API_BASE}/events`);
  return parseJson(response, '怨듭뿰 紐⑸줉??媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function sendGps(latitude, longitude) {
  const response = await fetch(`${API_BASE}/gps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  });
  return parseJson(response, 'GPS ?꾩넚???ㅽ뙣?덉뒿?덈떎.');
}

export async function askChat(question) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return parseJson(response, '梨쀫큸 ?묐떟???ㅽ뙣?덉뒿?덈떎.');
}

export async function createBooth(payload) {
  const response = await fetch(`${API_BASE}/admin/booths`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '遺???앹꽦???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateBooth(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '遺???섏젙???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateBoothLiveStatus(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}/live-status`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '遺???ㅼ떆媛??뺣낫 ?낅뜲?댄듃???ㅽ뙣?덉뒿?덈떎.');
}

export async function uploadBoothImage(id, file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/admin/booths/${id}/image`, {
    method: 'POST',
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, '?대?吏 ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.');
}

export async function reorderBooths(boothIds) {
  const response = await fetch(`${API_BASE}/admin/booths/reorder`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ boothIds }),
  });

  if (!response.ok) {
    throw new Error('遺???쒖꽌 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function deleteBooth(id) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: 'DELETE',
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error('遺????젣???ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function createEvent(payload) {
  const response = await fetch(`${API_BASE}/admin/events`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '怨듭뿰 ?앹꽦???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateEvent(id, payload) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '怨듭뿰 ?섏젙???ㅽ뙣?덉뒿?덈떎.');
}

export async function deleteEvent(id) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: 'DELETE',
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error('怨듭뿰 ??젣???ㅽ뙣?덉뒿?덈떎.');
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
  return parseJson(response, '遺??CSV ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.');
}

export async function importEventCsv(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/admin/import/events`, {
    method: 'POST',
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, '怨듭뿰 CSV ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchActiveNotices() {
  const response = await fetch(`${API_BASE}/notices/active`);
  return parseJson(response, '怨듭? 紐⑸줉??媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function fetchAdminNotices() {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    headers: withAuth(),
  });
  return parseJson(response, '愿由ъ옄 怨듭? 紐⑸줉??媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function createNotice(payload) {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '怨듭? ?앹꽦???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateNotice(id, payload) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, '怨듭? ?섏젙???ㅽ뙣?덉뒿?덈떎.');
}

export async function deleteNotice(id) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: 'DELETE',
    headers: withAuth(),
  });
  if (!response.ok) {
    throw new Error('怨듭? ??젣???ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function fetchAdminDashboardKpis() {
  const response = await fetch(`${API_BASE}/admin/dashboard/kpis`, {
    headers: withAuth(),
  });
  return parseJson(response, '??쒕낫??KPI瑜?媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function fetchAuditLogs() {
  const response = await fetch(`${API_BASE}/admin/audit-logs`, {
    headers: withAuth(),
  });
  return parseJson(response, '媛먯궗 濡쒓렇瑜?媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function triggerCongestionReliefNotice() {
  const response = await fetch(`${API_BASE}/admin/actions/congestion-relief-notice`, {
    method: 'POST',
    headers: withAuth(),
  });
  return parseJson(response, '?쇱옟 ?꾪솕 怨듭? 諛쒗뻾???ㅽ뙣?덉뒿?덈떎.');
}

export async function triggerEventStartNotice(eventId) {
  const response = await fetch(`${API_BASE}/admin/actions/events/${eventId}/start-notice`, {
    method: 'POST',
    headers: withAuth(),
  });
  return parseJson(response, '怨듭뿰 ?쒖옉 怨듭? 諛쒗뻾???ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchTrafficHourly() {
  const response = await fetch(`${API_BASE}/analytics/traffic-hourly`);
  return parseJson(response, '?쒓컙?蹂?諛⑸Ц??議고쉶???ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchPopularBooths() {
  const response = await fetch(`${API_BASE}/analytics/popular-booths`);
  return parseJson(response, '?멸린 遺????궧 議고쉶???ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchHeatmap() {
  const response = await fetch(`${API_BASE}/analytics/congestion-heatmap`);
  return parseJson(response, '?쇱옟 ?덊듃留?議고쉶???ㅽ뙣?덉뒿?덈떎.');
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

function withOpsKey(path, key) {
  const url = new URL(`${API_BASE}${path}`);
  if (key) {
    url.searchParams.set('key', key);
  }
  return url.toString();
}

export async function fetchOpsMasterBootstrap(key) {
  const response = await fetch(withOpsKey('/ops/master/bootstrap', key));
  return parseJson(response, '?듯빀 愿由ъ옄 ?곗씠?곕? 媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function updateOpsMasterBoothLiveStatus(boothId, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${boothId}/live-status`, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '?듯빀 愿由ъ옄 ?ㅼ떆媛??뺣낫 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchOpsBoothBootstrap(boothId, key) {
  const response = await fetch(withOpsKey(`/ops/booth/${boothId}/bootstrap`, key));
  return parseJson(response, '遺??愿由ъ옄 ?곗씠?곕? 媛?몄삤吏 紐삵뻽?듬땲??');
}

export async function updateOpsBoothLiveStatus(boothId, payload, key) {
  const response = await fetch(withOpsKey(`/ops/booth/${boothId}/live-status`, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '遺???ㅼ떆媛??뺣낫 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.');
}

export async function createOpsMasterNotice(payload, key) {
  const response = await fetch(withOpsKey('/ops/master/notices', key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '?듯빀 怨듭? ?깅줉???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateOpsMasterNotice(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/notices/${id}`, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '?듯빀 怨듭? ?섏젙???ㅽ뙣?덉뒿?덈떎.');
}

export async function deleteOpsMasterNotice(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/notices/${id}`, key), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('?듯빀 怨듭? ??젣???ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function createOpsMasterEvent(payload, key) {
  const response = await fetch(withOpsKey('/ops/master/events', key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '怨듭뿰 ?깅줉???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateOpsMasterEvent(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/events/${id}`, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '怨듭뿰 ?섏젙???ㅽ뙣?덉뒿?덈떎.');
}

export async function deleteOpsMasterEvent(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/events/${id}`, key), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('怨듭뿰 ??젣???ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function createOpsMasterBooth(payload, key) {
  const response = await fetch(withOpsKey('/ops/master/booths', key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '遺???깅줉???ㅽ뙣?덉뒿?덈떎.');
}

export async function updateOpsMasterBooth(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${id}`, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '遺???섏젙???ㅽ뙣?덉뒿?덈떎.');
}

export async function deleteOpsMasterBooth(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${id}`, key), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('遺????젣???ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function reorderOpsMasterBooths(boothIds, key) {
  const response = await fetch(withOpsKey('/ops/master/booths/reorder', key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boothIds }),
  });
  if (!response.ok) {
    throw new Error('遺???쒖꽌 蹂寃쎌뿉 ?ㅽ뙣?덉뒿?덈떎.');
  }
}

export async function triggerOpsMasterCongestionReliefNotice(key) {
  const response = await fetch(withOpsKey('/ops/master/actions/congestion-relief-notice', key), {
    method: 'POST',
  });
  return parseJson(response, '?쇱옟 ?꾪솕 怨듭? 諛쒗뻾???ㅽ뙣?덉뒿?덈떎.');
}

export async function triggerOpsMasterEventStartNotice(eventId, key) {
  const response = await fetch(withOpsKey(`/ops/master/actions/events/${eventId}/start-notice`, key), {
    method: 'POST',
  });
  return parseJson(response, '怨듭뿰 ?쒖옉 怨듭? 諛쒗뻾???ㅽ뙣?덉뒿?덈떎.');
}

export async function fetchStageCrowd(minutes = 10) {
  const response = await fetch(`${API_BASE}/analytics/stage-crowd?minutes=${minutes}`);
  return parseJson(response, '臾대? ?쇱옟???뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??');
}

export async function fetchBoothReservations(boothId, userKey) {
  const url = new URL(`${API_BASE}/booths/${boothId}/reservations`);
  if (userKey) {
    url.searchParams.set('userKey', userKey);
  }
  const response = await fetch(url.toString());
  return parseJson(response, '예약 현황을 불러오지 못했습니다.');
}

export async function createBoothReservation(boothId, payload) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '예약에 실패했습니다.');
}

export async function fetchOpsBoothReservations(boothId, key) {
  const response = await fetch(withOpsKey(`/ops/booth/${boothId}/reservations`, key));
  return parseJson(response, '예약 대시보드를 불러오지 못했습니다.');
}

export async function updateOpsBoothReservationConfig(boothId, payload, key) {
  const response = await fetch(withOpsKey(`/ops/booth/${boothId}/reservations/config`, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response, '예약 설정 저장에 실패했습니다.');
}

export async function checkInOpsBoothReservation(boothId, reservationId, key) {
  const response = await fetch(withOpsKey(`/ops/booth/${boothId}/reservations/${reservationId}/check-in`, key), {
    method: 'POST',
  });
  return parseJson(response, '체크인 처리에 실패했습니다.');
}

