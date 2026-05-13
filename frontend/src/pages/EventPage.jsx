import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createEventStream, fetchEvents } from "../api";
import { IconCalendar, IconMusic } from "../components/UxIcons";
import { FESTIVAL_IMAGE, fallbackEvents, formatTime } from "../data/festivalUiData";

const REMINDER_KEY = "festflow_event_reminders";

function readReminders() {
  try {
    return new Set(JSON.parse(localStorage.getItem(REMINDER_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveReminders(next) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify([...next]));
}

function dateKey(value) {
  return value ? String(value).slice(0, 10) : "all";
}

function dateLabel(value) {
  if (!value) return "전체";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(5, 10);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} (${weekdays[date.getDay()]})`;
}

function eventStatus(event) {
  return event.statusOverride || event.status || "예정";
}

export default function EventPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState("today");
  const [reminders, setReminders] = useState(() => readReminders());
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchEvents()
      .then((data) => {
        if (mounted) setEvents(data || []);
      })
      .catch((error) => {
        if (mounted) setMessage(error.message);
      });

    let stream = null;
    try {
      stream = createEventStream();
      stream.addEventListener("events", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setEvents(next);
        } catch {
          // Ignore malformed live payloads.
        }
      });
    } catch {
      // Streaming is optional.
    }

    return () => {
      mounted = false;
      stream?.close();
    };
  }, []);

  const source = events.length ? events : fallbackEvents;

  const sortedEvents = useMemo(() => {
    return [...source].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }, [source]);

  const dateOptions = useMemo(() => {
    const keys = [...new Set(sortedEvents.map((event) => dateKey(event.startTime)))];
    return keys.map((key, index) => ({
      key: index === 0 ? "today" : key,
      originalKey: key,
      label: index === 0 ? "오늘" : dateLabel(key),
    }));
  }, [sortedEvents]);

  const activeOriginalDate = selectedDate === "today" ? dateOptions[0]?.originalKey : selectedDate;

  const visibleEvents = useMemo(() => {
    if (selectedDate === "all") return sortedEvents;
    return sortedEvents.filter((event) => dateKey(event.startTime) === activeOriginalDate);
  }, [activeOriginalDate, selectedDate, sortedEvents]);

  function toggleReminder(eventId) {
    const key = String(eventId);
    const next = new Set(reminders);
    if (next.has(key)) {
      next.delete(key);
      setMessage("공연 알림을 해제했습니다.");
    } else {
      next.add(key);
      setMessage("공연 알림을 저장했습니다.");
    }
    setReminders(next);
    saveReminders(next);
  }

  const heroEvent = visibleEvents[0] || sortedEvents[0];

  return (
    <section className="uni-page event-page">
      <header className="plain-page-header">
        <span />
        <h1>공연</h1>
        <button type="button" aria-label="전체 라인업" onClick={() => navigate("/events/lineup")}>
          <IconCalendar className="h-5 w-5" />
        </button>
      </header>

      <div className="uni-tabs uni-tabs--scroll">
        {dateOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={selectedDate === option.key ? "uni-tab uni-tab--active" : "uni-tab"}
            onClick={() => setSelectedDate(option.key)}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className={selectedDate === "all" ? "uni-tab uni-tab--active" : "uni-tab"}
          onClick={() => setSelectedDate("all")}
        >
          전체 일정
        </button>
      </div>

      <section
        className="lineup-hero-card event-spotlight-card"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7,26,61,0.18), rgba(7,26,61,0.86)), url(${heroEvent?.imageUrl || FESTIVAL_IMAGE})`,
        }}
      >
        <span>{eventStatus(heroEvent)}</span>
        <strong>{heroEvent?.title || "TODAY LINE UP"}</strong>
        <small>{heroEvent ? `${formatTime(heroEvent.startTime)} · ${heroEvent.artist || "메인 스테이지"}` : "공연 정보를 준비 중입니다."}</small>
      </section>

      {message && <p className="app-inline-note">{message}</p>}

      <section className="uni-section">
        <h2 className="event-date-title">{selectedDate === "all" ? "전체 공연" : dateLabel(activeOriginalDate)} 공연</h2>
        <div className="event-list-card">
          {visibleEvents.map((event, index) => {
            const active = eventStatus(event) === "진행중" || eventStatus(event) === "곧 시작";
            const eventId = event.id || `${event.title}-${index}`;
            const reminded = reminders.has(String(eventId));
            return (
              <article
                key={eventId}
                className={active ? "event-row event-row--active" : "event-row"}
              >
                <span className="event-row-time">
                  <strong>{formatTime(event.startTime)}</strong>
                  <small>{formatTime(event.endTime)}</small>
                </span>
                <span
                  className="event-row-thumb"
                  style={{ backgroundImage: `url(${event.imageUrl || FESTIVAL_IMAGE})` }}
                />
                <span className="event-row-main">
                  <strong>{event.title}</strong>
                  <small>{event.artist || event.locationName || "메인 스테이지"}</small>
                  {event.liveMessage && <em>{event.liveMessage}</em>}
                </span>
                <button
                  type="button"
                  className={reminded ? "icon-chip icon-chip--active" : "icon-chip"}
                  aria-label="공연 알림 저장"
                  onClick={() => toggleReminder(eventId)}
                >
                  <IconMusic className="h-4 w-4" />
                </button>
              </article>
            );
          })}
          {visibleEvents.length === 0 && (
            <p className="empty-copy">선택한 날짜의 공연이 아직 등록되지 않았습니다.</p>
          )}
        </div>
      </section>

      <button
        type="button"
        className="secondary-wide-button"
        onClick={() => navigate("/events/lineup")}
      >
        전체 라인업 보기
      </button>
    </section>
  );
}
