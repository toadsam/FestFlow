// 총학생회 카드뉴스(인스타 게시물)를 앱 안에서 넘겨 보는 소식. 원본은 이미지지만 글자·지도·버튼을 살려 다시 그렸다.
// 새 묶음을 올리려면 CARD_NEWS 에 묶음을 하나 더하고, pages 에 components/cardnews/CardNewsViewer.jsx 의 PAGES 키를 적는다.
// PAGE_INFO 는 ⓘ 버튼을 눌렀을 때 나오는 한 줄 요약(원본 카드의 글을 옮긴 것).

export const CARD_NEWS_IMG = "/images/cardnews";

const BOTH_DAYS = "10. 07. (수) - 10. 08. (목)";

export const MAIN_BOOTH = {
  place: "성호관 잔디밭",
  placeLong: "성호관 앞 잔디밭 총학생회 메인부스",
  dates: "10.07 (수) – 10.08 (목)",
  hours: "10:00 – 17:00",
  days: ["2026-10-07", "2026-10-08"],
  open: "10:00",
  close: "17:00",
};

export const CONTACTS = [
  { role: "문화기획국 국장", name: "염혜영", phone: "010-8663-6542" },
  { role: "문화기획국 차장", name: "권현우", phone: "010-9443-9200" },
  { role: "문화기획국 차장", name: "정지호", phone: "010-5299-6842" },
];

export const GOODS = {
  tee: { name: "치토 티셔츠 - 2color", price: "24,000원" },
  keyring: { name: "치토 키캡 키링 4구", price: "9,000원" },
};

/* ---------- 공연무대(10.08 노천극장) ---------- */
export const STAGE = {
  place: "노천극장(The Art)",
  entry: "17:30",
  entryNote: "입장 시간은 현장 상황에 따라 변동될 수 있습니다.",
  entryAt: "2026-10-08T17:30:00",
  rules: [
    { text: "노천극장은 [아주인(학부생, 대학원생, 교직원, 졸업생)]만 입장 가능합니다.", sub: "외부인은 노천극장 입장이 불가능합니다." },
    { text: "입장 전 [학생증(또는 모바일 학생증)을 통한 입장 확인 절차가 진행]될 예정이오니 미리 준비해 주시기 바랍니다." },
    { text: "노천극장의 수용인원을 초과하는 등 [현장 상황에 따라 입장이 제한]될 수 있습니다." },
    { text: "안전사고 예방을 위해 [가을축제 <바람> 현장 스태프의 통제]를 반드시 따라 주시기 바랍니다." },
  ],
  gate: "총학생회 본부 옆 노천극장 입구",
  queue: [
    "공연무대 입구는 [본부 옆에 위치한 입구가 유일]하며 [이외의 모든 출입구는 폐쇄]됩니다.",
    "반드시 정해진 입구로만 통행해 주시기 바랍니다.",
    "지정된 입구가 아닌 [다른 곳으로 통행을 하는 경우 퇴장 조치]됨을 알려드립니다.",
    "다른 학우분의 통행에 방해가 되지 않도록 한쪽으로 정렬하여 줄을 서주시기 바랍니다.",
    "[대리 줄 서기를 금지]합니다.",
    "[가을축제 <바람> 현장 스태프의 통제]를 반드시 따라 주시기 바랍니다.",
  ],
  teams: [
    "스파이더스",
    "라스트댄스",
    "오분쉼표",
    "하늘느낌표",
    "정민경, 박민서",
    "늙크크",
    "김준영",
    "MASTERPIECE",
    "BEAT",
    "낮에는 착합니다",
    "보석함",
    "늑대야",
  ],
  banned: [
    { icon: "bottle", label: "병, 캔, 유리, 높은 굽 구두 등", strong: "날카롭고 뾰족한 모든 물건" },
    { icon: "knife", label: "칼, 총기류, 폭죽 등", strong: "위험물품" },
    { icon: "camera", label: "대포 카메라", strong: "전문 촬영 장비" },
    { icon: "fire", label: "가스버너, 폭죽 등", strong: "화기 물품" },
    { icon: "food", label: "", strong: "음식물, 주류" },
    { icon: "warn", label: "이 외 위험하다고 판단되는 모든 물품", strong: "" },
  ],
  etc: [
    "[공연 관람을 방해]하거나 [진행에 지장을 주는 행위]는 경고 없이 [즉각 퇴장 조치]됨을 알려드립니다.",
    "[스태프의 안전 통제를 따르지 않은 경우 즉각 퇴장 조치]됨을 알려드립니다.",
    "[노천극장 계단의 경사가 매우 가파르니] 계단에서는 발을 헛딛는 등 안전사고에 유의하시기 바랍니다.",
    "안전을 고려하여 현장 상황 및 인원 밀집도에 따라 [퇴장 후 재입장이 일시적으로 불가능]할 수 있습니다.",
    "공연이 종료된 후 퇴장 시에는 [입구에 가까운 인원부터 순차적으로 퇴장]하며, 압사 및 넘어짐 사고가 발생하지 않도록 [앞사람과의 적당한 간격을 두어 천천히 퇴장]해 주시기 바랍니다.",
  ],
};

/* ---------- 배리어 프리존(10.08) ---------- */
export const BARRIER = {
  place: "아주대학교 노천극장(The Art)",
  hours: "18:00 – 22:00",
  about:
    "배리어 프리(Barrier - free)는 사회적 약자들의 사회 생활에 지장이 되는 물리적인 장애물이나 심리적인 장벽을 없애기 위해 실시하는 운동 및 정책을 의미합니다.",
  steps: [
    "공연무대(아주대학교 노천극장 The Art) 도착 후 현장 스태프에게 배리어 프리존 이동 문의",
    "간단한 입장 확인 절차 진행",
    "배리어 프리존 입장 통로로 현장 스태프와 함께 이동",
    "배리어 프리존 입장",
  ],
  notes: [
    "배리어 프리존 입장을 희망하시는 학우분께서는 학생증(또는 모바일 학생증)을 지참해 주시기 바랍니다.",
    "배리어 프리존은 아주대학교 학생만 입장 가능하며, 최대 동반 1인까지 입장 가능합니다.",
    "동반 1인은 아주대학교 학생이 아니어도 배리어 프리존 입장이 가능합니다.",
    "배리어 프리존 입장 절차를 반드시 준수하시기 바랍니다.",
  ],
};

/* ---------- 체육대회(10.07) ---------- */
export const SPORTS = {
  when: "26. 10. 07. (수) 13:00 ~ 15:00",
  start: "2026-10-07T13:00:00",
  end: "2026-10-07T15:00:00",
  place: "아주대학교 대운동장",
  events: ["계주", "줄다리기", "단체줄넘기", "판 뒤집기"],
  perks: ["AAP 장학 마일리지 활용 가능", "출석 인증서 발급가능"],
  prizes: [
    { img: "prize-airpods", name: "에어팟", note: "" },
    { img: "prize-shinsegae", name: "신세계 상품권", note: "5만원" },
    { img: "prize-baemin", name: "배민 상품권", note: "2만원" },
  ],
};

/* ---------- 포토부스 · 주류 ---------- */
export const PHOTO_BOOTH = { place: "도서관 주차장", dates: "10.07 (수) – 10.08 (목)" };

export const BAR = {
  place: "교내 편의점",
  hours: "18:00 - 23:00",
  rule: "외부 주류의 경우 페트병으로 제한합니다. 안전상의 이유로 유리병 반입이 금지됩니다.",
  rule2: "유리병 적발 시 회수 조치 예정입니다.",
};

/* ---------- 묶음 ----------
 * cover.lines 는 표지 큰 글씨(줄마다), cover.sub 는 그 아래 작은 영어 줄, cover.date 는 날짜 줄.
 */
export const CARD_NEWS = [
  {
    id: "main-booth",
    title: "총학생회 메인부스",
    cover: { lines: ["총학생회 메인부스"], date: BOTH_DAYS },
    pages: ["cover", "booth-map", "goods", "leaflet", "tattoo", "wish-stamp", "sum-saju", "contact"],
  },
  {
    id: "goods",
    title: "굿즈 안내",
    cover: { lines: ["굿즈 안내"], date: BOTH_DAYS },
    pages: ["cover", "goods-place", "tee", "keyring", "contact"],
  },
  {
    id: "stage",
    title: "공연무대 입장 안내 및 안전 유의사항",
    shelfTitle: ["공연무대", "입장·안전"],
    cover: { lines: ["공연무대 입장 안내", "및 안전 유의사항"], date: "10. 08. (목)" },
    pages: ["cover", "stage-entry", "stage-queue", "stage-teams", "stage-banned", "stage-etc", "contact"],
  },
  {
    id: "barrier-free",
    title: "공연 무대 배리어 프리존",
    shelfTitle: ["배리어", "프리존"],
    cover: { lines: ["공연 무대", "배리어 프리존"], sub: "BARRIER-FREE ZONE", date: "10.08 (목)" },
    pages: ["cover", "barrier-about", "barrier-steps", "barrier-map", "barrier-notes", "contact"],
  },
  {
    id: "sports",
    title: "체육대회 안내",
    cover: { lines: ["체육대회 안내"], date: "10. 07. (수)" },
    pages: ["cover", "sports-info", "sports-teams", "contact"],
  },
  {
    id: "photo-booth",
    title: "포토부스 안내",
    cover: { lines: ["포토부스 안내"], date: BOTH_DAYS },
    pages: ["cover", "photo-place", "photo-frame", "contact"],
  },
  {
    id: "bar",
    title: "주류 안내",
    cover: { lines: ["주류 안내"], date: BOTH_DAYS },
    pages: ["cover", "bar-rules", "contact"],
  },
];

export const PAGE_TITLES = {
  cover: "표지",
  "booth-map": "총학생회 부스 안내",
  goods: "가을축제 굿즈",
  leaflet: "리플렛",
  tattoo: "타투스티커",
  "wish-stamp": "바람을 묶다 & 스탬프 미션",
  "sum-saju": "SUM주팔자",
  contact: "문의 사항",
  "goods-place": "판매 위치 안내",
  tee: "치토 티셔츠",
  keyring: "치토 키캡 키링",
  "stage-entry": "공연무대 입장 안내",
  "stage-queue": "공연무대 대기줄 및 입구 안내",
  "stage-teams": "학생참여공연팀",
  "stage-banned": "반입금지 물품 안내",
  "stage-etc": "기타 유의사항",
  "barrier-about": "공연 무대 배리어 프리존 입장 안내",
  "barrier-steps": "배리어 프리존 입장 절차",
  "barrier-map": "배리어 프리존 입구",
  "barrier-notes": "배리어 프리존 입장 관련 유의사항",
  "sports-info": "체육대회 안내",
  "sports-teams": "청팀 VS 백팀 · 추첨 상품",
  "photo-place": "포토부스 위치 안내",
  "photo-frame": "포토 프레임",
  "bar-rules": "주류 관련 유의 사항",
};

export const PAGE_INFO = {
  cover: "2026 아주대학교 가을축제 〈바람〉 · 아주대학교 제45대 총학생회 AU:SUM",
  "booth-map":
    "총학생회 메인부스는 성호관 잔디밭 주간부스 1, 2번에서, 'SUM주팔자' 부스는 주간부스 3, 4번에서 만날 수 있어요. 10.07(수) – 10.08(목), 10:00 – 17:00 운영.",
  goods:
    "2026 아주대학교 가을축제 〈바람〉의 굿즈 배부 및 판매가 총학생회 메인부스(성호관 잔디밭 1, 2번 부스)에서 이루어집니다. 굿즈 티셔츠 2color 24,000원, 키캡 키링 4구 9,000원.",
  leaflet: "총학생회 메인부스에서 〈바람〉의 부스팀, 공연팀, 아티스트까지 확인할 수 있는 리플렛을 배부합니다.",
  tattoo: "아주대학교 공식 마스코트 '치토'를 담은 타투스티커 2종. 학생증 확인 후 총학생회 메인부스에서 받을 수 있어요.",
  "wish-stamp":
    "바람을 묶다: 리본에 나만의 소원과 바람을 적어 걸어 주세요. 스탬프 미션: 축제 곳곳의 프로그램에 참여하고 스탬프를 모으면 꽝 없는 돌림판으로 특별한 선물을 드려요.",
  "sum-saju": "총학생회 소개팅 부스 SUM주팔자. 익명 채팅으로 시작되는 두근두근 소개팅, 사주로 오늘의 인연과 궁합까지 확인해 보세요.",
  contact: "제45대 총학생회 〈AU:SUM〉은 성공적인 가을축제 〈바람〉을 만들기 위해 노력하겠습니다. 문의는 문화기획국으로.",
  "goods-place": "판매 장소: 성호관 앞 잔디밭 총학생회 메인부스(1, 2번). 10.07(수) – 10.08(목), 10:00 – 17:00.",
  tee: "치토 티셔츠 2color(네이비·화이트). 앞면에는 작은 치토 친구들, 뒷면에는 2026 AJOU AUTUMN FESTIVAL 치토 프린팅. 24,000원.",
  keyring: "치토 키캡 키링 4구. 키캡 네 개에 치토 친구들과 AU 로고가 들어가요. 9,000원.",
  "stage-entry": "10.08(목) 노천극장(The Art), 17:30 입장(현장 상황에 따라 변동). 아주인만 입장, 학생증(모바일 학생증) 확인.",
  "stage-queue": "공연무대 입구는 총학생회 본부 옆 노천극장 입구 하나뿐. 다른 곳으로 들어가면 퇴장, 대리 줄 서기 금지.",
  "stage-teams": "학생참여공연팀 12팀: 스파이더스, 라스트댄스, 오분쉼표, 하늘느낌표, 정민경·박민서, 늙크크, 김준영, MASTERPIECE, BEAT, 낮에는 착합니다, 보석함, 늑대야.",
  "stage-banned": "반입 물품 검사를 합니다. 날카롭고 뾰족한 물건, 위험물품, 전문 촬영 장비, 화기 물품, 음식물·주류 등은 반입 금지.",
  "stage-etc": "관람 방해·통제 불응 시 즉각 퇴장. 노천극장 계단이 가파르니 조심, 재입장이 막힐 수 있음, 퇴장은 입구 가까운 사람부터 천천히.",
  "barrier-about": "10.08(목) 18:00 – 22:00 노천극장(The Art)에서 배리어 프리존을 운영해요.",
  "barrier-steps": "사전 신청 없이 노천극장에서 현장 스태프에게 요청하면 배리어 프리존으로 안전하고 빠르게 이동할 수 있어요.",
  "barrier-map": "배리어 프리존 입구는 노천극장 왼쪽 아래, 쓰레기장 옆이에요.",
  "barrier-notes": "학생증 지참, 아주대 학생 + 동반 1인까지(동반인은 아주대 학생이 아니어도 가능), 입장 절차 준수.",
  "sports-info": "10.07(수) 13:00 – 15:00, 대운동장. 계주 · 줄다리기 · 단체줄넘기 · 판 뒤집기. AAP 장학 마일리지, 출석 인증서 발급 가능.",
  "sports-teams": "청팀 VS 백팀. 추첨 상품: 에어팟, 신세계 상품권(5만원), 배민 상품권(2만원).",
  "photo-place": "포토부스는 도서관 주차장, 야시장 옆에서 10.07(수) – 10.08(목) 운영해요. 바람 프레임과 함께 축제를 즐겨 봐요!",
  "photo-frame": "〈바람〉 전용 포토 프레임.",
  "bar-rules": "주류 판매는 교내 편의점, 18:00 – 23:00. 외부 주류는 페트병만, 유리병은 반입 금지(적발 시 회수).",
};

export function findCardNews(id) {
  return CARD_NEWS.find((set) => set.id === id) || null;
}
