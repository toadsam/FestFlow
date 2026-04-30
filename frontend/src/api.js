import { getAccessToken } from "./utils/auth";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api"
).replace(/\/$/, "");

function withAuth(headers = {}) {
  const token = getAccessToken();
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

async function parseJson(response, errorMessage) {
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.message ? ` (${data.message})` : "";
    } catch {
      detail = "";
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseJson(response, "관리자 로그인에 실패했습니다.");
}

export async function fetchBooths() {
  const response = await fetch(`${API_BASE}/booths`);
  return parseJson(response, "부스 목록을 불러오지 못했습니다.");
}

export async function fetchBoothById(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}`);
  return parseJson(response, "부스 상세 정보를 불러오지 못했습니다.");
}

export async function fetchCongestion(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/congestion`);
  return parseJson(response, "혼잡도 정보를 불러오지 못했습니다.");
}

export async function fetchEvents() {
  const response = await fetch(`${API_BASE}/events`);
  return parseJson(
    response,
    "공연 목록을 불러오지 못했습니다.",
  );
}

export async function sendGps(latitude, longitude) {
  const response = await fetch(`${API_BASE}/gps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  return parseJson(response, "GPS 위치 전송에 실패했습니다.");
}

export async function askChat(question) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return parseJson(response, "챗봇 응답을 가져오지 못했습니다.");
}

export async function createBooth(payload) {
  const response = await fetch(`${API_BASE}/admin/booths`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "부스 등록에 실패했습니다.");
}

export async function updateBooth(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "부스 수정에 실패했습니다.");
}

export async function updateBoothLiveStatus(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}/live-status`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(
    response,
    "부스 실시간 운영 상태 저장에 실패했습니다.",
  );
}

export async function uploadBoothImage(id, file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/booths/${id}/image`, {
    method: "POST",
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, "부스 이미지 업로드에 실패했습니다.");
}

export async function reorderBooths(boothIds) {
  const response = await fetch(`${API_BASE}/admin/booths/reorder`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify({ boothIds }),
  });

  if (!response.ok) {
    throw new Error("부스 순서 저장에 실패했습니다.");
  }
}

export async function deleteBooth(id) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error("부스 삭제에 실패했습니다.");
  }
}

export async function createEvent(payload) {
  const response = await fetch(`${API_BASE}/admin/events`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "공연 등록에 실패했습니다.");
}

export async function updateEvent(id, payload) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "공연 수정에 실패했습니다.");
}

export async function deleteEvent(id) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error("공연 삭제에 실패했습니다.");
  }
}

export async function importBoothCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/import/booths`, {
    method: "POST",
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, "부스 CSV 업로드에 실패했습니다.");
}

export async function importEventCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/import/events`, {
    method: "POST",
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, "공연 CSV 업로드에 실패했습니다.");
}

export async function fetchActiveNotices() {
  const response = await fetch(`${API_BASE}/notices/active`);
  return parseJson(response, "활성 공지를 불러오지 못했습니다.");
}

export async function fetchAdminNotices() {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    headers: withAuth(),
  });
  return parseJson(
    response,
    "관리자 공지 목록을 불러오지 못했습니다.",
  );
}

export async function createNotice(payload) {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "공지 등록에 실패했습니다.");
}

export async function updateNotice(id, payload) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "공지 수정에 실패했습니다.");
}

export async function deleteNotice(id) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });
  if (!response.ok) {
    throw new Error("공지 삭제에 실패했습니다.");
  }
}

export async function fetchAdminDashboardKpis() {
  const response = await fetch(`${API_BASE}/admin/dashboard/kpis`, {
    headers: withAuth(),
  });
  return parseJson(response, "관리자 KPI를 불러오지 못했습니다.");
}

export async function fetchAuditLogs() {
  const response = await fetch(`${API_BASE}/admin/audit-logs`, {
    headers: withAuth(),
  });
  return parseJson(
    response,
    "관리자 작업 로그를 불러오지 못했습니다.",
  );
}

export async function triggerCongestionReliefNotice() {
  const response = await fetch(
    `${API_BASE}/admin/actions/congestion-relief-notice`,
    {
      method: "POST",
      headers: withAuth(),
    },
  );
  return parseJson(
    response,
    "혼잡 완화 공지 발행에 실패했습니다.",
  );
}

export async function triggerEventStartNotice(eventId) {
  const response = await fetch(
    `${API_BASE}/admin/actions/events/${eventId}/start-notice`,
    {
      method: "POST",
      headers: withAuth(),
    },
  );
  return parseJson(
    response,
    "공연 시작 공지 발행에 실패했습니다.",
  );
}

export async function fetchTrafficHourly() {
  const response = await fetch(`${API_BASE}/analytics/traffic-hourly`);
  return parseJson(
    response,
    "시간대별 방문 데이터를 불러오지 못했습니다.",
  );
}

export async function fetchPopularBooths() {
  const response = await fetch(`${API_BASE}/analytics/popular-booths`);
  return parseJson(response, "인기 부스 데이터를 불러오지 못했습니다.");
}

export async function fetchHeatmap() {
  const response = await fetch(`${API_BASE}/analytics/congestion-heatmap`);
  return parseJson(response, "혼잡 히트맵 데이터를 불러오지 못했습니다.");
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

export async function fetchAdminStaff() {
  const response = await fetch(`${API_BASE}/admin/staff`, {
    headers: withAuth(),
  });
  return parseJson(response, "스태프 목록을 불러오지 못했습니다.");
}

export async function updateAdminStaff(id, payload) {
  const response = await fetch(`${API_BASE}/admin/staff/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "스태프 정보 수정에 실패했습니다.");
}

export function createStaffStream() {
  return new EventSource(`${API_BASE}/stream/staff`);
}

export function createLostItemStream() {
  return new EventSource(`${API_BASE}/stream/lost-items`);
}

export function downloadBoothCsv() {
  window.open(`${API_BASE}/export/booths.csv`, "_blank", "noopener,noreferrer");
}

export function downloadEventCsv() {
  window.open(`${API_BASE}/export/events.csv`, "_blank", "noopener,noreferrer");
}

function opsHeaders(key, headers = {}) {
  return key ? { ...headers, "X-OPS-KEY": key } : headers;
}

function opsUrl(path) {
  return `${API_BASE}${path}`;
}

export async function fetchOpsMasterBootstrap(key) {
  const response = await fetch(opsUrl("/ops/master/bootstrap"), {
    headers: opsHeaders(key),
  });
  return parseJson(
    response,
    "통합 운영 콘솔을 불러오지 못했습니다.",
  );
}

export async function updateOpsMasterBoothLiveStatus(boothId, payload, key) {
  const response = await fetch(
    opsUrl(`/ops/master/booths/${boothId}/live-status`),
    {
      method: "PUT",
      headers: opsHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
  );
  return parseJson(response, "통합 운영 부스 상태 저장에 실패했습니다.");
}

export async function fetchOpsBoothBootstrap(boothId, key) {
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/bootstrap`),
    { headers: opsHeaders(key) },
  );
  return parseJson(response, "부스 운영 대시보드를 불러오지 못했습니다.");
}

export async function updateOpsBoothLiveStatus(boothId, payload, key) {
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/live-status`),
    {
      method: "PUT",
      headers: opsHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
  );
  return parseJson(response, "부스 운영 상태 저장에 실패했습니다.");
}

export async function uploadOpsBoothMenuImage(boothId, file, key) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/menu-image`),
    {
      method: "POST",
      headers: opsHeaders(key),
      body: formData,
    },
  );
  return parseJson(response, "메뉴 이미지 업로드에 실패했습니다.");
}
export async function createOpsMasterNotice(payload, key) {
  const response = await fetch(opsUrl("/ops/master/notices"), {
    method: "POST",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "통합 운영 공지 등록에 실패했습니다.");
}

export async function updateOpsMasterNotice(id, payload, key) {
  const response = await fetch(opsUrl(`/ops/master/notices/${id}`), {
    method: "PUT",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "통합 운영 공지 수정에 실패했습니다.");
}

export async function deleteOpsMasterNotice(id, key) {
  const response = await fetch(opsUrl(`/ops/master/notices/${id}`), {
    method: "DELETE",
    headers: opsHeaders(key),
  });
  if (!response.ok) {
    throw new Error("통합 운영 공지 삭제에 실패했습니다.");
  }
}

export async function createOpsMasterEvent(payload, key) {
  const response = await fetch(opsUrl("/ops/master/events"), {
    method: "POST",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "공연 등록에 실패했습니다.");
}

export async function updateOpsMasterEvent(id, payload, key) {
  const response = await fetch(opsUrl(`/ops/master/events/${id}`), {
    method: "PUT",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "공연 수정에 실패했습니다.");
}

export async function deleteOpsMasterEvent(id, key) {
  const response = await fetch(opsUrl(`/ops/master/events/${id}`), {
    method: "DELETE",
    headers: opsHeaders(key),
  });
  if (!response.ok) {
    throw new Error("공연 삭제에 실패했습니다.");
  }
}

export async function createOpsMasterBooth(payload, key) {
  const response = await fetch(opsUrl("/ops/master/booths"), {
    method: "POST",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "부스 등록에 실패했습니다.");
}

export async function updateOpsMasterBooth(id, payload, key) {
  const response = await fetch(opsUrl(`/ops/master/booths/${id}`), {
    method: "PUT",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "부스 수정에 실패했습니다.");
}

export async function deleteOpsMasterBooth(id, key) {
  const response = await fetch(opsUrl(`/ops/master/booths/${id}`), {
    method: "DELETE",
    headers: opsHeaders(key),
  });
  if (!response.ok) {
    throw new Error("부스 삭제에 실패했습니다.");
  }
}

export async function reorderOpsMasterBooths(boothIds, key) {
  const response = await fetch(opsUrl("/ops/master/booths/reorder"), {
    method: "PUT",
    headers: opsHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ boothIds }),
  });
  if (!response.ok) {
    throw new Error("부스 순서 저장에 실패했습니다.");
  }
}

export async function triggerOpsMasterCongestionReliefNotice(key) {
  const response = await fetch(
    opsUrl("/ops/master/actions/congestion-relief-notice"),
    {
      method: "POST",
      headers: opsHeaders(key),
    },
  );
  return parseJson(response, "혼잡 완화 공지 발행에 실패했습니다.");
}

export async function triggerOpsMasterEventStartNotice(eventId, key) {
  const response = await fetch(
    opsUrl(`/ops/master/actions/events/${eventId}/start-notice`),
    {
      method: "POST",
      headers: opsHeaders(key),
    },
  );
  return parseJson(response, "공연 시작 공지 발행에 실패했습니다.");
}

export async function fetchStageCrowd(minutes = 10) {
  const response = await fetch(
    `${API_BASE}/analytics/stage-crowd?minutes=${minutes}`,
  );
  return parseJson(
    response,
    "무대 혼잡 데이터를 불러오지 못했습니다.",
  );
}

export async function fetchBoothReservations(boothId, reservationToken) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/reservations`, {
    headers: reservationToken
      ? { "X-Reservation-Token": reservationToken }
      : undefined,
  });
  return parseJson(response, "예약 현황을 불러오지 못했습니다.");
}

export async function createBoothReservation(
  boothId,
  payload,
  reservationToken,
) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/reservations`, {
    method: "POST",
    headers: reservationToken
      ? {
          "Content-Type": "application/json",
          "X-Reservation-Token": reservationToken,
        }
      : { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "예약에 실패했습니다.");
}

export async function createBoothReservationCheckInToken(
  boothId,
  reservationId,
  reservationToken,
) {
  const response = await fetch(
    `${API_BASE}/booths/${boothId}/reservations/${reservationId}/check-in-token`,
    {
      method: "POST",
      headers: reservationToken
        ? { "X-Reservation-Token": reservationToken }
        : undefined,
    },
  );
  return parseJson(response, "QR 토큰 발급에 실패했습니다.");
}

export async function fetchOpsBoothReservations(boothId, key) {
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/reservations`),
    { headers: opsHeaders(key) },
  );
  return parseJson(response, "예약 대시보드를 불러오지 못했습니다.");
}

export async function updateOpsBoothReservationConfig(boothId, payload, key) {
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/reservations/config`),
    {
      method: "PUT",
      headers: opsHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
  );
  return parseJson(response, "예약 설정 저장에 실패했습니다.");
}

export async function checkInOpsBoothReservation(boothId, reservationId, key) {
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/reservations/${reservationId}/check-in`),
    {
      method: "POST",
      headers: opsHeaders(key),
    },
  );
  return parseJson(response, "체크인 처리에 실패했습니다.");
}

export async function checkInOpsBoothReservationByToken(boothId, token, key) {
  const response = await fetch(
    opsUrl(`/ops/booth/${boothId}/reservations/check-in/by-token`),
    {
      method: "POST",
      headers: opsHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ token }),
    },
  );
  return parseJson(response, "QR 체크인 처리에 실패했습니다.");
}

export async function sendReservationAuthCode(phoneNumber) {
  const response = await fetch(`${API_BASE}/reservations/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  return parseJson(response, "인증번호 발송에 실패했습니다.");
}

export async function verifyReservationAuthCode(phoneNumber, code) {
  const response = await fetch(`${API_BASE}/reservations/auth/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, code }),
  });
  return parseJson(response, "인증번호 확인에 실패했습니다.");
}

export async function loginStaff(staffNo, pin) {
  const response = await fetch(`${API_BASE}/staff/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffNo, pin }),
  });
  return parseJson(response, "스태프 로그인에 실패했습니다.");
}

export async function logoutStaff(staffToken) {
  const response = await fetch(`${API_BASE}/staff/auth/logout`, {
    method: "POST",
    headers: staffToken ? { "X-Staff-Token": staffToken } : undefined,
  });
  if (!response.ok) {
    throw new Error("스태프 로그아웃에 실패했습니다.");
  }
}

export async function fetchStaffBootstrap(staffToken) {
  const response = await fetch(`${API_BASE}/staff/bootstrap`, {
    headers: staffToken ? { "X-Staff-Token": staffToken } : undefined,
  });
  return parseJson(response, "스태프 대시보드를 불러오지 못했습니다.");
}

export async function updateMyStaffStatus(staffToken, payload) {
  const response = await fetch(`${API_BASE}/staff/me/status`, {
    method: "PUT",
    headers: staffToken
      ? { "Content-Type": "application/json", "X-Staff-Token": staffToken }
      : { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "스태프 상태 업데이트에 실패했습니다.");
}

export async function fetchLostItems(staffToken) {
  const headers = {};
  const adminToken = getAccessToken();
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  if (staffToken) {
    headers["X-Staff-Token"] = staffToken;
  }
  const response = await fetch(`${API_BASE}/lost-items`, {
    headers: Object.keys(headers).length ? headers : undefined,
  });
  return parseJson(response, "분실물 목록을 불러오지 못했습니다.");
}

export async function createLostItem(form, file, staffToken) {
  const formData = new FormData();
  formData.append("title", form.title || "");
  formData.append("description", form.description || "");
  formData.append("category", form.category || "기타");
  formData.append("foundLocation", form.foundLocation || "");
  formData.append("finderContact", form.finderContact || "");
  if (file) {
    formData.append("file", file);
  }

  const headers = {};
  const adminToken = getAccessToken();
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  if (staffToken) {
    headers["X-Staff-Token"] = staffToken;
  }

  const response = await fetch(`${API_BASE}/lost-items`, {
    method: "POST",
    headers,
    body: formData,
  });
  return parseJson(response, "분실물 등록에 실패했습니다.");
}

export async function updateLostItemStatus(id, payload, staffToken) {
  const headers = { "Content-Type": "application/json" };
  const adminToken = getAccessToken();
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  if (staffToken) {
    headers["X-Staff-Token"] = staffToken;
  }

  const response = await fetch(`${API_BASE}/lost-items/${id}/status`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  return parseJson(response, "분실물 상태 변경에 실패했습니다.");
}

export async function updateLostItem(id, payload, staffToken) {
  const headers = { "Content-Type": "application/json" };
  const adminToken = getAccessToken();
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  if (staffToken) {
    headers["X-Staff-Token"] = staffToken;
  }

  const response = await fetch(`${API_BASE}/lost-items/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  return parseJson(response, "분실물 수정에 실패했습니다.");
}

export async function claimLostItem(id, payload) {
  const response = await fetch(`${API_BASE}/lost-items/${id}/claim`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "내 물건 표시 요청에 실패했습니다.");
}

export async function deleteLostItem(id, staffToken) {
  const headers = {};
  const adminToken = getAccessToken();
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  if (staffToken) {
    headers["X-Staff-Token"] = staffToken;
  }

  const response = await fetch(`${API_BASE}/lost-items/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "분실물 삭제에 실패했습니다.");
  }
}

export async function translateText(payload) {
  const response = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "실시간 번역에 실패했습니다.");
}

export async function fetchTranslateMetrics() {
  const response = await fetch(`${API_BASE}/translate/metrics`);
  return parseJson(response, "통역 지표를 불러오지 못했습니다.");
}

