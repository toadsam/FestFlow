// 궁합을 "보는 느낌"으로. 목록 카드의 점수 링, 상단 TOP 3, 상세의 궁합 리포트(두 사주 나란히 + 오행 관계).
// 점수·등급·이유는 서버(SajuCompatibility)가 주고, 여기서는 그리기만 한다. 스타일은 styles/saju.css 의 sm-*.

import { useEffect, useRef, useState } from "react";
import { pillarParts } from "./SajuCard";

const ELEMENTS = ["목", "화", "토", "금", "수"];

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 화면에 들어오면 0에서 점수까지 0.9초 동안 차오른다. 숫자도 같이 센다. */
function useCountUp(target, durationMs = 900) {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return undefined;
    }
    const node = ref.current;
    if (!node || started.current) return undefined;
    let frame = 0;
    const run = () => {
      started.current = true;
      const from = 0;
      const startAt = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startAt) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(from + (target - from) * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    if (typeof IntersectionObserver === "undefined") {
      run();
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        run();
      }
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs]);

  return [value, ref];
}
const ELEMENT_WORD = { 목: "나무", 화: "불", 토: "흙", 금: "쇠", 수: "물" };

function toneOf(score) {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

/** 오행 관계. 목→화→토→금→수→목 은 상생, 두 칸 건너는 상극. */
export function elementRelation(mine, theirs) {
  const a = ELEMENTS.indexOf(mine);
  const b = ELEMENTS.indexOf(theirs);
  if (a < 0 || b < 0) return null;
  if (a === b) return { key: "same", label: "같은 기운", copy: `둘 다 ${ELEMENT_WORD[mine]} 기운이라 말이 잘 통해요.` };
  if ((a + 1) % 5 === b) return { key: "give", label: "내가 살려요", copy: `내 ${ELEMENT_WORD[mine]}이 상대의 ${ELEMENT_WORD[theirs]}을 키워 줘요.` };
  if ((b + 1) % 5 === a) return { key: "take", label: "상대가 살려요", copy: `상대의 ${ELEMENT_WORD[theirs]}이 내 ${ELEMENT_WORD[mine]}을 키워 줘요.` };
  if ((a + 2) % 5 === b) return { key: "clash", label: "내가 눌러요", copy: `내 ${ELEMENT_WORD[mine]}이 상대의 ${ELEMENT_WORD[theirs]}을 누르는 자리예요. 속도를 맞춰 주세요.` };
  return { key: "clash", label: "상대가 눌러요", copy: `상대의 ${ELEMENT_WORD[theirs]}이 내 ${ELEMENT_WORD[mine]}을 누르는 자리예요. 내 얘기를 먼저 꺼내 보세요.` };
}

const TIPS = {
  same: "취향이 비슷할 확률이 높아요. 같은 메뉴를 시켜 놓고 얘기부터 시작해 보세요.",
  give: "내가 리드하면 잘 굴러가요. 공연 하나 골라서 같이 보자고 먼저 말해 보세요.",
  take: "상대 페이스에 맡기면 편해요. 질문을 많이 던지고 들어 주세요.",
  clash: "첫 만남은 짧게, 부담 없이. 주점에서 한 잔 하고 괜찮으면 두 번째 약속을 잡아요.",
};

export function MatchRing({ score, size = 52, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  const [shown, ref] = useCountUp(safe);
  return (
    <span ref={ref} className={`sm-ring sm-ring--${toneOf(safe)}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="sm-ring__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="sm-ring__fill"
          strokeWidth={stroke}
          strokeDasharray={`${(shown / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <strong style={{ fontSize: Math.round(size * 0.34) }}>{Math.round(shown)}</strong>
    </span>
  );
}

/** 목록 카드 안. 점수가 있으면 링 + 등급 + 한 줄, 없으면 이유를 짧게. */
export function MatchCardBlock({ compatibility, viewerHasSaju, targetHasSaju, onFixMine, onOpen }) {
  if (compatibility) {
    const tone = toneOf(compatibility.score);
    const Tag = onOpen ? "button" : "div";
    return (
      <Tag
        type={onOpen ? "button" : undefined}
        className={`sm-card sm-card--${tone}${onOpen ? " sm-card--tap" : ""}`}
        onClick={onOpen}
      >
        <MatchRing score={compatibility.score} />
        <div className="sm-card__body">
          <span className={`sm-grade sm-grade--${tone}`}>{compatibility.grade}</span>
          <p>{compatibility.headline}</p>
        </div>
        {onOpen ? (
          <span className="sm-card__go" aria-hidden="true">
            궁합 보기 ›
          </span>
        ) : null}
      </Tag>
    );
  }
  if (!viewerHasSaju) {
    return (
      <button type="button" className="sm-card sm-card--empty" onClick={onFixMine}>
        <span className="sm-card__q">?</span>
        <div className="sm-card__body">
          <p>내 생년월일을 넣으면 이 사람과의 궁합 점수가 보여요.</p>
        </div>
      </button>
    );
  }
  if (!targetHasSaju) {
    return (
      <div className="sm-card sm-card--empty">
        <span className="sm-card__q">–</span>
        <div className="sm-card__body">
          <p>상대가 아직 사주를 안 넣었어요.</p>
        </div>
      </div>
    );
  }
  return null;
}

/** 나와 잘 맞는 세 명. */
export function MatchTop3({ profiles, resolveImage, onOpen }) {
  if (!profiles.length) return null;
  return (
    <section className="sm-top">
      <div className="sm-top__head">
        <strong>오늘 나와 궁합 TOP {profiles.length}</strong>
        <span>사주로 본 점수예요</span>
      </div>
      <div className="sm-top__row">
        {profiles.map((profile, index) => (
          <button key={profile.id} type="button" className="sm-top__card" onClick={() => onOpen(profile)}>
            <span className="sm-top__rank">{index + 1}</span>
            <span className={`sm-top__photo sm-top__photo--${toneOf(profile.compatibility.score)}`}>
              {profile.generatedImageUrl ? <img src={resolveImage(profile.generatedImageUrl)} alt="" /> : null}
              <em>{profile.compatibility.score}</em>
            </span>
            <strong>{profile.nickname}</strong>
            <small>{profile.compatibility.grade}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MatchMissingBanner({ onEdit }) {
  return (
    <button type="button" className="sm-banner" onClick={onEdit}>
      <span className="sm-banner__icon">☯</span>
      <span className="sm-banner__text">
        <strong>생년월일만 넣으면 모두와의 궁합이 보여요</strong>
        <small>이름과 생년월일은 공개되지 않아요 · 내 프로필 수정으로 가기</small>
      </span>
      <span className="sm-banner__chev">›</span>
    </button>
  );
}

const POSITION_COPY = {
  년주: "뿌리 자리 · 자란 배경이 비슷한지",
  월주: "줄기 자리 · 사회에서 굴러가는 방식",
  일주: "꽃 자리 · 나와 배우자, 궁합의 핵심",
  시주: "열매 자리 · 함께 갈 방향",
};

function PillarRow({ label, mine, theirs, active, onToggle }) {
  const canOpen = Boolean(mine && theirs);
  return (
    <button
      type="button"
      className={`sm-pillars__row${active ? " is-on" : ""}${canOpen ? "" : " sm-pillars__row--none"}`}
      onClick={canOpen ? onToggle : undefined}
      aria-pressed={active}
    >
      <span className={`sm-pillar${mine ? "" : " sm-pillar--none"}`}>{mine || "—"}</span>
      <span className="sm-pillars__label">{label}</span>
      <span className={`sm-pillar sm-pillar--theirs${theirs ? "" : " sm-pillar--none"}`}>{theirs || "—"}</span>
    </button>
  );
}

function PillarCompare({ label, mine, theirs }) {
  const a = pillarParts(mine);
  const b = pillarParts(theirs);
  if (!a || !b) return null;
  const relation = elementRelation(a.stemElement, b.stemElement);
  const sameBranch = a.branch === b.branch;
  return (
    <div className="sm-pillars__note">
      <strong>{label} · {POSITION_COPY[label]}</strong>
      <span>
        내 {a.stem}({a.stemElement}) ↔ 상대 {b.stem}({b.stemElement}) : {relation ? relation.label : "—"}
        {sameBranch ? ` · 지지가 같은 ${a.branch}(${a.animal})라 결이 닮았어요` : ""}
      </span>
    </div>
  );
}

/** 상세 화면의 궁합 리포트. */
export function MatchReport({ compatibility, mine, theirs, myNickname, nickname }) {
  const [activeRow, setActiveRow] = useState(null);
  if (!compatibility) return null;
  const tone = toneOf(compatibility.score);
  const relation = mine && theirs ? elementRelation(mine.dayMasterElement, theirs.dayMasterElement) : null;

  return (
    <section className={`sm-report sm-report--${tone}`}>
      <div className="sm-report__hero">
        <MatchRing score={compatibility.score} size={120} stroke={9} />
        <div className="sm-report__title">
          <span className={`sm-grade sm-grade--${tone} sm-grade--big`}>{compatibility.grade}</span>
          <strong>{compatibility.headline}</strong>
          <small>
            {myNickname || "나"} × {nickname}
          </small>
        </div>
      </div>

      {mine && theirs ? (
        <>
          <div className="sm-section">
            <h4>두 사람의 기운</h4>
            <div className="sm-elements">
              <div className={`sm-el sm-el--${mine.dayMasterElement}`}>
                <b>{mine.dayMaster}</b>
                <span>{mine.dayMasterElement} · {ELEMENT_WORD[mine.dayMasterElement]}</span>
                <small>{myNickname || "나"}</small>
              </div>
              <div className={`sm-elements__link sm-elements__link--${relation?.key || "same"}`}>
                <i />
                <span>{relation?.label}</span>
              </div>
              <div className={`sm-el sm-el--${theirs.dayMasterElement}`}>
                <b>{theirs.dayMaster}</b>
                <span>{theirs.dayMasterElement} · {ELEMENT_WORD[theirs.dayMasterElement]}</span>
                <small>{nickname}</small>
              </div>
            </div>
            {relation ? <p className="sm-section__copy">{relation.copy}</p> : null}
          </div>

          <div className="sm-section">
            <h4>사주 나란히</h4>
            <div className="sm-pillars">
              <div className="sm-pillars__names">
                <span>{myNickname || "나"}</span>
                <span />
                <span>{nickname}</span>
              </div>
              {[
                ["년주", mine.yearPillar, theirs.yearPillar],
                ["월주", mine.monthPillar, theirs.monthPillar],
                ["일주", mine.dayPillar, theirs.dayPillar],
                ["시주", mine.hourKnown ? mine.hourPillar : "", theirs.hourKnown ? theirs.hourPillar : ""],
              ].map(([label, a, b]) => (
                <PillarRow
                  key={label}
                  label={label}
                  mine={a}
                  theirs={b}
                  active={activeRow === label}
                  onToggle={() => setActiveRow((current) => (current === label ? null : label))}
                />
              ))}
            </div>
            {activeRow ? (
              <PillarCompare
                key={activeRow}
                label={activeRow}
                mine={activeRow === "년주" ? mine.yearPillar : activeRow === "월주" ? mine.monthPillar : activeRow === "일주" ? mine.dayPillar : mine.hourPillar}
                theirs={activeRow === "년주" ? theirs.yearPillar : activeRow === "월주" ? theirs.monthPillar : activeRow === "일주" ? theirs.dayPillar : theirs.hourPillar}
              />
            ) : (
              <p className="sm-section__copy">줄을 누르면 그 자리끼리 어떻게 맞는지 보여요. 일주(셋째 줄)가 배우자 자리라 점수에 가장 크게 들어가요. {mine.zodiac}띠와 {theirs.zodiac}띠.</p>
            )}
          </div>
        </>
      ) : null}

      <div className="sm-section">
        <h4>이렇게 봤어요</h4>
        <ul className="sm-reasons">
          {(compatibility.reasons || []).map((reason, index) => (
            <li key={reason} style={{ "--i": index }}>{reason}</li>
          ))}
        </ul>
      </div>

      {relation ? (
        <div className="sm-tip">
          <strong>축제에서 만난다면</strong>
          <p>{TIPS[relation.key]}</p>
        </div>
      ) : null}
    </section>
  );
}
