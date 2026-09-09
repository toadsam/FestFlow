import "../styles/saju.css";

const ELEMENT_ORDER = ["목", "화", "토", "금", "수"];

function PillarBlock({ label, value }) {
  const known = Boolean(value);
  return (
    <div className={`saju-pillar${known ? "" : " saju-pillar--unknown"}`}>
      <span className="saju-pillar__label">{label}</span>
      <strong className="saju-pillar__value">{known ? value : "―"}</strong>
    </div>
  );
}

/** 한 사람의 사주. 프로필 상세와 내 프로필 양쪽에서 쓴다. */
export function SajuPanel({ saju, title = "사주", subtitle }) {
  if (!saju) return null;

  const counts = saju.elementCounts || {};
  const max = Math.max(1, ...ELEMENT_ORDER.map((name) => counts[name] || 0));

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
        <PillarBlock label="시주" value={saju.hourPillar} />
        <PillarBlock label="일주" value={saju.dayPillar} />
        <PillarBlock label="월주" value={saju.monthPillar} />
        <PillarBlock label="년주" value={saju.yearPillar} />
      </div>

      {!saju.hourKnown ? (
        <p className="saju-note">태어난 시간을 몰라 시주 없이 세 기둥으로 봤어요.</p>
      ) : null}

      <div className="saju-daymaster">
        <span>일간</span>
        <strong>
          {saju.dayMaster} <em>{saju.dayMasterElement}</em>
        </strong>
      </div>

      <div className="saju-elements">
        {ELEMENT_ORDER.map((name) => {
          const value = counts[name] || 0;
          return (
            <div key={name} className={`saju-element saju-element--${name}`}>
              <span className="saju-element__name">{name}</span>
              <div className="saju-element__bar">
                <i style={{ height: `${Math.round((value / max) * 100)}%` }} />
              </div>
              <span className="saju-element__count">{value}</span>
            </div>
          );
        })}
      </div>

      {saju.reading ? <p className="saju-reading">{saju.reading}</p> : null}
    </section>
  );
}

/** 나와 상대의 궁합 점수. */
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
