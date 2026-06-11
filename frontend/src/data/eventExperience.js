import { resolveApiAssetUrl } from "../api";

export const EVENT_REMINDER_KEY = "festa_event_reminders";
export const EVENT_REMINDER_LEAD_MS = 10 * 60 * 1000;
export const EVENT_MAX_TIMER_MS = 2_147_483_647;

export const EVENT_DATE_TABS = [
  "2026-04-06",
  "2026-04-08",
  "2026-05-13",
  "2026-05-30",
  "2026-05-31",
];

export const EVENT_STAGE_FILTERS = ["전체", "메인 스테이지", "보조 무대", "잔디 광장", "버스킹"];

export const EVENT_STATUS = {
  LIVE: "진행 중",
  SOON: "10분 후 시작",
  SCHEDULED: "예정",
  ENDED: "종료",
  DELAYED: "지연",
  CANCELED: "취소",
  REMINDER: "알림 설정",
};

const CONCERT_IMAGE = "https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=1200";
const BUSKING_IMAGE = "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80";
const CHEER_IMAGE = "https://images.pexels.com/photos/1190297/pexels-photo-1190297.jpeg?auto=compress&cs=tinysrgb&w=900";
const FIREWORKS_IMAGE = "https://images.pexels.com/photos/949592/pexels-photo-949592.jpeg?auto=compress&cs=tinysrgb&w=900";
const DJ_IMAGE = "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80";

export const EVENT_PRESETS = [
  {
    id: "opening-parade",
    title: "오프닝 퍼레이드",
    stage: "메인 스테이지",
    startTime: "2026-05-30T17:20:00",
    endTime: "2026-05-30T17:50:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: CONCERT_IMAGE,
    badge: "예정",
    lead: "축제의 시작을 알리는 메인 퍼레이드",
    description: "무대와 광장을 잇는 오프닝 퍼레이드로 축제 분위기를 가장 먼저 느낄 수 있어요.",
    genre: "퍼레이드",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "80m",
    waitTime: "0분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "busking-relay",
    title: "버스킹 릴레이",
    stage: "보조 무대",
    startTime: "2026-05-30T18:30:00",
    endTime: "2026-05-30T19:10:00",
    status: EVENT_STATUS.SOON,
    imageUrl: BUSKING_IMAGE,
    badge: "10분 후 시작",
    lead: "지금 이 순간, 놓치지 말아야 할 공연!",
    description: "다양한 뮤지션들이 함께하는 릴레이 버스킹 공연! 감성 가득한 음악으로 축제를 더 뜨겁게 즐겨보세요.",
    genre: "어쿠스틱, 인디",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "120m",
    waitTime: "5분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "cheer-stage",
    title: "응원단 합동 무대",
    stage: "잔디 광장",
    startTime: "2026-05-30T19:35:00",
    endTime: "2026-05-30T20:10:00",
    status: EVENT_STATUS.LIVE,
    imageUrl: CHEER_IMAGE,
    badge: "진행 중",
    lead: "잔디 광장에서 가장 뜨거운 응원 무대",
    description: "아주 응원단과 동아리 팀이 함께 만드는 합동 무대입니다. 현장 반응이 가장 활발한 공연이에요.",
    genre: "응원, 퍼포먼스",
    age: "전체 관람가",
    host: "아주 응원단",
    distance: "150m",
    waitTime: "8분",
    crowd: "혼잡",
    weather: "22°C",
  },
  {
    id: "fireworks",
    title: "불꽃놀이",
    stage: "메인 스테이지",
    startTime: "2026-05-30T20:30:00",
    endTime: "2026-05-30T20:50:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: FIREWORKS_IMAGE,
    badge: "예정",
    lead: "밤하늘을 채우는 축제 하이라이트",
    description: "메인 스테이지 인근에서 진행되는 짧고 강한 불꽃 세션입니다. 관람 전 이동 동선을 미리 확인해 주세요.",
    genre: "스페셜 이벤트",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "95m",
    waitTime: "3분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "dj-party",
    title: "DJ 파티",
    stage: "보조 무대",
    startTime: "2026-05-30T21:00:00",
    endTime: "2026-05-30T22:00:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: DJ_IMAGE,
    badge: "예정",
    lead: "축제 마지막을 끌어올리는 DJ 무대",
    description: "보조 무대에서 이어지는 DJ 파티입니다. 공연 전후 보조 무대 주변 혼잡도가 빠르게 오를 수 있어요.",
    genre: "EDM, DJ",
    age: "전체 관람가",
    host: "DJ Flow",
    distance: "130m",
    waitTime: "6분",
    crowd: "보통",
    weather: "22°C",
  },
];

const SEED_TITLES = new Set([
  "밴드 연습실",
  "DJ Awesome",
  "에일리",
  "싸이",
  "득근득근 포징 공연",
  "하이키",
  "오프닝 퍼레이드",
  "버스킹 릴레이",
  "응원단 합동 무대",
  "인디밴드 쇼케이스",
  "DJ 나이트",
  "폐막 불꽃 카운트다운",
]);

export function readEventReminders() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EVENT_REMINDER_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveEventReminders(next) {
  localStorage.setItem(EVENT_REMINDER_KEY, JSON.stringify([...next]));
}

export function eventKey(event, index = 0) {
  return String(event?.id || event?.slug || `${event?.title || "event"}-${event?.startTime || index}`);
}

export function eventDateKey(value) {
  return value ? String(value).slice(0, 10) : "all";
}

export function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${value || ""}`.slice(11, 16) || "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function eventDurationMinutes(event) {
  const start = new Date(event?.startTime).getTime();
  const end = new Date(event?.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

export function eventDateLabel(value, compact = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(5, 10).replace("-", ".");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const base = `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  return compact ? `${base}(${weekdays[date.getDay()]})` : `${base}(${weekdays[date.getDay()]})`;
}

export function eventDayHeading(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "전체 일정";
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}(${weekdays[date.getDay()]}) 전체 일정`;
}

export function normalizeStatus(rawStatus, fallbackStatus = EVENT_STATUS.SCHEDULED) {
  const raw = `${rawStatus || ""}`.trim();
  if (!raw) return fallbackStatus;
  if (raw.includes("진행")) return EVENT_STATUS.LIVE;
  if (raw.includes("10분") || raw.includes("곧") || raw.includes("임박")) return EVENT_STATUS.SOON;
  if (raw.includes("취소")) return EVENT_STATUS.CANCELED;
  if (raw.includes("지연")) return EVENT_STATUS.DELAYED;
  if (raw.includes("종료")) return EVENT_STATUS.ENDED;
  if (raw.includes("알림")) return EVENT_STATUS.REMINDER;
  return raw;
}

export function statusTone(status) {
  if (status === EVENT_STATUS.LIVE) return "live";
  if (status === EVENT_STATUS.SOON || status === EVENT_STATUS.DELAYED) return "soon";
  if (status === EVENT_STATUS.REMINDER) return "reminded";
  if (status === EVENT_STATUS.ENDED || status === EVENT_STATUS.CANCELED) return "done";
  return "scheduled";
}

export function normalizeEvents(events = []) {
  const isSeedDataset =
    Array.isArray(events)
    && events.length > 0
    && events.some((event) => SEED_TITLES.has(event?.title) || `${event?.imageUrl || ""}`.includes("Bodybuilder"));
  const source = Array.isArray(events) && events.length && !isSeedDataset ? events : EVENT_PRESETS;
  return source.map((event, index) => normalizeEvent(event, index));
}

export function normalizeEvent(event, index = 0) {
  const preset = EVENT_PRESETS[index % EVENT_PRESETS.length];
  const seedLike = !event || SEED_TITLES.has(event.title) || `${event.imageUrl || ""}`.includes("Bodybuilder");
  const title = seedLike ? preset.title : event.title || preset.title;
  const stage = seedLike
    ? preset.stage
    : event.stage || event.locationName || event.venue || event.artist || preset.stage;
  const imageUrl = seedLike ? preset.imageUrl : resolveApiAssetUrl(event.imageUrl) || preset.imageUrl;
  const status = normalizeStatus(event.statusOverride || event.status, preset.status);

  return {
    ...preset,
    ...event,
    id: event?.id || preset.id,
    title,
    stage,
    imageUrl,
    status,
    badge: status === EVENT_STATUS.SCHEDULED ? preset.badge : status,
    description: event?.description || event?.liveMessage || preset.description,
    lead: event?.lead || preset.lead,
    genre: event?.genre || preset.genre,
    age: event?.age || preset.age,
    host: event?.host || event?.artist || preset.host,
    distance: event?.distance || preset.distance,
    waitTime: event?.waitTime || preset.waitTime,
    crowd: event?.crowd || preset.crowd,
    weather: event?.weather || preset.weather,
    startTime: event?.startTime || preset.startTime,
    endTime: event?.endTime || preset.endTime,
  };
}

export function sortedEvents(events) {
  return [...events].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

export function uniqueEventDates(events) {
  const dates = new Set(EVENT_DATE_TABS);
  events.forEach((event) => dates.add(eventDateKey(event.startTime)));
  return [...dates].filter((date) => date && date !== "all").sort();
}

export function primaryFestivalDate(events) {
  const counts = new Map();
  events.forEach((event) => {
    const key = eventDateKey(event.startTime);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "2026-05-30";
}
