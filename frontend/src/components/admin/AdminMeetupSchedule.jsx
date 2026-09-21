// 운영진용 소개팅 부스 시간표. 그날 잡힌 15분 슬롯과 두 사람이 어디서 기다리는지.
// 스태프는 이걸 보고 약속 5분 전에 두 대기 장소로 데리러 간다. 30초마다 새로 받는다.
import { useCallback, useEffect, useState } from "react";
import { fetchAdminAiMatchMeetupSchedule } from "../../api";
import "../../styles/saju-meetup.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

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

function Person({ nickname, gender, place, phone }) {
  return (
    <div className="mu-admin__pair">
      <b>{nickname || "?"}</b>
      <span>{gender || ""}</span>
      <em>{place}</em>
      {phone ? <a href={`tel:${phone}`}>{phone}</a> : null}
    </div>
  );
}

export default function AdminMeetupSchedule() {
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

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

  const items = data?.items || [];
  const now = Date.now();
  // 아직 안 지난 첫 약속을 강조한다(15분 슬롯이 끝나기 전까지).
  const nextIndex = items.findIndex((item) => (parseLocal(item.slotAt)?.getTime() || 0) + 15 * 60_000 > now);
  const confirmedCount = items.filter((item) => item.confirmed).length;

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

      {error ? <p className="mu-admin__empty">{error}</p> : null}

      {items.length ? (
        <div className="mu-admin__list">
          {items.map((item, index) => (
            <article key={item.requestId} className={`mu-admin__row${index === nextIndex ? " mu-admin__row--next" : ""}`}>
              <span className="mu-admin__time">{timeLabel(item.slotAt)}</span>
              <div className="mu-admin__pairs">
                <span className={`mu-admin__state mu-admin__state--${item.confirmed ? "ok" : "hold"}`}>
                  {item.confirmed ? "확정" : `임시 · ${timeLabel(item.heldUntil)}까지 확정 대기`}
                </span>
                <Person
                  nickname={item.requesterNickname}
                  gender={item.requesterGender}
                  place={item.requesterWaitingPlace}
                  phone={item.requesterPhoneNumber}
                />
                <Person
                  nickname={item.profileNickname}
                  gender={item.profileGender}
                  place={item.profileWaitingPlace}
                  phone={item.profilePhoneNumber}
                />
              </div>
            </article>
          ))}
        </div>
      ) : !error ? (
        <p className="mu-admin__empty">이 날짜에 잡힌 약속이 아직 없습니다.</p>
      ) : null}
    </section>
  );
}
