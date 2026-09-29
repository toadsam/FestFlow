// 운영진용 소개팅 부스 시간표. 그날 잡힌 15분 슬롯과 두 사람이 어디서 기다리는지.
// 맨 위 '지금' 카드는 이 순간 부스에 있어야 할 쌍·다음 쌍·5분 뒤 대기 장소로 가야 할 사람을 보여 준다.
// 줄마다 도착 체크 · 만남 완료 · 노쇼(슬롯 반납)를 누를 수 있다. 30초마다 새로 받는다.
// '대기 장소' 명단: 성호관·중앙도서관 담당 스태프가 자기 장소 사람만 보고 도착 확인 → 출발하기 → 만났어요 → 부스 도착을 넘긴다.
// 넘긴 단계는 참가자 티켓의 단계 바(배달 앱처럼)에 그대로 보인다.
import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminAiMatchMeetupSchedule,
  markAdminAiMatchMet,
  markAdminAiMatchNoShow,
  setAdminAiMatchEscortStage,
} from "../../api";
import "../../styles/saju-meetup.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const SLOT_MS = 15 * 60_000;
const SOON_MS = 5 * 60_000;

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function parseLocal(value) {
  if (!value) return null;
  const [datePart, timePart = "00:00:00"] = `${value}`.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

function dateLabel(dateText) {
  const date = parseLocal(`${dateText}T00:00:00`);
  return date ? `${pad(date.getMonth() + 1)}.${pad(date.getDate())} (${WEEKDAYS[date.getDay()]})` : dateText;
}

function timeLabel(value) {
  const date = parseLocal(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

function minutesUntil(value, now) {
  const at = parseLocal(value)?.getTime();
  if (!at) return null;
  return Math.round((at - now) / 60_000);
}

const OUTCOME_LABELS = {
  MET: "만남 완료",
  NO_SHOW_REQUESTER: "신청자 노쇼",
  NO_SHOW_PROFILE: "상대 노쇼",
  NO_SHOW_BOTH: "둘 다 노쇼",
};

// 대기 장소 → 부스 안내 단계. next 는 스태프가 다음에 누를 버튼.
const ESCORT_STEPS = ["NONE", "ARRIVED", "DEPARTED", "PICKED_UP", "AT_BOOTH"];
const ESCORT_LABELS = {
  NONE: "아직 안 옴",
  ARRIVED: "대기 장소 도착",
  DEPARTED: "스태프 가는 중",
  PICKED_UP: "스태프와 이동 중",
  AT_BOOTH: "부스 도착",
};
const ESCORT_NEXT = {
  NONE: "도착 확인",
  ARRIVED: "출발하기",
  DEPARTED: "만났어요",
  PICKED_UP: "부스 도착",
};
const PLACE_TAB_KEY = "festflow.meetupPlaceTab";

function EscortControl({ stage = "NONE", stageAt, busy, onStage }) {
  const index = Math.max(0, ESCORT_STEPS.indexOf(stage));
  const next = ESCORT_STEPS[index + 1];
  return (
    <span className="mu-esc">
      <span className={`mu-esc__chip mu-esc__chip--${stage.toLowerCase()}`}>
        {ESCORT_LABELS[stage] || stage}
        {stageAt && stage !== "NONE" ? ` · ${timeLabel(stageAt)}` : ""}
      </span>
      {next ? (
        <button type="button" className="mu-esc__next" disabled={busy} onClick={() => onStage(next)}>
          {ESCORT_NEXT[stage]}
        </button>
      ) : null}
      {index > 0 ? (
        <button type="button" className="mu-esc__undo" disabled={busy} onClick={() => onStage(ESCORT_STEPS[index - 1])} title="한 단계 되돌리기">
          되돌리기
        </button>
      ) : null}
    </span>
  );
}

function Person({ nickname, gender, place, phone, stage, stageAt, onStage, busy }) {
  const arrived = stage && stage !== "NONE";
  return (
    <div className={`mu-admin__pair${arrived ? " is-arrived" : ""}`}>
      <b>{nickname || "?"}</b>
      <span>{gender || ""}</span>
      <em>{place}</em>
      {phone ? <a href={`tel:${phone}`}>{phone}</a> : null}
      <EscortControl stage={stage || "NONE"} stageAt={stageAt} busy={busy} onStage={onStage} />
    </div>
  );
}

// 대기 장소 담당 스태프용 명단. 아직 안 끝난 확정 약속에서 그 장소 사람들을 시간순으로.
function PlaceBoard({ items, now, busyId, onStage }) {
  const places = [...new Set(items.flatMap((item) => [item.requesterWaitingPlace, item.profileWaitingPlace]).filter(Boolean))].sort();
  const [tab, setTab] = useState(() => {
    try {
      return window.localStorage.getItem(PLACE_TAB_KEY) || "";
    } catch {
      return "";
    }
  });
  const place = places.includes(tab) ? tab : places[0] || "";
  function choose(next) {
    setTab(next);
    try {
      window.localStorage.setItem(PLACE_TAB_KEY, next);
    } catch {
      // 저장이 안 돼도 탭은 바뀐다.
    }
  }
  const people = items
    .filter((item) => item.confirmed && item.meetupOutcome !== "MET")
    .filter((item) => (parseLocal(item.slotAt)?.getTime() || 0) + SLOT_MS > now)
    .flatMap((item) => [
      { item, side: "REQUESTER", nickname: item.requesterNickname, phone: item.requesterPhoneNumber, place: item.requesterWaitingPlace, stage: item.requesterEscortStage, stageAt: item.requesterEscortStageAt },
      { item, side: "PROFILE", nickname: item.profileNickname, phone: item.profilePhoneNumber, place: item.profileWaitingPlace, stage: item.profileEscortStage, stageAt: item.profileEscortStageAt },
    ])
    .filter((person) => person.place === place && person.stage !== "AT_BOOTH")
    .slice(0, 12);
  if (!places.length) return null;
  return (
    <div className="mu-board" aria-label="대기 장소 명단">
      <div className="mu-board__head">
        <strong>대기 장소 명단</strong>
        <div className="mu-board__tabs" role="tablist">
          {places.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={item === place} className={item === place ? "is-on" : ""} onClick={() => choose(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      {people.length ? (
        <ul className="mu-board__list">
          {people.map((person) => {
            const mins = minutesUntil(person.item.slotAt, now);
            return (
              <li key={`${person.item.requestId}-${person.side}`} className={`mu-board__row mu-board__row--${(person.stage || "NONE").toLowerCase()}`}>
                <span className="mu-board__time">
                  <b>{timeLabel(person.item.slotAt)}</b>
                  <small>{mins > 0 ? `${mins}분 뒤` : mins > -15 ? "진행 중" : "지남"}</small>
                </span>
                <span className="mu-board__who">
                  <b>{person.nickname}</b>
                  {person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : null}
                </span>
                <EscortControl
                  stage={person.stage || "NONE"}
                  stageAt={person.stageAt}
                  busy={busyId === person.item.requestId}
                  onStage={(stage) => onStage(person.item.requestId, person.side, stage)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mu-admin__empty">{place}에서 기다릴 사람이 지금은 없어요.</p>
      )}
    </div>
  );
}

function NowCard({ items, now }) {
  const current = items.find((item) => {
    const at = parseLocal(item.slotAt)?.getTime() || 0;
    return at <= now && now < at + SLOT_MS && item.meetupOutcome !== "MET";
  });
  const next = items.find((item) => (parseLocal(item.slotAt)?.getTime() || 0) > now);
  const soon = next && (parseLocal(next.slotAt)?.getTime() || 0) - now <= SOON_MS ? next : null;

  return (
    <div className="mu-now" aria-label="지금 부스 상황">
      <div className={`mu-now__cell${current ? " is-live" : ""}`}>
        <small>지금 부스</small>
        {current ? (
          <>
            <strong>
              {current.requesterNickname} · {current.profileNickname}
            </strong>
            <span>
              {timeLabel(current.slotAt)} 시작 · {Math.max(0, 15 - Math.floor((now - (parseLocal(current.slotAt)?.getTime() || now)) / 60_000))}분 남음
              {current.requesterArrivedAt && current.profileArrivedAt ? " · 둘 다 도착" : current.requesterArrivedAt || current.profileArrivedAt ? " · 한 명 도착" : " · 아직 아무도 안 옴"}
            </span>
          </>
        ) : (
          <>
            <strong>비어 있어요</strong>
            <span>이 시간에 잡힌 쌍이 없어요</span>
          </>
        )}
      </div>
      <div className={`mu-now__cell${soon ? " is-soon" : ""}`}>
        <small>{soon ? "곧 대기 장소로" : "다음 쌍"}</small>
        {next ? (
          <>
            <strong>
              {next.requesterNickname} · {next.profileNickname}
            </strong>
            <span>
              {timeLabel(next.slotAt)} · {minutesUntil(next.slotAt, now)}분 뒤
              {soon ? ` · ${next.requesterWaitingPlace} / ${next.profileWaitingPlace} 확인` : ""}
            </span>
          </>
        ) : (
          <>
            <strong>없어요</strong>
            <span>오늘 남은 약속이 없어요</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminMeetupSchedule({ onChanged }) {
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [noShowId, setNoShowId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback((nextDate) => {
    return fetchAdminAiMatchMeetupSchedule(nextDate)
      .then((response) => {
        setData(response);
        setDate(response.date);
        setError("");
      })
      .catch((loadError) => setError(loadError.message || "시간표를 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    if (!date) return undefined;
    const id = window.setInterval(() => load(date), 30_000);
    return () => window.clearInterval(id);
  }, [date, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  async function run(requestId, task) {
    setBusyId(requestId);
    try {
      await task();
      await load(date);
      onChanged?.();
    } catch (actionError) {
      setError(actionError.message || "처리하지 못했습니다.");
    } finally {
      setBusyId(null);
      setNoShowId(null);
    }
  }

  const items = data?.items || [];
  // 아직 안 지난 첫 약속을 강조한다(15분 슬롯이 끝나기 전까지).
  const nextIndex = items.findIndex((item) => (parseLocal(item.slotAt)?.getTime() || 0) + SLOT_MS > now);
  const confirmedCount = items.filter((item) => item.confirmed).length;
  const isToday = date && parseLocal(`${date}T00:00:00`)?.toDateString() === new Date(now).toDateString();

  return (
    <section className="mu-admin" aria-label="소개팅 부스 시간표">
      <div className="mu-admin__head">
        <div>
          <h2>소개팅 부스 시간표</h2>
          <small>
            {data ? `${data.boothName} · 확정 ${confirmedCount}쌍 · 임시 ${items.length - confirmedCount}쌍 · 전체 ${data.totalSlots}칸` : "불러오는 중…"}
          </small>
        </div>
        <div className="mu-admin__tabs" role="tablist" aria-label="날짜">
          {(data?.dates || []).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === date}
              className={`mu-admin__tab${item === date ? " is-on" : ""}`}
              onClick={() => load(item)}
            >
              {dateLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {isToday || !data ? <NowCard items={items} now={now} /> : null}

      <PlaceBoard
        items={items}
        now={now}
        busyId={busyId}
        onStage={(requestId, side, stage) => run(requestId, () => setAdminAiMatchEscortStage(requestId, side, stage))}
      />

      {error ? <p className="mu-admin__empty">{error}</p> : null}

      {items.length ? (
        <div className="mu-admin__list">
          {items.map((item, index) => {
            const busy = busyId === item.requestId;
            const bothArrived = Boolean(item.requesterArrivedAt && item.profileArrivedAt);
            const done = item.meetupOutcome === "MET";
            return (
              <article
                key={item.requestId}
                className={`mu-admin__row${index === nextIndex ? " mu-admin__row--next" : ""}${done ? " mu-admin__row--done" : ""}`}
              >
                <span className="mu-admin__time">{timeLabel(item.slotAt)}</span>
                <div className="mu-admin__pairs">
                  <span className={`mu-admin__state mu-admin__state--${done ? "done" : item.confirmed ? "ok" : "hold"}`}>
                    {done ? "만남 완료" : item.confirmed ? "확정" : `임시 · ${timeLabel(item.heldUntil)}까지 확정 대기`}
                  </span>
                  <Person
                    nickname={item.requesterNickname}
                    gender={item.requesterGender}
                    place={item.requesterWaitingPlace}
                    phone={item.requesterPhoneNumber}
                    stage={item.requesterEscortStage}
                    stageAt={item.requesterEscortStageAt}
                    busy={busy || done}
                    onStage={(stage) => run(item.requestId, () => setAdminAiMatchEscortStage(item.requestId, "REQUESTER", stage))}
                  />
                  <Person
                    nickname={item.profileNickname}
                    gender={item.profileGender}
                    place={item.profileWaitingPlace}
                    phone={item.profilePhoneNumber}
                    stage={item.profileEscortStage}
                    stageAt={item.profileEscortStageAt}
                    busy={busy || done}
                    onStage={(stage) => run(item.requestId, () => setAdminAiMatchEscortStage(item.requestId, "PROFILE", stage))}
                  />
                  {!done ? (
                    <div className="mu-admin__actions">
                      <button
                        type="button"
                        className={`mu-admin__btn mu-admin__btn--met${bothArrived ? " is-ready" : ""}`}
                        disabled={busy}
                        onClick={() => run(item.requestId, () => markAdminAiMatchMet(item.requestId))}
                      >
                        만남 완료
                      </button>
                      {noShowId === item.requestId ? (
                        <span className="mu-admin__noshow">
                          <small>누가 안 왔나요?</small>
                          {[
                            ["REQUESTER", item.requesterNickname],
                            ["PROFILE", item.profileNickname],
                            ["BOTH", "둘 다"],
                          ].map(([side, label]) => (
                            <button
                              key={side}
                              type="button"
                              className="mu-admin__btn mu-admin__btn--danger"
                              disabled={busy}
                              onClick={() => run(item.requestId, () => markAdminAiMatchNoShow(item.requestId, side))}
                            >
                              {label}
                            </button>
                          ))}
                          <button type="button" className="mu-admin__btn" onClick={() => setNoShowId(null)}>
                            취소
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="mu-admin__btn mu-admin__btn--ghost"
                          disabled={busy}
                          onClick={() => setNoShowId(item.requestId)}
                        >
                          노쇼 · 슬롯 반납
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : !error ? (
        <p className="mu-admin__empty">이 날짜에 잡힌 약속이 아직 없습니다.</p>
      ) : null}
    </section>
  );
}

export { OUTCOME_LABELS };
