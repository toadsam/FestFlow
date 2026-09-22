// 운영진용 소개팅 부스 시간표. 그날 잡힌 15분 슬롯과 두 사람이 어디서 기다리는지.
// 맨 위 '지금' 카드는 이 순간 부스에 있어야 할 쌍·다음 쌍·5분 뒤 대기 장소로 가야 할 사람을 보여 준다.
// 줄마다 도착 체크 · 만남 완료 · 노쇼(슬롯 반납)를 누를 수 있다. 30초마다 새로 받는다.
import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminAiMatchMeetupSchedule,
  markAdminAiMatchArrival,
  markAdminAiMatchMet,
  markAdminAiMatchNoShow,
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

function Person({ nickname, gender, place, phone, arrivedAt, onToggle, busy }) {
  const arrived = Boolean(arrivedAt);
  return (
    <div className={`mu-admin__pair${arrived ? " is-arrived" : ""}`}>
      <button
        type="button"
        className={`mu-admin__check${arrived ? " is-on" : ""}`}
        onClick={onToggle}
        disabled={busy}
        aria-pressed={arrived}
        title={arrived ? `${timeLabel(arrivedAt)} 도착 · 누르면 취소` : "도착하면 누르세요"}
      >
        {arrived ? "✓ 도착" : "도착"}
      </button>
      <b>{nickname || "?"}</b>
      <span>{gender || ""}</span>
      <em>{place}</em>
      {phone ? <a href={`tel:${phone}`}>{phone}</a> : null}
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
                    arrivedAt={item.requesterArrivedAt}
                    busy={busy || done}
                    onToggle={() => run(item.requestId, () => markAdminAiMatchArrival(item.requestId, "REQUESTER", !item.requesterArrivedAt))}
                  />
                  <Person
                    nickname={item.profileNickname}
                    gender={item.profileGender}
                    place={item.profileWaitingPlace}
                    phone={item.profilePhoneNumber}
                    arrivedAt={item.profileArrivedAt}
                    busy={busy || done}
                    onToggle={() => run(item.requestId, () => markAdminAiMatchArrival(item.requestId, "PROFILE", !item.profileArrivedAt))}
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
