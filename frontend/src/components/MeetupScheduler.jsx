// 매칭된 두 사람이 소개팅 부스 시간을 잡는 곳.
// 15분 슬롯(09:00~21:45), 슬롯 하나에 한 쌍. 한 명이 고르면 30분 임시 잠금 → 상대가 확정하면 굳는다.
// 블라인드 만남이라 두 사람은 서로 다른 대기 장소로 가고, 스태프가 부스로 데려온다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAiMatchMeetupSlots } from "../api";
import "../styles/saju-meetup.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function parseLocal(value) {
  // 서버는 "2026-10-07T14:15:00" 처럼 시간대 없는 한국 시간을 준다.
  if (!value) return null;
  const [datePart, timePart = "00:00:00"] = `${value}`.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function dateLabel(dateText) {
  const date = parseLocal(`${dateText}T00:00:00`);
  if (!date) return dateText;
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} (${WEEKDAYS[date.getDay()]})`;
}

function timeLabel(value) {
  const date = parseLocal(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

function fullLabel(value) {
  if (!value) return "";
  return `${dateLabel(`${value}`.split("T")[0])} ${timeLabel(value)}`;
}

function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  const target = parseLocal(until)?.getTime();
  if (!target) return "";
  const left = Math.max(0, Math.floor((target - now) / 1000));
  return `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
}

function SlotPicker({ requestId, currentSlot, busy, onPick, onClose }) {
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (nextDate) => {
      setLoading(true);
      return fetchAiMatchMeetupSlots(nextDate, requestId)
        .then((response) => {
          setData(response);
          setDate(response.date);
          setError("");
        })
        .catch((loadError) => setError(loadError.message || "시간표를 불러오지 못했어요."))
        .finally(() => setLoading(false));
    },
    [requestId],
  );

  useEffect(() => {
    load(currentSlot ? `${currentSlot}`.split("T")[0] : "");
  }, [load, currentSlot]);

  // 다른 커플이 계속 잡으니 열려 있는 동안 20초마다 새로 받는다.
  useEffect(() => {
    if (!date) return undefined;
    const id = window.setInterval(() => load(date), 20_000);
    return () => window.clearInterval(id);
  }, [date, load]);

  const hours = useMemo(() => {
    const groups = new Map();
    (data?.slots || []).forEach((slot) => {
      const hour = parseLocal(slot.startAt)?.getHours();
      if (!groups.has(hour)) groups.set(hour, []);
      groups.get(hour).push(slot);
    });
    return [...groups.entries()];
  }, [data]);

  const freeCount = (data?.slots || []).filter((slot) => slot.status === "FREE").length;

  async function submit() {
    if (!selected) return;
    const result = await onPick(selected);
    if (result?.ok) {
      onClose();
      return;
    }
    setError(result?.message || "시간을 잡지 못했어요. 다시 골라 주세요.");
    setSelected("");
    load(date);
  }

  return (
    <div className="mu-picker">
      <div className="mu-picker__head">
        <strong>만날 시간 고르기</strong>
        <button type="button" className="mu-link" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="mu-dates" role="tablist" aria-label="날짜">
        {(data?.dates || []).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === date}
            className={`mu-date${item === date ? " is-on" : ""}`}
            onClick={() => {
              setSelected("");
              load(item);
            }}
          >
            {dateLabel(item)}
          </button>
        ))}
      </div>

      <div className="mu-legend">
        <span className="mu-legend__free">고를 수 있어요</span>
        <span className="mu-legend__taken">다른 커플</span>
        <span className="mu-legend__past">지난 시간</span>
        <b className="mu-legend__count">{loading ? "불러오는 중…" : `${freeCount}칸 남음`}</b>
      </div>

      <div className="mu-hours">
        {hours.map(([hour, slots]) => (
          <div key={hour} className="mu-hour">
            <span className="mu-hour__label">{pad(hour)}시</span>
            <div className="mu-hour__slots">
              {slots.map((slot) => {
                const free = slot.status === "FREE" || slot.mine;
                const label = `:${pad(parseLocal(slot.startAt)?.getMinutes())}`;
                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    className={`mu-slot mu-slot--${slot.status.toLowerCase()}${slot.mine ? " mu-slot--mine" : ""}${selected === slot.startAt ? " is-on" : ""}`}
                    disabled={!free || busy}
                    aria-pressed={selected === slot.startAt}
                    aria-label={`${pad(hour)}시 ${label.slice(1)}분 ${free ? "선택 가능" : slot.status === "PAST" ? "지난 시간" : "다른 커플이 잡음"}`}
                    onClick={() => setSelected(slot.startAt)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="mu-error">{error}</p> : null}

      <div className="mu-picker__foot">
        <p>
          고르면 <b>{data?.holdMinutes || 30}분 동안</b> 이 시간이 우리 몫으로 잠겨요. 그 안에 상대가 확정하면 끝!
        </p>
        <button type="button" className="mu-primary" disabled={!selected || busy} onClick={submit}>
          {selected ? `${fullLabel(selected)} 로 제안하기` : "시간을 골라 주세요"}
        </button>
      </div>
    </div>
  );
}

export default function MeetupScheduler({ request, myProfileId, busy, onPropose, onConfirm, onCancel, onOpenMap }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const countdown = useCountdown(request.status === "PROPOSED" ? request.meetupHeldUntil : "");

  const iAmRequester = request.requesterProfileId === myProfileId;
  const myPlace = iAmRequester ? request.requesterWaitingPlace : request.profileWaitingPlace;
  const partner = iAmRequester ? request.profileNickname : request.requesterNickname;
  const iProposed = request.meetupProposerProfileId === myProfileId;

  if (!["ACCEPTED", "PROPOSED", "CONFIRMED"].includes(request.status)) return null;

  const picker = pickerOpen ? (
    <SlotPicker
      requestId={request.id}
      currentSlot={request.meetupAt}
      busy={busy}
      onPick={(slotAt) => onPropose(request, slotAt)}
      onClose={() => setPickerOpen(false)}
    />
  ) : null;

  if (request.status === "CONFIRMED") {
    return (
      <div className="mu mu--confirmed">
        <div className="mu-ticket">
          <span className="mu-ticket__eyebrow">약속 확정 · 블라인드 소개팅</span>
          <strong className="mu-ticket__time">{fullLabel(request.meetupAt)}</strong>
          <div className="mu-ticket__rows">
            <div>
              <small>내가 기다릴 곳</small>
              <b>{myPlace}</b>
            </div>
            <div>
              <small>만나는 곳</small>
              <b>{request.meetupPlace || "총학생회 소개팅 부스"}</b>
            </div>
          </div>
          <ul className="mu-ticket__rules">
            <li>약속 5분 전까지 <b>{myPlace}</b>(으)로 와 주세요. {partner} 님은 다른 곳에서 기다려요.</li>
            <li>스태프가 닉네임을 확인하고 부스로 안내해요.</li>
            <li>부스에서는 얼굴을 가린 채로 먼저 이야기를 나눠요.</li>
          </ul>
          <div className="mu-ticket__actions">
            <button type="button" className="mu-ghost" onClick={onOpenMap}>
              부스 길찾기
            </button>
            <button type="button" className="mu-link mu-link--danger" disabled={busy} onClick={() => onCancel(request.id)}>
              약속 취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (request.status === "PROPOSED") {
    return (
      <div className="mu mu--proposed">
        <div className="mu-head">
          <span className="mu-head__badge">{iProposed ? "상대 확정 대기" : "시간 제안 도착"}</span>
          {countdown ? <span className="mu-head__timer">⏳ {countdown}</span> : null}
        </div>
        <strong className="mu-time">{fullLabel(request.meetupAt)}</strong>
        <p className="mu-copy">
          {iProposed
            ? `${partner} 님이 확정하면 약속이 굳어요. 시간이 다 되면 이 자리는 다시 풀려요.`
            : `${partner} 님이 이 시간을 제안했어요. 괜찮으면 확정해 주세요.`}
        </p>
        {!pickerOpen ? (
          <div className="mu-actions">
            {!iProposed ? (
              <button type="button" className="mu-primary" disabled={busy} onClick={() => onConfirm(request.id)}>
                이 시간으로 확정
              </button>
            ) : null}
            <button type="button" className="mu-ghost" disabled={busy} onClick={() => setPickerOpen(true)}>
              {iProposed ? "시간 바꾸기" : "다른 시간 제안"}
            </button>
            <button type="button" className="mu-link mu-link--danger" disabled={busy} onClick={() => onCancel(request.id)}>
              {iProposed ? "제안 취소" : "거절"}
            </button>
          </div>
        ) : null}
        {picker}
      </div>
    );
  }

  return (
    <div className="mu mu--accepted">
      <div className="mu-head">
        <span className="mu-head__badge mu-head__badge--gold">매치 성사</span>
      </div>
      <strong className="mu-title">이제 만날 시간을 정해요</strong>
      <p className="mu-copy">
        소개팅 부스는 15분에 한 쌍만 받아요. 빈 시간을 골라 제안하면 {partner} 님이 확정해요.
      </p>
      {!pickerOpen ? (
        <button type="button" className="mu-primary" disabled={busy} onClick={() => setPickerOpen(true)}>
          만날 시간 고르기
        </button>
      ) : null}
      {picker}
    </div>
  );
}
