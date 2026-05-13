export const FESTIVAL_IMAGE = "/images/offline-state.png";

export const fallbackBooths = [
  {
    id: 1,
    name: "푸드트럭 존",
    category: "푸드",
    description: "중앙광장 앞 인기 메뉴 구역",
    distance: "100m",
    wait: "10분",
    congestion: "보통",
    reservation: "여유",
  },
  {
    id: 2,
    name: "중앙무대",
    category: "공연",
    description: "18:30 오프닝 공연 시작",
    distance: "150m",
    wait: "5분",
    congestion: "여유",
    reservation: "진행중",
  },
  {
    id: 3,
    name: "응급 케어 스팟",
    category: "안전",
    description: "축제 본부 옆 운영",
    distance: "200m",
    wait: "0분",
    congestion: "여유",
    reservation: "대기",
  },
];

export const fallbackEvents = [
  {
    id: 1,
    title: "밴드 연습실",
    artist: "메인 스테이지",
    startTime: "2026-05-24T18:30:00",
    endTime: "2026-05-24T19:00:00",
    status: "예정",
  },
  {
    id: 2,
    title: "DJ Awesome",
    artist: "메인 스테이지",
    startTime: "2026-05-24T19:30:00",
    endTime: "2026-05-24T20:00:00",
    status: "예정",
  },
  {
    id: 3,
    title: "에일리",
    artist: "메인 스테이지",
    startTime: "2026-05-24T20:30:00",
    endTime: "2026-05-24T21:10:00",
    status: "곧 시작",
  },
  {
    id: 4,
    title: "싸이",
    artist: "메인 스테이지",
    startTime: "2026-05-24T21:40:00",
    endTime: "2026-05-24T22:30:00",
    status: "예정",
  },
];

export const homeRecommendations = [
  {
    tag: "여유",
    title: "응급 케어 스팟",
    caption: "대기 0분 · 학생 이탈 적음",
    tone: "mint",
  },
  {
    tag: "큰 무대",
    title: "중앙무대 공연",
    caption: "18:30 시작 · 메인 스테이지",
    tone: "violet",
  },
  {
    tag: "예약 가능",
    title: "푸드 박스 부스",
    caption: "예약 가능 12명 · 야간 운영",
    tone: "amber",
  },
];

export const mapCategories = [
  { label: "전체", icon: "grid", color: "green" },
  { label: "푸드", icon: "fork", color: "orange" },
  { label: "공연", icon: "music", color: "coral" },
  { label: "체험", icon: "spark", color: "violet" },
  { label: "안내", icon: "info", color: "blue" },
  { label: "편의", icon: "bag", color: "amber" },
];

export const crowdZones = [
  { name: "푸드트럭", value: 70, tone: "orange", x: 52, y: 18 },
  { name: "메인 스테이지", value: 60, tone: "yellow", x: 72, y: 28 },
  { name: "체험존", value: 30, tone: "mint", x: 30, y: 52 },
  { name: "거리존", value: 20, tone: "green", x: 48, y: 74 },
  { name: "키링존", value: 40, tone: "lime", x: 78, y: 62 },
];

export const trafficPrediction = [
  { hour: "지금", value: 55 },
  { hour: "18시", value: 60 },
  { hour: "19시", value: 75 },
  { hour: "20시", value: 85 },
  { hour: "21시", value: 70 },
  { hour: "22시", value: 50 },
];

export const fallbackLostItems = [
  {
    id: 1,
    title: "검은색 지갑",
    category: "지갑/카드",
    foundLocation: "학생회관 근처",
    statusLabel: "보관중",
    image: "/images/lost-empty.png",
    createdAt: "2026-05-24T14:30:00",
  },
  {
    id: 2,
    title: "에어팟 프로",
    category: "전자기기",
    foundLocation: "푸드존",
    statusLabel: "보관중",
    image: "/images/lost-empty.png",
    createdAt: "2026-05-24T13:10:00",
  },
  {
    id: 3,
    title: "아이폰 14 핑크",
    category: "전자기기",
    foundLocation: "메인 스테이지",
    statusLabel: "보관중",
    image: "/images/lost-empty.png",
    createdAt: "2026-05-23T21:50:00",
  },
  {
    id: 4,
    title: "학생증",
    category: "학생증",
    foundLocation: "재학생존",
    statusLabel: "보관중",
    image: "/images/lost-empty.png",
    createdAt: "2026-05-23T18:20:00",
  },
];

export const notices = [
  { title: "우천 시 운영 안내", date: "05.24" },
  { title: "분실물 센터 위치 안내", date: "05.24" },
  { title: "셔틀버스 운영 시간 변경 안내", date: "05.23" },
];

export const safetyCards = [
  { title: "응급처치 위치 안내", icon: "aid" },
  { title: "비상 연락망", icon: "phone" },
  { title: "대피소 안내", icon: "home" },
];

export function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${value || ""}`.slice(11, 16) || "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
