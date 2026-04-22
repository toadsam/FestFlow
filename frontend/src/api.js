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
  return parseJson(response, "?β돦裕??筌뤾쑬?????덉넮???곕????덈펲.");
}

export async function fetchBooths() {
  const response = await fetch(`${API_BASE}/booths`);
  return parseJson(response, "?遊붋??嶺뚮ㅄ維뽨빳???띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??");
}

export async function fetchBoothById(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}`);
  return parseJson(response, "?遊붋???筌먲퐢沅???띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??");
}

export async function fetchCongestion(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/congestion`);
  return parseJson(response, "??源놁궃???브퀗???????덉넮???곕????덈펲.");
}

export async function fetchEvents() {
  const response = await fetch(`${API_BASE}/events`);
  return parseJson(
    response,
    "??ㅻ쾴??嶺뚮ㅄ維뽨빳???띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??",
  );
}

export async function sendGps(latitude, longitude) {
  const response = await fetch(`${API_BASE}/gps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  return parseJson(response, "GPS ?熬곣뫖苑?????덉넮???곕????덈펲.");
}

export async function askChat(question) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return parseJson(response, "嶺????꺅 ??얜Ŧ堉?????덉넮???곕????덈펲.");
}

export async function createBooth(payload) {
  const response = await fetch(`${API_BASE}/admin/booths`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?遊붋????諛댁뎽?????덉넮???곕????덈펲.");
}

export async function updateBooth(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?遊붋????瑜곸젧?????덉넮???곕????덈펲.");
}

export async function updateBoothLiveStatus(id, payload) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}/live-status`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(
    response,
    "?遊붋?????곕뻣???筌먲퐢沅????낆몥??袁⑤콦?????덉넮???곕????덈펲.",
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
  return parseJson(response, "????嶺뚯솘? ???놁Ŧ??戮?뱺 ???덉넮???곕????덈펲.");
}

export async function reorderBooths(boothIds) {
  const response = await fetch(`${API_BASE}/admin/booths/reorder`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify({ boothIds }),
  });

  if (!response.ok) {
    throw new Error("?遊붋????戮?맋 ????쒑굢????덉넮???곕????덈펲.");
  }
}

export async function deleteBooth(id) {
  const response = await fetch(`${API_BASE}/admin/booths/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error("?遊붋??????????덉넮???곕????덈펲.");
  }
}

export async function createEvent(payload) {
  const response = await fetch(`${API_BASE}/admin/events`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "??ㅻ쾴????諛댁뎽?????덉넮???곕????덈펲.");
}

export async function updateEvent(id, payload) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "??ㅻ쾴????瑜곸젧?????덉넮???곕????덈펲.");
}

export async function deleteEvent(id) {
  const response = await fetch(`${API_BASE}/admin/events/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });

  if (!response.ok) {
    throw new Error("??ㅻ쾴??????????덉넮???곕????덈펲.");
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
  return parseJson(response, "?遊붋??CSV ???놁Ŧ??戮?뱺 ???덉넮???곕????덈펲.");
}

export async function importEventCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/import/events`, {
    method: "POST",
    headers: withAuth(),
    body: formData,
  });
  return parseJson(response, "??ㅻ쾴??CSV ???놁Ŧ??戮?뱺 ???덉넮???곕????덈펲.");
}

export async function fetchActiveNotices() {
  const response = await fetch(`${API_BASE}/notices/active`);
  return parseJson(response, "??ㅻ쾴? 嶺뚮ㅄ維뽨빳???띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??");
}

export async function fetchAdminNotices() {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    headers: withAuth(),
  });
  return parseJson(
    response,
    "??㉱?洹먮봿????ㅻ쾴? 嶺뚮ㅄ維뽨빳???띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??",
  );
}

export async function createNotice(payload) {
  const response = await fetch(`${API_BASE}/admin/notices`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "??ㅻ쾴? ??諛댁뎽?????덉넮???곕????덈펲.");
}

export async function updateNotice(id, payload) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "??ㅻ쾴? ??瑜곸젧?????덉넮???곕????덈펲.");
}

export async function deleteNotice(id) {
  const response = await fetch(`${API_BASE}/admin/notices/${id}`, {
    method: "DELETE",
    headers: withAuth(),
  });
  if (!response.ok) {
    throw new Error("??ㅻ쾴? ????????덉넮???곕????덈펲.");
  }
}

export async function fetchAdminDashboardKpis() {
  const response = await fetch(`${API_BASE}/admin/dashboard/kpis`, {
    headers: withAuth(),
  });
  return parseJson(response, "????類ｊ텠??KPI???띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??");
}

export async function fetchAuditLogs() {
  const response = await fetch(`${API_BASE}/admin/audit-logs`, {
    headers: withAuth(),
  });
  return parseJson(
    response,
    "?띠룆흮亦??β돦裕??믩ご??띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??",
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
    "??源놁궃 ?熬곥굦????ㅻ쾴? ?꾩룇裕됵쭛?????덉넮???곕????덈펲.",
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
    "??ㅻ쾴????戮곗굚 ??ㅻ쾴? ?꾩룇裕됵쭛?????덉넮???곕????덈펲.",
  );
}

export async function fetchTrafficHourly() {
  const response = await fetch(`${API_BASE}/analytics/traffic-hourly`);
  return parseJson(
    response,
    "??蹂?뜟?????꾩렮維뽪룇???브퀗???????덉넮???곕????덈펲.",
  );
}

export async function fetchPopularBooths() {
  const response = await fetch(`${API_BASE}/analytics/popular-booths`);
  return parseJson(response, "?筌롫챶???遊붋????亦??브퀗???????덉넮???곕????덈펲.");
}

export async function fetchHeatmap() {
  const response = await fetch(`${API_BASE}/analytics/congestion-heatmap`);
  return parseJson(response, "??源놁궃 ???낅콦嶺??브퀗???????덉넮???곕????덈펲.");
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
    "???? ??㉱?洹먮봿????⑥щ턄??? ?띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??",
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
    "???? ??㉱?洹먮봿?????곕뻣???筌먲퐢沅?????쒑굢????덉넮???곕????덈펲.",
  );
}

export async function fetchOpsBoothBootstrap(boothId, key) {
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/bootstrap`, key),
  );
  return parseJson(
    response,
    "?遊붋????㉱?洹먮봿????⑥щ턄??? ?띠럾??筌뤾쑴沅롧춯?뼿 嶺뚮쪇沅?쭛???鍮??",
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
    "?遊붋?????곕뻣???筌먲퐢沅?????쒑굢????덉넮???곕????덈펲.",
  );
}

export async function uploadOpsBoothMenuImage(boothId, file, key) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/menu-image`, key),
    {
      method: "POST",
      body: formData,
    },
  );
  return parseJson(response, "메뉴 이미지 업로드에 실패했습니다.");
}
export async function createOpsMasterNotice(payload, key) {
  const response = await fetch(withOpsKey("/ops/master/notices", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "???? ??ㅻ쾴? ?繹먮굞夷?????덉넮???곕????덈펲.");
}

export async function updateOpsMasterNotice(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/notices/${id}`, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "???? ??ㅻ쾴? ??瑜곸젧?????덉넮???곕????덈펲.");
}

export async function deleteOpsMasterNotice(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/notices/${id}`, key), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("???? ??ㅻ쾴? ????????덉넮???곕????덈펲.");
  }
}

export async function createOpsMasterEvent(payload, key) {
  const response = await fetch(withOpsKey("/ops/master/events", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "??ㅻ쾴???繹먮굞夷?????덉넮???곕????덈펲.");
}

export async function updateOpsMasterEvent(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/events/${id}`, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "??ㅻ쾴????瑜곸젧?????덉넮???곕????덈펲.");
}

export async function deleteOpsMasterEvent(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/events/${id}`, key), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("??ㅻ쾴??????????덉넮???곕????덈펲.");
  }
}

export async function createOpsMasterBooth(payload, key) {
  const response = await fetch(withOpsKey("/ops/master/booths", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?遊붋???繹먮굞夷?????덉넮???곕????덈펲.");
}

export async function updateOpsMasterBooth(id, payload, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${id}`, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, "?遊붋????瑜곸젧?????덉넮???곕????덈펲.");
}

export async function deleteOpsMasterBooth(id, key) {
  const response = await fetch(withOpsKey(`/ops/master/booths/${id}`, key), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("?遊붋??????????덉넮???곕????덈펲.");
  }
}

export async function reorderOpsMasterBooths(boothIds, key) {
  const response = await fetch(withOpsKey("/ops/master/booths/reorder", key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boothIds }),
  });
  if (!response.ok) {
    throw new Error("?遊붋????戮?맋 ?곌떠??롪퍔?⑵굢????덉넮???곕????덈펲.");
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
    "??源놁궃 ?熬곥굦????ㅻ쾴? ?꾩룇裕됵쭛?????덉넮???곕????덈펲.",
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
    "??ㅻ쾴????戮곗굚 ??ㅻ쾴? ?꾩룇裕됵쭛?????덉넮???곕????덈펲.",
  );
}

export async function fetchStageCrowd(minutes = 10) {
  const response = await fetch(
    `${API_BASE}/analytics/stage-crowd?minutes=${minutes}`,
  );
  return parseJson(
    response,
    "???? ??源놁궃???筌먲퐢沅???釉띾쐞???? 嶺뚮쪇沅?쭛???鍮??",
  );
}

export async function fetchBoothReservations(boothId, reservationToken) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/reservations`, {
    headers: reservationToken
      ? { "X-Reservation-Token": reservationToken }
      : undefined,
  });
  return parseJson(response, "?덉빟 ?꾪솴??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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
  return parseJson(response, "?덉빟???ㅽ뙣?덉뒿?덈떎.");
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
  return parseJson(response, "QR ?좏겙 諛쒓툒???ㅽ뙣?덉뒿?덈떎.");
}

export async function fetchOpsBoothReservations(boothId, key) {
  const response = await fetch(
    withOpsKey(`/ops/booth/${boothId}/reservations`, key),
  );
  return parseJson(response, "?덉빟 ??쒕낫?쒕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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
  return parseJson(response, "?덉빟 ?ㅼ젙 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
  return parseJson(response, "泥댄겕??泥섎━???ㅽ뙣?덉뒿?덈떎.");
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
  return parseJson(response, "QR 泥댄겕??泥섎━???ㅽ뙣?덉뒿?덈떎.");
}

export async function sendReservationAuthCode(phoneNumber) {
  const response = await fetch(`${API_BASE}/reservations/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  return parseJson(response, "?몄쬆踰덊샇 諛쒖넚???ㅽ뙣?덉뒿?덈떎.");
}

export async function verifyReservationAuthCode(phoneNumber, code) {
  const response = await fetch(`${API_BASE}/reservations/auth/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, code }),
  });
  return parseJson(response, "?몄쬆踰덊샇 ?뺤씤???ㅽ뙣?덉뒿?덈떎.");
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

export async function fetchLostItems() {
  const response = await fetch(`${API_BASE}/lost-items`);
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

