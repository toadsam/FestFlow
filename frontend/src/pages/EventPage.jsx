import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createEventStream, fetchAiVisitorGuide, fetchEvents } from "../api";
import { IconCalendar, IconMusic } from "../components/UxIcons";
import { FESTIVAL_IMAGE, fallbackEvents, formatTime } from "../data/festivalUiData";

const REMINDER_KEY = "festflow_event_reminders";

const EVENT_DISPLAY_PRESETS = [
  {
    title: "10CM",
    stage: "메인 스테이지",
    image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "동아리 공연 A",
    stage: "보조 무대",
    image: "https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=900",
  },
  {
    title: "버스킹 스테이지",
    stage: "잔디 광장",
    image: "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=900",
  },
  {
    title: "댄스 퍼포먼스",
    stage: "메인 스테이지",
    image: "https://commons.wikimedia.org/wiki/Special:Redirect/file/BABYMONSTER_in_Seattle.jpg?width=900",
  },
  {
    title: "밴드 아리랑",
    stage: "보조 무대",
    image: "https://images.pexels.com/photos/1540338/pexels-photo-1540338.jpeg?auto=compress&cs=tinysrgb&w=900",
  },
  {
    title: "DJ NIGHT",
    stage: "메인 스테이지",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80",
  },
];

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
  if (Number.isNaN(date.getTime())) return String(value).slice(5, 10).replace("-", ".");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} (${weekdays[date.getDay()]})`;
}

function isSeedLikeEvent(event) {
  const title = event?.title || "";
  const image = event?.imageUrl || "";
  return (
    ["밴드 연습실", "DJ Awesome", "에일리", "싸이", "득근득근 포징 공연"].includes(title)
    || image.includes("Bodybuilder")
  );
}

function presetFor(index) {
  return EVENT_DISPLAY_PRESETS[index % EVENT_DISPLAY_PRESETS.length];
}

function displayTitle(event, index) {
  return isSeedLikeEvent(event) ? presetFor(index).title : event?.title || presetFor(index).title;
}

function displayStage(event, index) {
  return event?.artist || event?.locationName || presetFor(index).stage;
}

function displayImage(event, index) {
  if (isSeedLikeEvent(event)) return presetFor(index).image;
  return event?.imageUrl || presetFor(index).image || FESTIVAL_IMAGE;
}

function eventStatus(event, index) {
  const raw = event?.statusOverride || event?.status || "";
  if (raw.includes("진행")) return "진행중";
  if (raw.includes("곧")) return "곧 시작";
  if (raw.includes("종료")) return "종료";
  return ["곧 시작", "종료", "진행중", "곧 시작", "예약", "예정"][index % 6];
}

function statusTone(status) {
  if (status === "진행중") return "live";
  if (status === "곧 시작") return "soon";
  if (status === "예약") return "booked";
  if (status === "종료") return "done";
  return "idle";
}

export default function EventPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState("featured");
  const [stageFilter, setStageFilter] = useState("전체");
  const [reminders, setReminders] = useState(() => readReminders());
  const [aiGuide, setAiGuide] = useState(null);
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
    fetchAiVisitorGuide("events")
      .then((data) => {
        if (mounted) setAiGuide(data);
      })
      .catch(() => {
        if (mounted) setAiGuide(null);
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
  const sortedEvents = useMemo(
    () => [...source].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [source],
  );
  const dateOptions = useMemo(
    () => [...new Set(sortedEvents.map((event) => dateKey(event.startTime)))],
    [sortedEvents],
  );
  const featuredDate = useMemo(() => {
    if (!dateOptions.length) return "all";
    return dateOptions.reduce((bestDate, currentDate) => {
      const bestCount = sortedEvents.filter((event) => dateKey(event.startTime) === bestDate).length;
      const currentCount = sortedEvents.filter((event) => dateKey(event.startTime) === currentDate).length;
      return currentCount > bestCount ? currentDate : bestDate;
    }, dateOptions[0]);
  }, [dateOptions, sortedEvents]);
  const activeDate = selectedDate === "all" ? "all" : selectedDate === "featured" ? featuredDate : selectedDate;
  const dayEvents = activeDate === "all"
    ? sortedEvents
    : sortedEvents.filter((event) => dateKey(event.startTime) === activeDate);
  const stages = useMemo(() => {
    const labels = dayEvents.map((event, index) => displayStage(event, index));
    return ["전체", ...new Set(labels), "버스킹"];
  }, [dayEvents]);
  const visibleEvents = stageFilter === "전체"
    ? dayEvents
    : dayEvents.filter((event, index) => displayStage(event, index) === stageFilter);
  const heroEvent = dayEvents[0] || sortedEvents[0];
  const aiGuideBullets = Array.isArray(aiGuide?.bullets)
    ? aiGuide.bullets.filter(Boolean).slice(0, 3)
    : [];
  const aiRecommendedAction = Array.isArray(aiGuide?.actions) ? aiGuide.actions[0] : null;

  function selectDate(date) {
    setSelectedDate(date);
    setStageFilter("전체");
  }

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

  return (
    <section className="events-reference-page">
      <header className="events-reference-header">
        <h1>오늘의 공연</h1>
        <button type="button" aria-label="전체 라인업 보기" onClick={() => navigate("/events/lineup")}>
          <IconCalendar className="h-5 w-5" />
        </button>
      </header>

      {aiGuide && (
        <section className="events-ai-guide-card" aria-label="AI 공연 요약">
          <span>{aiGuide.generated ? "OpenAI 실시간 추천" : "AI 데이터 추천"}</span>
          <strong>{aiGuide.summary || "지금 보기 좋은 공연을 AI가 정리하고 있어요."}</strong>
          {aiGuideBullets.length > 0 && (
            <ul>
              {aiGuideBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="events-reference-date-tabs">
        {dateOptions.map((date) => (
          <button
            key={date}
            type="button"
            className={activeDate === date ? "active" : ""}
            onClick={() => selectDate(date)}
          >
            {shortTabLabel(date)}
          </button>
        ))}
      </div>

      {heroEvent && (
        <section className="events-reference-hero-card">
          <div>
            <span>{eventStatus(heroEvent, 0)}</span>
            <h2>{displayTitle(heroEvent, 0)}</h2>
            <p>{formatTime(heroEvent.startTime)} · {displayStage(heroEvent, 0)}</p>
            {aiRecommendedAction && (
              <p className="events-reference-ai-copy">
                {aiRecommendedAction.target} · {aiRecommendedAction.description}
              </p>
            )}
            <button type="button" onClick={() => toggleReminder(heroEvent.id || heroEvent.title)}>
              알림 받기
            </button>
          </div>
          <img src={displayImage(heroEvent, 0)} alt="" loading="lazy" decoding="async" />
        </section>
      )}

      <div className="events-reference-filter-tabs">
        {stages.map((stage) => (
          <button
            key={stage}
            type="button"
            className={stageFilter === stage ? "active" : ""}
            onClick={() => setStageFilter(stage)}
          >
            {stage}
          </button>
        ))}
      </div>

      {message && <p className="events-reference-note">{message}</p>}

      <section className="events-reference-list">
        {visibleEvents.map((event, index) => {
          const eventId = event.id || `${event.title}-${index}`;
          const reminded = reminders.has(String(eventId));
          const status = reminded ? "알림" : eventStatus(event, index);
          return (
            <article key={eventId} className="events-reference-row">
              <time>
                <strong>{formatTime(event.startTime)}</strong>
                <small>{formatTime(event.endTime)}</small>
              </time>
              <div>
                <h2>{displayTitle(event, index)}</h2>
                <p>{displayStage(event, index)}</p>
              </div>
              <button
                type="button"
                className={`events-reference-status events-reference-status--${statusTone(status)}`}
                onClick={() => toggleReminder(eventId)}
              >
                {status}
              </button>
            </article>
          );
        })}
        {visibleEvents.length === 0 && (
          <p className="events-reference-empty">선택한 조건의 공연이 아직 등록되지 않았습니다.</p>
        )}
      </section>

      <button type="button" className="events-reference-lineup-button" onClick={() => navigate("/events/lineup")}>
        <IconMusic className="h-4 w-4" />
        전체 라인업 보기
      </button>
    </section>
  );
}

function shortTabLabel(value) {
  const label = dateLabel(value);
  return label.replace(/\s/g, "");
}
