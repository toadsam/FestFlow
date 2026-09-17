// 사주 소개팅 탭에 처음 들어올 때 2초 동안 뜨는 스플래시. 밤하늘·달·오행 원 그림 위에 제목과 진행 바.
// 페이지를 새로 열 때마다 한 번(앱 스플래시와 같은 규칙). 탭만 오가면 다시 안 뜬다. 그림은 public/images/saju/splash-top.webp.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SHOW_MS = 2000;
const FADE_MS = 500;
let shownThisLoad = false;

export function shouldShowSajuSplash() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    if (shownThisLoad) return false;
    return true;
  } catch {
    return false;
  }
}

export default function SajuSplash({ onDone }) {
  const [phase, setPhase] = useState("in");

  useEffect(() => {
    shownThisLoad = true;
    const fade = window.setTimeout(() => setPhase("out"), SHOW_MS);
    const done = window.setTimeout(() => onDone?.(), SHOW_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return createPortal(
    <div className={`saju-splash saju-splash--${phase}`} role="presentation" aria-hidden="true" onClick={() => setPhase("out")}>
      <div className="saju-splash__art">
        <img src="/images/saju/splash-top.webp" alt="" />
      </div>
      <div className="saju-splash__fade" />
      <div className="saju-splash__body">
        <span className="saju-splash__eyebrow">
          <i />
          FESTFLOW
          <i />
        </span>
        <strong className="saju-splash__title">AI 사주 소개팅</strong>
        <p className="saju-splash__sub">
          사주가 이어주는,
          <br />
          축제 속 특별한 인연
        </p>
        <span className="saju-splash__knot">❁</span>
        <span className="saju-splash__bar">
          <i />
        </span>
        <small className="saju-splash__caption">당신의 인연을 불러오는 중…</small>
      </div>
    </div>,
    document.body,
  );
}
