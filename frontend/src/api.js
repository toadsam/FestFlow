import { getAccessToken } from "./utils/auth";

const API_BASE = "http://localhost:8080/api";

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
  return parseJson(response, "嚥≪뮄??紐꾨퓠 ??쎈솭??됰뮸??덈뼄.");
}

export async function fetchBooths() {
  const response = await fetch(`${API_BASE}/booths`);
  return parseJson(response, "?봔??筌뤴뫖以??揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??");
}

export async function fetchBoothById(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}`);
  return parseJson(response, "?봔???類ｋ궖??揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??");
}

export async function fetchCongestion(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/congestion`);
  return parseJson(response, "??깆삜??鈺곌퀬?????쎈솭??됰뮸??덈뼄.");
}

export async function fetchEvents() {
  const response = await fetch(`${API_BASE}/events`);
  return parseJson(
    response,
    "?⑤벊肉?筌뤴뫖以??揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??",
  );
}

export async function sendGps(latitude, longitude) {
  const response = await fetch(`${API_BASE}/gps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  return parseJson(response, "GPS ?袁⑸꽊????쎈솭??됰뮸??덈뼄.");
}

export async function askChat(question) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return parseJson(response, "筌?ロ겦 ?臾먮뼗????쎈솭??됰뮸??덈뼄.");
}

export async function createBooth(payload) {
  const response = await fetch(`${API_BASE}/admin/booths`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?봔????밴쉐????쎈솭??됰뮸??덈뼄.");
}

export async function updateBooth(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?봔????륁젟????쎈솭??됰뮸??덈뼄.");
}

export async function updateBoothLiveStatus(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}/live-status`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(
    response,
    "?봔????쇰뻻揶??類ｋ궖 ??낅쑓??꾨뱜????쎈솭??됰뮸??덈뼄.",
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
  return parseJson(response, "???筌왖 ??낆쨮??뽯퓠 ??쎈솭??됰뮸??덈뼄.");
}

export async function reorderBooths(boothIds) {
  const response = await fetch(`${API_BASE}/admin/booths/reorder`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify({ boothIds }),
  });

  if (!response.ok) {
    throw new Error("?봔????뽮퐣 ???關肉???쎈솭??됰뮸??덈뼄.");
  }
}

export async function deleteBooth(id) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error("?봔?????????쎈솭??됰뮸??덈뼄.");
  }
}

export async function createEvent(payload) {
  const response = await fetch(`${API_BASE}/admin/events`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?⑤벊肉???밴쉐????쎈솭??됰뮸??덈뼄.");
}

export async function updateEvent(id, payload) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?⑤벊肉???륁젟????쎈솭??됰뮸??덈뼄.");
}

export async function deleteEvent(id) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error("?⑤벊肉????????쎈솭??됰뮸??덈뼄.");
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
  return parseJson(response, "?봔??CSV ??낆쨮??뽯퓠 ??쎈솭??됰뮸??덈뼄.");
}

export async function importEventCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/import/events`, {
    method: "POST",
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, "?⑤벊肉?CSV ??낆쨮??뽯퓠 ??쎈솭??됰뮸??덈뼄.");
}

export async function fetchActiveNotices() {
  const response = await fetch(`${API_BASE}/notices/active`);
  return parseJson(response, "?⑤벊? 筌뤴뫖以??揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??");
}

export async function fetchAdminNotices() {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    headers: withAuth(),
  });
  return parseJson(
    response,
    "?온?귐딆쁽 ?⑤벊? 筌뤴뫖以??揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??",
  );
}

export async function createNotice(payload) {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?⑤벊? ??밴쉐????쎈솭??됰뮸??덈뼄.");
}

export async function updateNotice(id, payload) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?⑤벊? ??륁젟????쎈솭??됰뮸??덈뼄.");
}

export async function deleteNotice(id) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });
  if (!response.ok) {
    throw new Error("?⑤벊? ???????쎈솭??됰뮸??덈뼄.");
  }
}

export async function fetchAdminDashboardKpis() {
  const response = await fetch(`${API_BASE}/admin/dashboard/kpis`, {
    headers: withAuth(),
  });
  return parseJson(response, "????뺣궖??KPI??揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??");
}

export async function fetchAuditLogs() {
  const response = await fetch(`${API_BASE}/admin/audit-logs`, {
    headers: withAuth(),
  });
  return parseJson(
    response,
    "揶쏅Ŋ沅?嚥≪뮄?뉒몴?揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??",
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
    "??깆삜 ?袁れ넅 ?⑤벊? 獄쏆뮉六????쎈솭??됰뮸??덈뼄.",
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
    "?⑤벊肉???뽰삂 ?⑤벊? 獄쏆뮉六????쎈솭??됰뮸??덈뼄.",
  );
}

export async function fetchTrafficHourly() {
  const response = await fetch(`${API_BASE}/analytics/traffic-hourly`);
  return parseJson(
    response,
    "??볦퍢??癰?獄쎻뫖揆??鈺곌퀬?????쎈솭??됰뮸??덈뼄.",
  );
}

export async function fetchPopularBooths() {
  const response = await fetch(`${API_BASE}/analytics/popular-booths`);
  return parseJson(response, "?硫몃┛ ?봔????沅?鈺곌퀬?????쎈솭??됰뮸??덈뼄.");
}

export async function fetchHeatmap() {
  const response = await fetch(`${API_BASE}/analytics/congestion-heatmap`);
  return parseJson(response, "??깆삜 ??딅뱜筌?鈺곌퀬?????쎈솭??됰뮸??덈뼄.");
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
  window.open(`${API_BASE}/export/booths.csv`, "_blank", "noopener,noreferrer");
}

export function downloadEventCsv() {
  window.open(`${API_BASE}/export/events.csv`, "_blank", "noopener,noreferrer");
}

function withOpsKey(path, key) {
  const url = new URL(`${API_BASE}${path}`);
  if (key) {
    url.searchParams.set("key", key);
  }
  return url.toString();
}

export async function fetchOpsMasterBootstrap(key) {
  const response = await fetch(withOpsKey("/ops/master/bootstrap", key));
  return parseJson(
    response,
    "???? ?온?귐딆쁽 ?怨쀬뵠?怨? 揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??",
  );
}

export async function updateOpsMasterBoothLiveStatus(boothId, payload, key) {
  const response = await fetch(
    withOpsKey(`/ops/master/booths/${boothId}/live-status`, key),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return parseJson(
    response,
    "???? ?온?귐딆쁽 ??쇰뻻揶??類ｋ궖 ???關肉???쎈솭??됰뮸??덈뼄.",
  );
}

export async function fetchOpsBoothBootstrap(boothId, key) {
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/bootstrap`, key),
  );
  return parseJson(
    response,
    "?봔???온?귐딆쁽 ?怨쀬뵠?怨? 揶쎛?紐꾩궎筌왖 筌륁궢六??щ빍??",
  );
}

export async function updateOpsBoothLiveStatus(boothId, payload, key) {
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/live-status`, key),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return parseJson(
    response,
    "?봔????쇰뻻揶??類ｋ궖 ???關肉???쎈솭??됰뮸??덈뼄.",
  );
}

export async function createOpsMasterNotice(payload, key) {
  const response = await fetch(withOpsKey("/ops/master/notices", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "???? ?⑤벊? ?源낆쨯????쎈솭??됰뮸??덈뼄.");
}

export async function updateOpsMasterNotice(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/notices/${id}`, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "???? ?⑤벊? ??륁젟????쎈솭??됰뮸??덈뼄.");
}

export async function deleteOpsMasterNotice(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/notices/${id}`, key), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("???? ?⑤벊? ???????쎈솭??됰뮸??덈뼄.");
  }
}

export async function createOpsMasterEvent(payload, key) {
  const response = await fetch(withOpsKey("/ops/master/events", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?⑤벊肉??源낆쨯????쎈솭??됰뮸??덈뼄.");
}

export async function updateOpsMasterEvent(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/events/${id}`, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?⑤벊肉???륁젟????쎈솭??됰뮸??덈뼄.");
}

export async function deleteOpsMasterEvent(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/events/${id}`, key), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("?⑤벊肉????????쎈솭??됰뮸??덈뼄.");
  }
}

export async function createOpsMasterBooth(payload, key) {
  const response = await fetch(withOpsKey("/ops/master/booths", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?봔???源낆쨯????쎈솭??됰뮸??덈뼄.");
}

export async function updateOpsMasterBooth(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${id}`, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?봔????륁젟????쎈솭??됰뮸??덈뼄.");
}

export async function deleteOpsMasterBooth(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${id}`, key), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("?봔?????????쎈솭??됰뮸??덈뼄.");
  }
}

export async function reorderOpsMasterBooths(boothIds, key) {
  const response = await fetch(withOpsKey("/ops/master/booths/reorder", key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boothIds }),
  });
  if (!response.ok) {
    throw new Error("?봔????뽮퐣 癰궰野껋럩肉???쎈솭??됰뮸??덈뼄.");
  }
}

export async function triggerOpsMasterCongestionReliefNotice(key) {
  const response = await fetch(
    withOpsKey("/ops/master/actions/congestion-relief-notice", key),
    {
      method: "POST",
    },
  );
  return parseJson(
    response,
    "??깆삜 ?袁れ넅 ?⑤벊? 獄쏆뮉六????쎈솭??됰뮸??덈뼄.",
  );
}

export async function triggerOpsMasterEventStartNotice(eventId, key) {
  const response = await fetch(
    withOpsKey(`/ops/master/actions/events/${eventId}/start-notice`, key),
    {
      method: "POST",
    },
  );
  return parseJson(
    response,
    "?⑤벊肉???뽰삂 ?⑤벊? 獄쏆뮉六????쎈솭??됰뮸??덈뼄.",
  );
}

export async function fetchStageCrowd(minutes = 10) {
  const response = await fetch(
    `${API_BASE}/analytics/stage-crowd?minutes=${minutes}`,
  );
  return parseJson(
    response,
    "?얜?? ??깆삜???類ｋ궖???븍뜄???? 筌륁궢六??щ빍??",
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
    withOpsKey(`/ops/booth/${boothId}/reservations`, key),
  );
  return parseJson(response, "예약 대시보드를 불러오지 못했습니다.");
}

export async function updateOpsBoothReservationConfig(boothId, payload, key) {
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/reservations/config`, key),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return parseJson(response, "예약 설정 저장에 실패했습니다.");
}

export async function checkInOpsBoothReservation(boothId, reservationId, key) {
  const response = await fetch(
    withOpsKey(
      `/ops/booth/${boothId}/reservations/${reservationId}/check-in`,
      key,
    ),
    {
      method: "POST",
    },
  );
  return parseJson(response, "체크인 처리에 실패했습니다.");
}

export async function checkInOpsBoothReservationByToken(boothId, token, key) {
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/reservations/check-in/by-token`, key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
