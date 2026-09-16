// 앱을 처음 열 때 1.6초 동안 뜨는 스플래시. 하늘 + 종이비행기 + 바람 + 치토.
// 세션당 한 번만 보여 주고, 그 사이에 부스·공연 데이터를 미리 받아 둔다.
import { useEffect, useState } from "react";
import { fetchBooths, fetchEvents } from "../../api";
import { FESTIVAL } from "../../config/festival";
import { Reeds } from "../order/SkyReeds";
import { Mascot, PaperPlane } from "./V2Kit";

const SEEN_KEY = "baram_splash_seen";
const SHOW_MS = 1600;
const FADE_MS = 450;

export function shouldShowSplash() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return sessionStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

export default function Splash({ onDone }) {
  const [phase, setPhase] = useState("in");

  useEffect(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 저장이 안 돼도 이번 한 번은 보여 준다.
    }
    // 화면이 떠 있는 동안 첫 화면 데이터를 미리 데워 둔다. 실패해도 스플래시는 그냥 지나간다.
    fetchBooths().catch(() => {});
    fetchEvents().catch(() => {});

    const fade = window.setTimeout(() => setPhase("out"), SHOW_MS);
    const done = window.setTimeout(() => onDone?.(), SHOW_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className={`v2-splash v2-splash--${phase}`} role="presentation" aria-hidden="true">
      <div className="v2-splash__sky" />
      <div className="v2-splash__stars" />
      <div className="v2-splash__reeds">
        <Reeds height={210} />
      </div>
      <PaperPlane className="v2-splash__plane v2-splash__plane--trail" />
      <PaperPlane className="v2-splash__plane" />
      <div className="v2-splash__copy">
        <span className="v2-splash__eyebrow">{FESTIVAL.title}</span>
        <strong className="v2-splash__title">
          {FESTIVAL.name.split("").map((char, index) => (
            <span key={`${char}-${index}`} style={{ "--i": index }}>
              {char}
            </span>
          ))}
        </strong>
        <small className="v2-splash__tagline">{FESTIVAL.tagline}</small>
      </div>
      <Mascot className="v2-splash__mascot" />
      <div className="v2-splash__frame">
        <span />
      </div>
    </div>
  );
}
