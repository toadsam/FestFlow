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

const POSING_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Jay_Cutler_Mr._Olympia_2006-2007-2009-2010.JPG?width=900";
const AESPA_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Aespa_2024_MMA_2.jpg?width=900";
const BABYMONSTER_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/BABYMONSTER_in_Seattle.jpg?width=900";
const HEARTS2HEARTS_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Hearts2Hearts_250515.jpg?width=900";
const IZNA_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/241125_izna.png?width=900";
const NFLYING_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/180112_%EC%97%94%ED%94%8C%EB%9D%BC%EC%9E%89.jpg?width=900";
const DAY6_IMAGE = "https://commons.wikimedia.org/wiki/Special:Redirect/file/180628_Day6.jpg?width=900";

export const EVENT_PRESETS = [
  {
    id: "posing-performance",
    title: "득근득근 포징 공연",
    stage: "메인 스테이지",
    startTime: "2026-05-30T17:10:00",
    endTime: "2026-05-30T17:35:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: POSING_IMAGE,
    badge: "예정",
    lead: "축제 시작 전 분위기를 여는 포징 퍼포먼스",
    description: "메인 스테이지에서 진행되는 포징 퍼포먼스입니다. 짧고 임팩트 있는 오프닝 무대로 관객 유입이 빠르게 시작될 수 있어요.",
    genre: "퍼포먼스",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "80m",
    waitTime: "0분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "aespa",
    title: "에스파",
    stage: "메인 스테이지",
    startTime: "2026-05-30T18:00:00",
    endTime: "2026-05-30T18:45:00",
    status: EVENT_STATUS.SOON,
    imageUrl: AESPA_IMAGE,
    badge: "10분 후 시작",
    lead: "메인 스테이지 K-pop 하이라이트",
    description: "에스파 메인 공연입니다. 공연 전후 무대 앞 혼잡이 커질 수 있어 스테이지 진입 시간을 조금 앞당기는 것이 좋아요.",
    genre: "K-pop",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "120m",
    waitTime: "8분",
    crowd: "혼잡",
    weather: "22°C",
  },
  {
    id: "babymonster",
    title: "베이비몬스터",
    stage: "메인 스테이지",
    startTime: "2026-05-30T19:00:00",
    endTime: "2026-05-30T19:50:00",
    status: EVENT_STATUS.LIVE,
    imageUrl: BABYMONSTER_IMAGE,
    badge: "진행 중",
    lead: "강한 퍼포먼스 중심의 메인 무대",
    description: "베이비몬스터 공연입니다. 퍼포먼스 집중도가 높은 무대라 시작 직전 대기 인원이 빠르게 늘어날 수 있어요.",
    genre: "K-pop",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "150m",
    waitTime: "10분",
    crowd: "혼잡",
    weather: "22°C",
  },
  {
    id: "hearts2hearts",
    title: "하츠투하트",
    stage: "보조 무대",
    startTime: "2026-05-30T20:10:00",
    endTime: "2026-05-30T20:55:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: HEARTS2HEARTS_IMAGE,
    badge: "예정",
    lead: "신인 걸그룹 무대와 포토존 수요",
    description: "하츠투하트 공연입니다. 보조 무대와 포토존 주변 체류가 함께 늘 수 있어 이동 동선을 미리 잡는 것이 좋아요.",
    genre: "K-pop",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "95m",
    waitTime: "5분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "izna",
    title: "이즈나",
    stage: "보조 무대",
    startTime: "2026-05-30T21:05:00",
    endTime: "2026-05-30T21:50:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: IZNA_IMAGE,
    badge: "예정",
    lead: "야간 댄스 퍼포먼스 무대",
    description: "이즈나 공연입니다. 야간 시간대 보조 무대 앞 체류 시간이 길어질 수 있어 주변 부스 혼잡도도 같이 확인해 주세요.",
    genre: "K-pop",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "130m",
    waitTime: "6분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "nflying",
    title: "엔플라잉",
    stage: "잔디 광장",
    startTime: "2026-05-30T22:10:00",
    endTime: "2026-05-30T23:05:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: NFLYING_IMAGE,
    badge: "예정",
    lead: "잔디 광장을 채우는 밴드 라이브",
    description: "엔플라잉 밴드 라이브입니다. 공연 후 푸드존 이동 인원이 늘어날 수 있어 종료 직후 동선 분산이 필요해요.",
    genre: "밴드",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "160m",
    waitTime: "7분",
    crowd: "보통",
    weather: "22°C",
  },
  {
    id: "day6",
    title: "데이식스",
    stage: "메인 스테이지",
    startTime: "2026-05-30T23:20:00",
    endTime: "2026-05-31T00:20:00",
    status: EVENT_STATUS.SCHEDULED,
    imageUrl: DAY6_IMAGE,
    badge: "예정",
    lead: "축제 밤을 마무리하는 밴드 피날레",
    description: "데이식스 피날레 공연입니다. 종료 후 귀가 동선이 몰릴 수 있어 셔틀과 후문 방향 안내를 함께 확인해 주세요.",
    genre: "밴드",
    age: "전체 관람가",
    host: "축제 운영단",
    distance: "100m",
    waitTime: "9분",
    crowd: "혼잡",
    weather: "22°C",
  },
];

const LEGACY_EVENT_TITLES = new Set([
  "밴드 연습실",
  "DJ Awesome",
  "에일리",
  "싸이",
  "하이키",
  "키키",
  "오프닝 퍼레이드",
  "버스킹 릴레이",
  "응원단 합동 무대",
  "인디밴드 쇼케이스",
  "DJ 나이트",
  "폐막 불꽃 카운트다운",
  "재즈 버스킹",
  "댄스 배틀 예선",
  "동아리 랜덤 플레이댄스",
  "심야 어쿠스틱",
  "셔틀 막차 안내 방송",
  "오프닝 공연",
  "밴드 라이브",
  "댄스팀 쇼케이스",
  "DJ 피날레",
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
  const hasLegacyDemoEvents =
    Array.isArray(events)
    && events.length > 0
    && events.some((event) => LEGACY_EVENT_TITLES.has(event?.title) || `${event?.title || ""}`.startsWith("테스트공연"));
  const source = Array.isArray(events) && events.length && !hasLegacyDemoEvents ? events : EVENT_PRESETS;
  return source.map((event, index) => normalizeEvent(event, index));
}

export function normalizeEvent(event, index = 0) {
  const preset = EVENT_PRESETS[index % EVENT_PRESETS.length];
  const seedLike = !event || LEGACY_EVENT_TITLES.has(event.title) || `${event.title || ""}`.startsWith("테스트공연");
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
