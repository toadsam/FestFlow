import { useEffect, useState } from "react";
import "../styles/saju.css";

const ELEMENT_ORDER = ["목", "화", "토", "금", "수"];

// 천간 → 오행
const STEM_ELEMENT = { 갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수" };
// 지지 → 오행·띠
const BRANCH_INFO = {
  자: ["수", "쥐"], 축: ["토", "소"], 인: ["목", "호랑이"], 묘: ["목", "토끼"], 진: ["토", "용"], 사: ["화", "뱀"],
  오: ["화", "말"], 미: ["토", "양"], 신: ["금", "원숭이"], 유: ["금", "닭"], 술: ["토", "개"], 해: ["수", "돼지"],
};
const POSITION_MEANING = {
  년주: "뿌리 · 조상과 어린 시절",
  월주: "줄기 · 부모와 사회생활",
  일주: "꽃 · 나 자신과 배우자 자리",
  시주: "열매 · 자녀와 말년",
};
const ELEMENT_COPY = {
  목: ["나무", "자라는 힘과 시작. 많으면 호기심이 넘쳐요."],
  화: ["불", "열정과 표현. 많으면 분위기를 띄워요."],
  토: ["흙", "중심과 신뢰. 많으면 든든하고 느긋해요."],
  금: ["쇠", "결단과 원칙. 많으면 깔끔하고 단호해요."],
  수: ["물", "감성과 유연함. 많으면 분위기를 잘 읽어요."],
};

export function pillarParts(value) {
  if (!value || value.length < 2) return null;
  const stem = value[0];
  const branch = value[1];
  const branchInfo = BRANCH_INFO[branch];
  return {
    stem,
    stemElement: STEM_ELEMENT[stem] || "",
    branch,
    branchElement: branchInfo ? branchInfo[0] : "",
    animal: branchInfo ? branchInfo[1] : "",
  };
}

function PillarButton({ label, value, active, onToggle }) {
  const known = Boolean(value);
  return (
    <button
      type="button"
      className={`saju-pillar${known ? "" : " saju-pillar--unknown"}${active ? " is-on" : ""}`}
      onClick={known ? onToggle : undefined}
      aria-pressed={active}
      aria-label={known ? `${label} ${value} 풀이 보기` : `${label} 없음`}
    >
      <span className="saju-pillar__label">{label}</span>
      <strong className="saju-pillar__value">{known ? value : "―"}</strong>
    </button>
  );
}

/** 한 사람의 사주. 프로필 상세와 내 프로필 양쪽에서 쓴다. 기둥·오행·일간을 누르면 풀이가 열린다. */
export function SajuPanel({ saju, title = "사주", subtitle }) {
  const [activePillar, setActivePillar] = useState(null);
  const [activeElement, setActiveElement] = useState(null);
  const [dayTipOpen, setDayTipOpen] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [barsReady, setBarsReady] = useState(false);

  useEffect(() => {
    // 막대는 0에서 차오른다. 다음 프레임에 높이를 넣어 transition 이 걸리게.
    const id = requestAnimationFrame(() => setBarsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!saju) return null;

  const counts = saju.elementCounts || {};
  const max = Math.max(1, ...ELEMENT_ORDER.map((name) => counts[name] || 0));
  const pillars = [
    ["시주", saju.hourKnown ? saju.hourPillar : ""],
    ["일주", saju.dayPillar],
    ["월주", saju.monthPillar],
    ["년주", saju.yearPillar],
  ];
  const activeParts = activePillar ? pillarParts(pillars.find(([label]) => label === activePillar)?.[1]) : null;
  const activeValue = activePillar ? pillars.find(([label]) => label === activePillar)?.[1] : "";
  const readingLong = (saju.reading || "").length > 120;

  return (
    <section className="saju-panel">
      <header className="saju-panel__head">
        <div>
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <span className="saju-zodiac">{saju.zodiac}띠</span>
      </header>

      <div className="saju-pillars">
        {pillars.map(([label, value]) => (
          <PillarButton
            key={label}
            label={label}
            value={value}
            active={activePillar === label}
            onToggle={() => setActivePillar((current) => (current === label ? null : label))}
          />
        ))}
      </div>

      {activePillar && activeParts ? (
        <div className="saju-pillar-detail" key={activePillar}>
          <strong>
            {activePillar} {activeValue}
          </strong>
          <span>{POSITION_MEANING[activePillar]}</span>
          <small>
            천간 {activeParts.stem}({activeParts.stemElement}) · 지지 {activeParts.branch}({activeParts.branchElement}
            {activeParts.animal ? `, ${activeParts.animal}` : ""})
          </small>
        </div>
      ) : (
        <p className="saju-note saju-note--hint">기둥을 누르면 그 자리의 뜻이 보여요.</p>
      )}

      {!saju.hourKnown ? (
        <p className="saju-note">태어난 시간을 몰라 시주 없이 세 기둥으로 봤어요.</p>
      ) : null}

      <button
        type="button"
        className={`saju-daymaster${dayTipOpen ? " is-on" : ""}`}
        onClick={() => setDayTipOpen((current) => !current)}
        aria-expanded={dayTipOpen}
      >
        <span>일간</span>
        <strong>
          {saju.dayMaster} <em>{saju.dayMasterElement}</em>
        </strong>
      </button>
      {dayTipOpen ? (
        <p className="saju-note saju-note--tip">
          일간은 태어난 날의 천간, 곧 '나'예요. {saju.dayMaster}({saju.dayMasterElement}) 기운이 이 사람의 바탕이고, 궁합에서 제일 크게 봐요.
        </p>
      ) : null}

      <div className="saju-elements">
        {ELEMENT_ORDER.map((name, index) => {
          const value = counts[name] || 0;
          const active = activeElement === name;
          return (
            <button
              key={name}
              type="button"
              className={`saju-element saju-element--${name}${active ? " is-on" : ""}`}
              style={{ "--i": index }}
              onClick={() => setActiveElement((current) => (current === name ? null : name))}
              aria-pressed={active}
            >
              <span className="saju-element__name">{name}</span>
              <div className="saju-element__bar">
                <i style={{ height: barsReady ? `${Math.round((value / max) * 100)}%` : "0%" }} />
              </div>
              <span className="saju-element__count">{value}</span>
            </button>
          );
        })}
      </div>
      {activeElement ? (
        <p className="saju-note saju-note--tip" key={activeElement}>
          <b>
            {activeElement}({ELEMENT_COPY[activeElement][0]}) {counts[activeElement] || 0}
          </b>{" "}
          {ELEMENT_COPY[activeElement][1]}
          {(counts[activeElement] || 0) === 0 ? " 이 사람에게는 없는 기운이라, 이 기운을 가진 상대가 잘 채워 줘요." : ""}
        </p>
      ) : null}

      {saju.reading ? (
        <div className="saju-reading-wrap">
          <p className={`saju-reading${readingLong && !readingOpen ? " is-clamped" : ""}`}>{saju.reading}</p>
          {readingLong ? (
            <button type="button" className="saju-more" onClick={() => setReadingOpen((current) => !current)}>
              {readingOpen ? "접기 ▴" : "풀이 더 읽기 ▾"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** 나와 상대의 궁합 점수(옛 화면용). */
export function SajuCompatibilityPanel({ compatibility, nickname }) {
  if (!compatibility) return null;

  const score = compatibility.score;
  const tone = score >= 80 ? "high" : score >= 60 ? "mid" : "low";
  const circumference = 2 * Math.PI * 42;
  const filled = (score / 100) * circumference;

  return (
    <section className={`saju-match saju-match--${tone}`}>
      <div className="saju-match__gauge">
        <svg viewBox="0 0 100 100" width="104" height="104" aria-hidden="true">
          <circle cx="50" cy="50" r="42" className="saju-match__track" />
          <circle
            cx="50"
            cy="50"
            r="42"
            className="saju-match__fill"
            strokeDasharray={`${filled} ${circumference}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="saju-match__score">
          <strong>{score}</strong>
          <span>점</span>
        </div>
      </div>

      <div className="saju-match__body">
        <span className="saju-match__grade">{compatibility.grade}</span>
        <p className="saju-match__headline">{compatibility.headline}</p>
        {nickname ? <small className="saju-match__who">{nickname} 님과의 궁합</small> : null}
        <ul className="saju-match__reasons">
          {(compatibility.reasons || []).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** 목록 카드에 붙는 작은 궁합 배지. */
export function SajuScoreBadge({ compatibility }) {
  if (!compatibility) return null;
  const tone = compatibility.score >= 80 ? "high" : compatibility.score >= 60 ? "mid" : "low";
  return (
    <span className={`saju-badge saju-badge--${tone}`}>
      궁합 <strong>{compatibility.score}</strong>
    </span>
  );
}
