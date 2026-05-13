import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createEventStream, fetchEvents } from "../api";
import { IconArrowLeft, IconMusic } from "../components/UxIcons";
import { FESTIVAL_IMAGE, fallbackEvents, formatTime } from "../data/festivalUiData";

function dateKey(value) {
  return value ? String(value).slice(0, 10) : "all";
}

function shortDate(value) {
  if (!value) return "전체";
  return String(value).slice(5, 10).replace("-", ".");
}

export default function LineupPage() {
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState("all");

  useEffect(() => {
    let mounted = true;
    fetchEvents()
      .then((data) => {
        if (mounted) setEvents(data || []);
      })
      .catch(() => {
        if (mounted) setEvents([]);
      });

    let stream = null;
    try {
      stream = createEventStream();
      stream.addEventListener("events", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setEvents(next);
        } catch {
          // Ignore malformed stream payloads.
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
  const sortedEvents = useMemo(
    () => [...source].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [source],
  );
  const dateOptions = useMemo(
    () => [...new Set(sortedEvents.map((event) => dateKey(event.startTime)))],
    [sortedEvents],
  );
  const visibleEvents = selectedDate === "all"
    ? sortedEvents
    : sortedEvents.filter((event) => dateKey(event.startTime) === selectedDate);

  return (
    <section className="uni-page lineup-page">
      <header
        className="lineup-top-card"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7,26,61,0.2), rgba(7,26,61,0.96)), url(${FESTIVAL_IMAGE})`,
        }}
      >
        <div className="plain-page-header plain-page-header--dark">
          <Link to="/events" aria-label="공연으로 돌아가기">
            <IconArrowLeft className="h-5 w-5" />
          </Link>
          <h1>LINEUP</h1>
          <span />
        </div>
        <p>함께 만들어가는 우리의 무대</p>
        <div className="lineup-date-tabs">
          <button
            type="button"
            className={selectedDate === "all" ? "active" : ""}
            onClick={() => setSelectedDate("all")}
          >
            전체
          </button>
          {dateOptions.map((date) => (
            <button
              key={date}
              type="button"
              className={selectedDate === date ? "active" : ""}
              onClick={() => setSelectedDate(date)}
            >
              {shortDate(date)}
            </button>
          ))}
        </div>
      </header>

      <div className="lineup-card-list">
        {visibleEvents.map((event, index) => (
          <article key={event.id || `${event.title}-${index}`} className="lineup-artist-card">
            <div>
              <span>{event.statusOverride || event.status || "예정"}</span>
              <h2>{event.title}</h2>
              <strong>{formatTime(event.startTime)}</strong>
              <small>{event.artist || event.locationName || "메인 스테이지"}</small>
            </div>
            <img src={event.imageUrl || FESTIVAL_IMAGE} alt="" loading="lazy" decoding="async" />
          </article>
        ))}
      </div>

      <Link to="/events" className="primary-wide-button lineup-link-button">
        <IconMusic className="h-4 w-4" />
        공연 일정으로 돌아가기
      </Link>
    </section>
  );
}
