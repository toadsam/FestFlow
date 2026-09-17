// 이번 축제(바람) 고정 정보. 포스터 기준. 서버 데이터가 없어도 첫 화면이 비지 않도록 여기서 읽는다.
export const FESTIVAL = {
  name: "바람",
  title: "2026 아주대학교 가을축제",
  tagline: "Records of Autumn 2026",
  startDate: "2026-10-07",
  endDate: "2026-10-08",
  place: "노천극장",
  instagram: "ajou_council",
  // 포스터 파일을 frontend/public/images/poster.jpg 로 넣으면 첫 화면 배경으로 깔린다. 없으면 CSS 하늘로 그린다.
  posterUrl: "/images/poster.jpg",
  // 이번 축제 주점은 총학 주점 하나. 서버 부스 중 이름에 이 말이 들어간 부스를 주점 탭에 바로 띄운다.
  mainBoothKeyword: "총학",
  // 이번 축제는 자리 예약을 안 받는다. 손님 화면의 예약 칸과 운영 콘솔의 예약 구역을 숨긴다(빈 자리 표시는 그대로).
  reservations: false,
};

/**
 * 총학 주점 메뉴. 서버에 메뉴판이 아직 없을 때 보여 주는 기본값.
 * 알려 준 숫자는 재료 원가(예: 삼겹살 400g 4,800원)라 판매가는 비워 두었다. 판매가가 정해지면 price 를 채우거나
 * 운영 콘솔에서 메뉴판을 등록하면 이 값 대신 서버 메뉴판이 나온다.
 */
export const MAIN_BOOTH_FALLBACK = {
  name: "총학생회 주점",
  description: "노천극장 옆, 총학생회가 직접 여는 주점",
  menu: [
    { name: "삼겹살 볶음김치 쌈장", description: "삼겹살 400g · 볶음김치 100g · 쌈장 50g", price: "" },
    { name: "두부김치", description: "두부 300g · 김치 400g", price: "" },
    { name: "묵 김치 육수 김", description: "묵 300g · 김치 50g · 육수 340g · 김 10g", price: "" },
    { name: "짜파게티 2개 볶음김치", description: "짜파게티 2개 · 볶음김치 100g", price: "" },
    { name: "오뎅탕", description: "오뎅 336g · 물 500ml", price: "" },
  ],
};

export function isMainBooth(booth) {
  return `${booth?.name || ""}`.includes(FESTIVAL.mainBoothKeyword);
}

export function findMainBooth(booths) {
  if (!Array.isArray(booths)) return null;
  return booths.find(isMainBooth) || null;
}
