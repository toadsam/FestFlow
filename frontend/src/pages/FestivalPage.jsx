// 축제 살펴보기. 바람 축제의 첫 화면. 일정·공지·오늘 공연·주점 몇 개를 한 번에 보여 준다.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createBoothStream,
  createEventStream,
  createNoticeStream,
  fetchActiveNotices,
  fetchBooths,
  fetchEvents,
} from "../api";
import { IconBox, IconChevronRight, IconClock } from "../components/UxIcons";
import { Brand, CountUp, HeroReeds, IconBeer, IconHeartSaju } from "../components/v2/V2Kit";
import { resolveBoothImageUrl } from "../config/boothImages";
import { fallbackBooths, fallbackEvents } from "../data/festivalUiData";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function toDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDay(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY[date.getDay()]})`;
}

function formatRange(start, end) {
  if (!start) return "";
  if (!end || dayKey(start) === dayKey(end)) return formatDay(start);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getDate()}일`;
  }
  return `${formatDay(start)} ~ ${formatDay(end)}`;
}

function eventState(event, now) {
  const start = toDate(event.startTime);
  const end = toDate(event.endTime);
  if (!start) return "upcoming";
  if (end && end < now) return "done";
  if (start <= now && (!end || end >= now)) return "live";
  return "upcoming";
}

function waitLabel(booth) {
  const value = Number(booth?.estimatedWaitMinutes);
  if (!Number.isFinite(value)) return "대기 확인 중";
  if (value <= 0) return "바로 입장";
  return `대기 ${value}분`;
}

export default function FestivalPage() {
  const navigate = useNavigate();
  const [booths, setBooths] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openNoticeId, setOpenNoticeId] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([fetchBooths(), fetchEvents(), fetchActiveNotices()]).then(
      ([boothResult, eventResult, noticeResult]) => {
        if (!mounted) return;
        if (boothResult.status === "fulfilled" && Array.isArray(boothResult.value)) setBooths(boothResult.value);
        if (eventResult.status === "fulfilled" && Array.isArray(eventResult.value)) setEvents(eventResult.value);
        if (noticeResult.status === "fulfilled" && Array.isArray(noticeResult.value)) setNotices(noticeResult.value);
        setLoaded(true);
      },
    );

    const streams = [];
    const subscribe = (factory, name, setter) => {
      try {
        const stream = factory();
        stream.addEventListener(name, (event) => {
          try {
            const next = JSON.parse(event.data);
            if (Array.isArray(next)) setter(next);
          } catch {
            // 잘못된 페이로드는 무시한다.
          }
        });
        streams.push(stream);
      } catch {
        // 스트림은 없어도 화면은 뜬다.
      }
    };
    subscribe(createBoothStream, "booths", setBooths);
    subscribe(createEventStream, "events", setEvents);
    subscribe(createNoticeStream, "notices", setNotices);

    const clock = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      mounted = false;
      streams.forEach((stream) => stream.close());
      window.clearInterval(clock);
    };
  }, []);

  const boothSource = booths.length ? booths : fallbackBooths;
  const eventSource = events.length ? events : fallbackEvents;

  const schedule = useMemo(() => {
    const dated = eventSource
      .map((event) => ({ ...event, start: toDate(event.startTime), end: toDate(event.endTime) }))
      .filter((event) => event.start)
      .sort((a, b) => a.start - b.start);
    if (!dated.length) return { first: null, last: null, dayLabel: "", items: [], dayCount: 0 };

    const first = dated[0].start;
    const last = dated[dated.length - 1].end || dated[dated.length - 1].start;
    const days = [...new Set(dated.map((event) => dayKey(event.start)))];
    const today = dayKey(now);
    let targetDay = days.includes(today) ? today : days.find((day) => day > today) || days[days.length - 1];
    const items = dated.filter((event) => dayKey(event.start) === targetDay);
    const dayLabel = targetDay === today ? "오늘" : formatDay(items[0].start);
    return { first, last, dayLabel, items, dayCount: days.length };
  }, [eventSource, now]);

  const liveCount = schedule.items.filter((event) => eventState(event, now) === "live").length;
  const dday = useMemo(() => {
    if (!schedule.first) return null;
    const startDay = new Date(schedule.first);
    startDay.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Math.round((startDay - today) / 86400000);
  }, [schedule.first, now]);

  const featuredBooths = useMemo(
    () =>
      [...boothSource]
        .sort((a, b) => (Number(a.estimatedWaitMinutes) || 0) - (Number(b.estimatedWaitMinutes) || 0))
        .slice(0, 3),
    [boothSource],
  );

  const activeNotices = notices.filter((notice) => notice.active !== false).slice(0, 3);

  let ddayLabel = "축제 진행 중";
  if (dday === null) ddayLabel = "일정 준비 중";
  else if (dday > 0) ddayLabel = `D-${dday}`;
  else if (dday === 0) ddayLabel = "오늘 시작";
  else if (schedule.last && schedule.last < now) ddayLabel = "축제 종료";

  return (
    <section className="v2-page" data-i18n-skip>
      <header className="v2-hero">
        <div className="v2-hero__sky" aria-hidden="true" />
        <HeroReeds height={130} />
        <div className="v2-hero__top">
          <Brand />
          <span className="v2-badge v2-badge--blue">{ddayLabel}</span>
        </div>
        <div className="v2-hero__body">
          <span className="v2-hero__eyebrow v2-rise" style={{ "--i": 0 }}>
            아주대학교 축제
          </span>
          <h1 className="v2-rise" style={{ "--i": 1 }}>
            바람 부는 캠퍼스,
            <br />
            <em>오늘은 어디로 갈까요?</em>
          </h1>
          <p className="v2-rise" style={{ "--i": 2 }}>
            {schedule.first ? formatRange(schedule.first, schedule.last) : "일정은 곧 공개돼요"}
            {schedule.dayCount > 1 ? ` · ${schedule.dayCount}일간` : ""}
          </p>
        </div>
        <div className="v2-hero__stats">
          <div className="v2-stat v2-rise" style={{ "--i": 3 }}>
            <small>운영 부스</small>
            <strong>
              <CountUp value={boothSource.length} suffix="곳" />
            </strong>
          </div>
          <div className="v2-stat v2-rise" style={{ "--i": 4 }}>
            <small>{schedule.dayLabel || "오늘"} 공연</small>
            <strong>
              <CountUp value={schedule.items.length} suffix="개" />
            </strong>
          </div>
          <div className="v2-stat v2-rise" style={{ "--i": 5 }}>
            <small>지금 진행 중</small>
            <strong>
              <CountUp value={liveCount} suffix="개" />
            </strong>
          </div>
        </div>
      </header>

      <nav className="v2-quick v2-section" aria-label="바로가기">
        <Link to="/booths" className="v2-quick__item v2-rise" style={{ "--i": 4 }}>
          <span>
            <IconBeer />
          </span>
          주점 보기
        </Link>
        <Link to="/ai-match" className="v2-quick__item v2-rise" style={{ "--i": 5 }}>
          <span>
            <IconHeartSaju />
          </span>
          사주 소개팅
        </Link>
        <Link to="/lost-found" className="v2-quick__item v2-rise" style={{ "--i": 6 }}>
          <span>
            <IconBox />
          </span>
          분실물
        </Link>
      </nav>

      {activeNotices.length > 0 && (
        <section className="v2-section">
          <div className="v2-section__head">
            <h2>공지</h2>
            <span>{activeNotices.length}건</span>
          </div>
          {activeNotices.map((notice, index) => {
            const open = openNoticeId === notice.id;
            return (
              <button
                key={notice.id}
                type="button"
                className={`v2-notice v2-card--press v2-rise${open ? " v2-notice--open" : ""}`}
                style={{ "--i": index + 6, border: 0, width: "100%", textAlign: "left" }}
                onClick={() => setOpenNoticeId(open ? null : notice.id)}
              >
                <span className="v2-notice__tag">{notice.category || "안내"}</span>
                <div className="v2-notice__body">
                  <strong>{notice.title}</strong>
                  {notice.content ? <p>{notice.content}</p> : null}
                </div>
              </button>
            );
          })}
        </section>
      )}

      <section className="v2-section">
        <div className="v2-section__head">
          <h2>{schedule.dayLabel ? `${schedule.dayLabel} 공연` : "공연"}</h2>
          {liveCount > 0 ? <span className="v2-badge v2-badge--blue v2-badge--live">진행 중</span> : null}
        </div>
        {!loaded && !schedule.items.length ? (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            <div className="v2-skeleton" style={{ height: "3.2rem" }} />
            <div className="v2-skeleton" style={{ height: "3.2rem" }} />
          </div>
        ) : schedule.items.length ? (
          <div className="v2-timeline">
            {schedule.items.map((event, index) => {
              const state = eventState(event, now);
              return (
                <div
                  key={event.id || `${event.title}-${index}`}
                  className={`v2-timeline__item v2-rise v2-timeline__item--${state}`}
                  style={{ "--i": index + 7 }}
                >
                  <span className="v2-timeline__time">{formatClock(event.start)}</span>
                  <div className="v2-timeline__body">
                    <strong>{event.title}</strong>
                    <small>
                      {event.end ? `${formatClock(event.start)} ~ ${formatClock(event.end)}` : "시간 확인 중"}
                      {event.artist ? ` · ${event.artist}` : ""}
                      {event.liveMessage ? ` · ${event.liveMessage}` : ""}
                      {Number(event.delayMinutes) > 0 ? ` · ${event.delayMinutes}분 지연` : ""}
                    </small>
                  </div>
                  {state === "live" ? <span className="v2-badge v2-badge--blue">LIVE</span> : null}
                  {state === "done" ? <span className="v2-badge">종료</span> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="v2-empty">
            <span className="v2-empty__icon">
              <IconClock />
            </span>
            <strong>공연 일정이 아직 없어요</strong>
            <p>일정이 올라오면 여기서 바로 보여드릴게요.</p>
          </div>
        )}
      </section>

      <div className="v2-divider--thick" />

      <section className="v2-section" style={{ marginTop: 0 }}>
        <div className="v2-section__head">
          <h2>대기 짧은 주점</h2>
          <button type="button" onClick={() => navigate("/booths")}>
            전체 보기
          </button>
        </div>
        <div className="v2-booth-list">
          {featuredBooths.map((booth, index) => {
            const wait = Number(booth.estimatedWaitMinutes) || 0;
            return (
              <Link
                key={booth.id}
                to={`/booths/${booth.id}`}
                className="v2-booth v2-rise"
                style={{ "--i": index + 8 }}
              >
                <span className="v2-booth__thumb">
                  <img src={resolveBoothImageUrl(booth)} alt="" loading="lazy" />
                </span>
                <span className="v2-booth__body">
                  <strong>{booth.name}</strong>
                  <p>{booth.description || booth.boothIntro || booth.category || "축제 부스"}</p>
                  <span className="v2-booth__meta">
                    <em className={wait >= 30 ? "is-busy" : ""}>{waitLabel(booth)}</em>
                    {booth.category ? <span>{booth.category}</span> : null}
                  </span>
                </span>
                <span className="v2-row__trail">
                  <IconChevronRight />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </section>
  );
}
