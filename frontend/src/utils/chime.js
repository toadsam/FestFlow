// 스태프 화면의 알림 소리(새 주문 · 주방에 넘어온 주문 · 음식 나옴).
// 브라우저는 화면을 한 번 누르기 전에는 소리를 막는다. 처음 누를 때 소리 통로를 열어 두고 그 뒤로 계속 쓴다.
let ctx = null;

function context() {
  if (ctx) return ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) ctx = new Ctx();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 화면을 누른 순간에 부른다. 그 뒤로는 누르지 않아도 소리가 난다. */
export function unlockChime() {
  const audio = context();
  if (audio && audio.state === "suspended") audio.resume().catch(() => {});
}

/** 지금 소리를 낼 수 있는지(한 번이라도 화면을 눌렀는지). */
export function chimeReady() {
  return ctx?.state === "running";
}

// 종류마다 음을 달리해서 화면을 안 보고도 구별한다.
const NOTES = {
  order: [880], // 새 주문(입금 대기)
  kitchen: [660, 880], // 주방에 넘어온 주문
  ready: [784, 1047, 1319], // 음식이 나옴(서빙할 것)
};

export function playChime(kind = "order") {
  try {
    const audio = context();
    if (!audio) return;
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const notes = NOTES[kind] || NOTES.order;
    notes.forEach((frequency, index) => {
      const at = audio.currentTime + index * 0.16;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.22);
    });
  } catch {
    // 소리는 없어도 된다
  }
}

if (typeof document !== "undefined") {
  const unlock = () => unlockChime();
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}
