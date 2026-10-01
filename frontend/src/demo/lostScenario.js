// 눌러 보는 매뉴얼 · 분실물 흐름. 화면 둘(총괄 화면의 분실물 관리 · 손님 분실물 화면)과 순서, 방금 일어난 일을 글로 바꾸는 규칙.
// 이번 축제는 손님이 직접 등록하지 않는다(config/festival.js). 본부가 등록하고, 손님은 '내 물건이에요'만 보낸다.
import { DEMO_ADMIN_TOKEN } from "./aimatchDomain";
import { DEMO_ADMIN_NAME } from "./festDomain";

const ADMIN = "lostAdmin";
const GUEST = "lostGuest";

const frames = [
  {
    id: ADMIN,
    who: "총괄",
    label: "총괄 화면",
    sub: "본부에서 여는 관리자 화면 · 분실물 관리",
    home: "/admin",
    allow: [/^\/admin$/],
    staff: true,
    width: 1040,
    local: [
      ["festflow_access_token", DEMO_ADMIN_TOKEN],
      ["festflow_admin_name", DEMO_ADMIN_NAME],
    ],
  },
  {
    id: GUEST,
    who: "손님",
    label: "손님 분실물 화면",
    sub: "분실물 탭",
    home: "/lost-found",
    allow: [/^\/lost-found$/],
  },
];

const steps = [
  {
    key: "register",
    frame: ADMIN,
    title: "본부에 들어온 물건 등록하기",
    body: "‘분실물 관리’를 열고 물건 이름과 발견 위치를 적은 뒤 ‘등록하기’. 사진과 습득자 연락처는 선택이에요. 이번 축제는 손님이 직접 등록하지 않고 본부만 등록해요.",
  },
  {
    key: "claim",
    frame: GUEST,
    title: "‘내 물건이에요’ 보내기",
    body: "방금 뜬 물건을 누르고 ‘내 물건이에요’ → 이름과 연락처를 적고 ‘요청 보내기’.",
  },
  {
    key: "return",
    frame: ADMIN,
    title: "본인 확인하고 ‘반환 완료’ 누르기",
    body: "그 물건에 뜬 이름 · 연락처로 본인을 확인해요. 처리 메모에 어떻게 확인했는지 적고 ‘반환 완료’.",
  },
];

function progress(snapshot) {
  const { flow, items } = snapshot.lost;
  return {
    done: {
      register: flow.itemId != null,
      claim: flow.claimed || flow.deleted,
      return: flow.returned || flow.deleted,
    },
    context: { item: items.find((item) => item.id === flow.itemId) || null },
  };
}

/* ---------- 방금 일어난 일 ---------- */
const hasBatchim = (word) => {
  const text = `${word}`.trim();
  const code = text.charCodeAt(text.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};
const eul = (word) => `‘${word}’${hasBatchim(word) ? "을" : "를"}`;

const titleIs = (node, selector, title) => node.querySelector(selector)?.textContent.trim() === title;
const guestItem = (title) => (doc) => [...doc.querySelectorAll(".v2-lost")].find((node) => titleIs(node, ".v2-lost__head strong", title)) || null;
const guestList = (doc) => doc.querySelector(".v2-lost-list");
const adminItem = (title) => (doc) => [...doc.querySelectorAll(".alost-item")].find((node) => titleIs(node, ".alost-item__title strong", title)) || null;

function describe(event) {
  const from = event.role === GUEST ? GUEST : ADMIN;
  const title = event.item?.title;
  switch (event.type) {
    case "lost.created":
      return {
        from,
        cause: `본부가 분실물 ${eul(title)} 등록했어요`,
        effects: [
          {
            frame: GUEST,
            text: `새로고침하지 않아도 목록 맨 위에 ‘보관 중’으로 바로 떠요.${event.item.finderContact ? " 습득자 연락처는 가운데가 가려져서 나가요." : ""}`,
            show: guestItem(title),
          },
          { frame: ADMIN, text: "보관 목록 맨 위에 생겨요." },
        ],
      };
    case "lost.claimed":
      return {
        from,
        cause: `손님이 ${eul(title)} ‘내 물건이에요’라고 요청했어요`,
        effects: [
          { frame: GUEST, text: "‘요청을 보냈어요’가 뜨고 그 물건이 ‘주인 확인’으로 바뀌어요. 이제 다른 사람은 같은 물건에 요청할 수 없어요." },
          {
            frame: ADMIN,
            text: "그 물건이 ‘주인 확인’으로 바뀌고 ‘주인이라고 연락 왔어요’ 아래에 이름 · 연락처 · 증거가 보여요. 이 정보는 총괄 화면에만 보여요.",
            show: adminItem(title),
          },
        ],
      };
    case "lost.status": {
      const { status } = event.item;
      if (status === "RETURNED") {
        return {
          from,
          cause: `본부가 ${eul(title)} ‘반환 완료’로 바꿨어요`,
          effects: [
            { frame: GUEST, text: `‘반환 완료’로 바뀌고 더는 ‘내 물건이에요’를 누를 수 없어요. 위쪽의 보관 수도 ${event.stored}개로 줄어요.`, show: guestItem(title) },
            { frame: ADMIN, text: "회색 ‘반환 완료’가 되고 처리 메모가 같이 저장돼요." },
          ],
        };
      }
      if (status === "OWNER_CLAIMED") {
        return {
          from,
          cause: `본부가 ${eul(title)} ‘주인 확인’으로 바꿨어요`,
          effects: [
            { frame: GUEST, text: "‘주인 확인’으로 바뀌고, 다른 사람은 요청할 수 없게 돼요.", show: guestItem(title) },
            { frame: ADMIN, text: "다음 버튼이 ‘반환 완료’로 바뀌어요." },
          ],
        };
      }
      return {
        from,
        cause: `본부가 ${eul(title)} ‘보관 중’으로 되돌렸어요`,
        effects: [
          { frame: GUEST, text: "다시 ‘보관 중’이 되고 ‘내 물건이에요’를 받을 수 있어요.", show: guestItem(title) },
          { frame: ADMIN, text: "‘보관 중’으로 돌아가요. 앞서 온 신청자 정보는 새 요청이 올 때까지 남아 있어요." },
        ],
      };
    }
    case "lost.deleted":
      return {
        from,
        cause: `본부가 분실물 ${eul(title)} 지웠어요`,
        effects: [
          { frame: GUEST, text: "목록에서 바로 사라져요.", show: guestList },
          { frame: ADMIN, text: "보관 목록에서 없어져요. 지운 물건은 되살릴 수 없어요." },
        ],
      };
    default:
      return null;
  }
}

/* ---------- 지금 누를 곳 ---------- */
const onScreen = (node) => Boolean(node) && node.getClientRects().length > 0;
const navButton = (doc, label) =>
  [...doc.querySelectorAll(".admin-console-sidebar nav button, .admin-console-mobile-tabs button")].find(
    (button) => onScreen(button) && button.textContent.trim() === label,
  ) || null;
const buttonIn = (root, text) => (root ? [...root.querySelectorAll("button")].find((button) => button.textContent.trim() === text) || null : null);

function findTarget(stepKey, doc, { item }) {
  if (stepKey === "claim") {
    if (!item) return null;
    const sheet = doc.querySelector(".v2-sheet:not(.v2-sheet--closing)");
    if (sheet) {
      const name = sheet.querySelector('input[placeholder="본부에서 확인할 이름"]');
      if (name) {
        if (!name.value.trim()) return name;
        const contact = sheet.querySelector('input[type="tel"]');
        if (contact && !contact.value.trim()) return contact;
        return buttonIn(sheet, "요청 보내기");
      }
      return buttonIn(sheet, "내 물건이에요");
    }
    return guestItem(item.title)(doc);
  }

  const panel = doc.querySelector(".alost");
  if (!panel) return navButton(doc, "분실물 관리");
  if (stepKey === "register") {
    // 폰 폭에서는 등록 칸이 접혀 있다.
    const toggle = panel.querySelector(".alost-form__toggle");
    if (onScreen(toggle) && toggle.getAttribute("aria-expanded") !== "true") return toggle;
    const [title, location] = ["예: 검은색 가죽 지갑", "예: 노천극장 입구 계단"].map((placeholder) => panel.querySelector(`.alost-form__body input[placeholder="${placeholder}"]`));
    if (title && !title.value.trim()) return title;
    if (location && !location.value.trim()) return location;
    return panel.querySelector(".alost-submit");
  }
  if (stepKey === "return" && item) {
    const card = adminItem(item.title)(doc);
    if (!card) return null;
    const note = card.querySelector(".alost-note");
    if (note && !note.value.trim()) return note;
    return card.querySelector(".alost-btn--primary");
  }
  return null;
}

export const lostScenario = {
  id: "lost",
  label: "분실물",
  shortLabel: "분실물",
  subtitle: "분실물 · 본부 등록부터 반환까지",
  frames,
  steps,
  progress,
  describe,
  findTarget,
  scrollAnchor: ".alost-item",
  ideas: [
    "‘주인 확인’인 물건에 손님이 또 ‘내 물건이에요’를 보내면?",
    "‘보관 중으로 되돌리기’를 누르면 손님 화면은?",
    "사진을 넣어 등록하면 손님 화면에 어떻게 보일까? (연습에서는 이 브라우저 안에서만 보여요)",
    "손님 화면에서 분류 칩이나 검색으로 물건 찾아보기",
  ],
};
