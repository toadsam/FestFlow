// 눌러 보는 매뉴얼 · 주점 주문 흐름. 화면 셋(손님 폰 · 주문 콘솔 · 자리 현황판)과 순서, 방금 일어난 일을 글로 바꾸는 규칙.
import { DEMO_BOOTH_ID, DEMO_OPS_KEY } from "./pubDomain";

const TABLE = "3번";
const BOOTH = DEMO_BOOTH_ID;
const OPS_KEY_STORAGE = "festflow_ops_booth_key";
const STATUS_INDEX = { PENDING_PAYMENT: 0, PAID: 1, PREPARING: 2, READY: 3, COMPLETED: 4 };

const won = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

const frames = [
  {
    id: "guest",
    who: "손님",
    label: "손님 폰",
    sub: `${TABLE} 테이블 QR을 찍은 화면`,
    home: `/order/${BOOTH}/${encodeURIComponent(TABLE)}`,
    allow: [new RegExp(`^/order/${BOOTH}(/|$)`), /^\/orders\/\d+$/],
  },
  {
    id: "console",
    who: "스태프",
    label: "주문 콘솔",
    sub: "주문을 받는 스태프 화면",
    home: `/ops/booth/${BOOTH}`,
    allow: [new RegExp(`^/ops/booth/${BOOTH}(/|$)`)],
    staff: true,
    session: [[OPS_KEY_STORAGE, DEMO_OPS_KEY]],
  },
  {
    id: "board",
    who: "스태프",
    label: "자리 현황판",
    sub: "입구 스태프가 보는 화면",
    home: `/ops/booth/${BOOTH}/tables`,
    allow: [new RegExp(`^/ops/booth/${BOOTH}(/|$)`)],
    staff: true,
    session: [[OPS_KEY_STORAGE, DEMO_OPS_KEY]],
  },
];

const steps = [
  {
    key: "order",
    frame: "guest",
    title: "메뉴를 담아 주문하기",
    body: "메뉴를 누르고 담은 뒤 ‘주문하기’. 입금자명과 휴대폰 번호를 넣고 한 번 더 ‘주문하기’를 눌러요.",
  },
  {
    key: "paid",
    frame: "console",
    title: "‘입금 확인’ 누르기",
    body: "통장에 입금자명으로 돈이 들어왔는지 보고, 새로 뜬 주문 카드의 ‘입금 확인’을 눌러요.",
  },
  { key: "cook", frame: "console", title: "‘조리 시작’ 누르기", body: "주방에 주문을 넘기면서 눌러요." },
  { key: "ready", frame: "console", title: "‘준비 완료’ 누르기", body: "음식이 다 되면 눌러요. 손님 화면에 준비됐다고 떠요." },
  { key: "complete", frame: "console", title: "‘완료’ 누르기", body: "테이블에 가져다준 뒤 눌러요. 주문은 처리 중 목록에서 빠져요." },
  {
    key: "release",
    frame: "board",
    title: `손님이 나가면 ${TABLE}을 눌러 비우기`,
    body: "주문이 끝나도 자리는 저절로 비지 않아요. 손님이 일어난 걸 보고 직접 눌러요.",
  },
];

function progress(snapshot) {
  const { orders, tables } = snapshot.pub;
  const order = orders.filter((item) => !item.seed).sort((a, b) => b.id - a.id)[0] || null;
  const table = tables.find((item) => item.tableName === TABLE) || null;
  const index = order ? STATUS_INDEX[order.status] ?? -1 : -1;
  const canceled = order?.status === "CANCELED";
  return {
    done: {
      order: Boolean(order),
      paid: canceled || index >= 1,
      cook: canceled || index >= 2,
      ready: canceled || index >= 3,
      complete: canceled || index >= 4,
      release: Boolean(order) && (canceled || index >= 4) && table?.occupancyStatus === "AVAILABLE",
    },
    context: { order },
    titles: canceled ? { release: `취소된 주문이에요. ${steps[5].title}` } : {},
  };
}

function describe(event) {
  const from = frames.some((frame) => frame.id === event.role) ? event.role : "console";
  switch (event.type) {
    case "order.created":
      return {
        from,
        cause: `손님이 ${event.order.tableLabel} 테이블에서 주문했어요 (${won(event.order.totalAmount)})`,
        effects: [
          { frame: "guest", text: "‘주문이 완료되었어요’ 화면으로 넘어가고 입금 계좌가 보여요." },
          { frame: "console", text: `‘새 주문 · ${event.order.tableLabel} 테이블’ 띠가 뜨고, 주문 카드가 ‘입금 대기’로 생겨요.` },
          event.seated
            ? { frame: "board", text: `${event.order.tableLabel}이 빨간 ‘이용 중 · 방금 앉음’으로 바뀌어요.` }
            : { frame: "board", quiet: true, text: `${event.order.tableLabel}은 이미 이용 중이라 앉은 시간이 그대로예요.` },
        ],
      };
    case "order.status": {
      const table = event.order.tableLabel;
      const map = {
        PAID: {
          cause: `스태프가 ${table} 주문의 ‘입금 확인’을 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘입금이 확인됐어요’로 바뀌고 입금 계좌 안내가 사라져요." },
            { frame: "console", text: "주문 카드가 ‘입금 확인’으로 바뀌고 다음 버튼이 ‘조리 시작’이 돼요." },
          ],
        },
        PREPARING: {
          cause: `스태프가 ${table} 주문의 ‘조리 시작’을 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘조리 중이에요’로 바뀌어요." },
            { frame: "console", text: "주문 카드가 ‘조리 중’으로 바뀌어요." },
          ],
        },
        READY: {
          cause: `스태프가 ${table} 주문의 ‘준비 완료’를 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘준비가 끝났어요!’로 바뀌어요." },
            { frame: "console", text: "주문 카드가 ‘준비 완료’로 바뀌어요." },
          ],
        },
        COMPLETED: {
          cause: `스태프가 ${table} 주문의 ‘완료’를 눌렀어요`,
          effects: [
            { frame: "guest", text: "‘맛있게 드세요!’로 바뀌어요." },
            { frame: "console", text: "‘처리 중’ 목록에서 빠져요. ‘오늘 전체’를 누르면 다시 볼 수 있어요." },
            { frame: "board", quiet: true, text: `${table}은 그대로 ‘이용 중’이에요. 자리는 저절로 비지 않아요.` },
          ],
        },
        CANCELED: {
          cause: `스태프가 ${table} 주문을 취소했어요`,
          effects: [
            { frame: "guest", text: "‘주문이 취소되었어요’로 바뀌어요." },
            { frame: "console", text: "‘처리 중’ 목록에서 빠져요." },
            { frame: "board", quiet: true, text: `${table}은 그대로 ‘이용 중’이에요. 손님이 나갔으면 직접 비워요.` },
          ],
        },
      };
      return map[event.order.status] ? { from, ...map[event.order.status] } : null;
    }
    case "table.occupied":
      return {
        from,
        cause: `스태프가 ${event.table.tableName}을 ‘이용 중’으로 바꿨어요`,
        effects: [
          { frame: "board", text: `${event.table.tableName}이 빨간 ‘이용 중 · 방금 앉음’이 돼요.` },
          { frame: "console", text: `‘자리’의 ${event.table.tableName}도 이용 중으로 바뀌어요.` },
          { frame: "guest", quiet: true, text: "손님이 보는 주점 화면의 ‘남은 자리’가 하나 줄어요." },
        ],
      };
    case "table.released":
      return {
        from,
        cause: `스태프가 ${event.table.tableName}을 비웠어요`,
        effects: [
          { frame: "board", text: `${event.table.tableName}이 초록 ‘빈 자리’로 돌아와요.` },
          { frame: "console", text: `‘자리’의 ${event.table.tableName}도 빈 자리로 바뀌어요.` },
          { frame: "guest", quiet: true, text: "손님이 보는 주점 화면의 ‘남은 자리’가 하나 늘어요." },
        ],
      };
    case "booth.updated": {
      if (!event.soldOut?.length) return null;
      const item = event.soldOut[0];
      return {
        from,
        cause: `스태프가 ‘${item.name}’을 ${item.soldOut ? "품절" : "다시 판매"}로 바꿨어요`,
        effects: [
          {
            frame: "guest",
            quiet: true,
            text: item.soldOut
              ? `메뉴 화면을 다시 열면 ‘${item.name}’이 품절로 보이고 담을 수 없어요.`
              : `메뉴 화면을 다시 열면 ‘${item.name}’을 다시 담을 수 있어요.`,
          },
        ],
      };
    }
    case "order.config":
      if (!event.toggled) return null;
      return {
        from,
        cause: `스태프가 ‘QR 주문 받기’를 ${event.orderEnabled ? "켰어요" : "껐어요"}`,
        effects: [
          {
            frame: "guest",
            quiet: true,
            text: event.orderEnabled
              ? "메뉴 화면을 다시 열면 주문할 수 있어요."
              : "메뉴 화면을 다시 열면 ‘지금은 주문을 받지 않아요’가 뜨고 담을 수 없어요.",
          },
        ],
      };
    default:
      return null;
  }
}

function findTarget(stepKey, doc, { order }) {
  const pick = (selector) => doc.querySelector(selector);
  const path = decodeURIComponent(doc.location?.pathname || "");
  if (stepKey === "order") {
    if (path.startsWith("/orders/")) return pick(".od-fixed .od-ghost");
    if (path.endsWith("/checkout")) {
      const name = pick("#od-depositor");
      if (name && !name.value.trim()) return name;
      const phone = pick("#od-phone");
      if (phone && !/^0\d{9,10}$/.test(phone.value.replace(/\D/g, ""))) return phone;
      return pick(".od-fixed .od-cta:not(:disabled)");
    }
    if (pick(".od-sheet")) return pick(".od-sheet .od-cta");
    return pick(".od-cartbar") || pick(".od-menu-item:not(:disabled)");
  }
  if (stepKey === "release") {
    return [...doc.querySelectorAll(".tb-table")].find((button) => button.querySelector("strong")?.textContent.trim() === TABLE) || null;
  }
  if (!order) return null;
  const card = [...doc.querySelectorAll(".ops-order")].find((node) =>
    node.querySelector(".ops-order__meta")?.textContent.includes(`#${order.orderNo}`),
  );
  return card?.querySelector(".ops-btn--primary") || null;
}

export const pubScenario = {
  id: "pub",
  label: "주점 주문",
  subtitle: "주점 · 테이블 QR 주문",
  frames,
  steps,
  progress,
  describe,
  findTarget,
  /** 누를 곳이 이 요소 안에 있으면 요소가 통째로 보이게 맞춘다. */
  scrollAnchor: ".ops-order",
  ideas: [
    "주문 콘솔에서 주문을 ‘취소’하면 손님 화면은?",
    "주문 콘솔 ‘메뉴판’에서 품절로 바꾸면 손님 메뉴는?",
    "자리 현황판에서 빈 자리를 누르면? (주문 없이 앉은 손님)",
  ],
};
