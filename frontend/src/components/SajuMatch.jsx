// 궁합을 "보는 느낌"으로. 목록 카드의 점수 링, 상단 TOP 3, 상세의 궁합 리포트(두 사주 나란히 + 오행 관계).
// 점수·등급·이유는 서버(SajuCompatibility)가 주고, 여기서는 그리기만 한다. 스타일은 styles/saju.css 의 sm-*.

const ELEMENTS = ["목", "화", "토", "금", "수"];
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
  return (
    <span className={`sm-ring sm-ring--${toneOf(safe)}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="sm-ring__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="sm-ring__fill"
          strokeWidth={stroke}
          strokeDasharray={`${(safe / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <strong style={{ fontSize: Math.round(size * 0.34) }}>{safe}</strong>
    </span>
  );
}

/** 목록 카드 안. 점수가 있으면 링 + 등급 + 한 줄, 없으면 이유를 짧게. */
export function MatchCardBlock({ compatibility, viewerHasSaju, targetHasSaju, onFixMine }) {
  if (compatibility) {
    const tone = toneOf(compatibility.score);
    return (
      <div className={`sm-card sm-card--${tone}`}>
        <MatchRing score={compatibility.score} />
        <div className="sm-card__body">
          <span className={`sm-grade sm-grade--${tone}`}>{compatibility.grade}</span>
          <p>{compatibility.headline}</p>
        </div>
      </div>
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

function PillarRow({ label, mine, theirs }) {
  return (
    <div className="sm-pillars__row">
      <span className={`sm-pillar${mine ? "" : " sm-pillar--none"}`}>{mine || "—"}</span>
      <span className="sm-pillars__label">{label}</span>
      <span className={`sm-pillar sm-pillar--theirs${theirs ? "" : " sm-pillar--none"}`}>{theirs || "—"}</span>
    </div>
  );
}

/** 상세 화면의 궁합 리포트. */
export function MatchReport({ compatibility, mine, theirs, myNickname, nickname }) {
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
              <PillarRow label="년주" mine={mine.yearPillar} theirs={theirs.yearPillar} />
              <PillarRow label="월주" mine={mine.monthPillar} theirs={theirs.monthPillar} />
              <PillarRow label="일주" mine={mine.dayPillar} theirs={theirs.dayPillar} />
              <PillarRow label="시주" mine={mine.hourKnown ? mine.hourPillar : ""} theirs={theirs.hourKnown ? theirs.hourPillar : ""} />
            </div>
            <p className="sm-section__copy">일주(가운데 줄)가 배우자 자리라 점수에 가장 크게 들어가요. {mine.zodiac}띠와 {theirs.zodiac}띠.</p>
          </div>
        </>
      ) : null}

      <div className="sm-section">
        <h4>이렇게 봤어요</h4>
        <ul className="sm-reasons">
          {(compatibility.reasons || []).map((reason) => (
            <li key={reason}>{reason}</li>
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
