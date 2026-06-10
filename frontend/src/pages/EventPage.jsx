import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createEventStream, fetchAiVisitorGuide, fetchEvents } from "../api";
import { IconCalendar, IconMusic } from "../components/UxIcons";
import { FESTIVAL_IMAGE, fallbackEvents, formatTime } from "../data/festivalUiData";
import {
  areNotificationsEnabled,
  ensureNotificationPermission,
  showBrowserNotification,
} from "../utils/notifications";

const REMINDER_KEY = "festflow_event_reminders";
const REMINDER_LEAD_MS = 10 * 60 * 1000;
const MAX_TIMER_MS = 2_147_483_647;
const STATUS = {
  LIVE: "진행중",
  SOON: "곧 시작",
  ENDED: "종료",
  SCHEDULED: "예정",
  DELAYED: "지연",
  CANCELED: "취소",
  RESERVED: "예약",
  REMINDER: "알림",
};

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

function eventStatus(event) {
  const raw = `${event?.status || event?.statusOverride || ""}`;
  const start = new Date(event?.startTime).getTime();
  const end = new Date(event?.endTime).getTime();
  const now = Date.now();

  if (raw.includes(STATUS.CANCELED)) return STATUS.CANCELED;
  if (Number.isFinite(end) && now > end) return STATUS.ENDED;
  if (raw.includes(STATUS.LIVE)) return STATUS.LIVE;
  if (raw.includes(STATUS.SOON)) return STATUS.SOON;
  if (raw.includes(STATUS.DELAYED)) return STATUS.DELAYED;
  if (raw.includes(STATUS.ENDED)) return STATUS.ENDED;
  if (Number.isFinite(start) && now < start) {
    return start - now <= 30 * 60 * 1000 ? STATUS.SOON : STATUS.SCHEDULED;
  }
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) {
    return STATUS.LIVE;
  }
  return STATUS.SCHEDULED;
}

function statusTone(status) {
  if (status === STATUS.LIVE) return "live";
  if (status === STATUS.SOON || status === STATUS.DELAYED) return "soon";
  if (status === STATUS.RESERVED || status === STATUS.REMINDER) return "booked";
  if (status === STATUS.ENDED || status === STATUS.CANCELED) return "done";
  return "idle";
}

function reminderKey(event, index = 0) {
  return String(event?.id || `${event?.title || "event"}-${event?.startTime || index}-${index}`);
}

export default function EventPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState("featured");
  const [stageFilter, setStageFilter] = useState("전체");
  const [reminders, setReminders] = useState(() => readReminders());
  const [aiGuide, setAiGuide] = useState(null);
  const [message, setMessage] = useState("");
  const reminderTimersRef = useRef(new Map());

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

  function clearReminderTimer(key) {
    const timer = reminderTimersRef.current.get(key);
    if (timer) {
      window.clearTimeout(timer);
      reminderTimersRef.current.delete(key);
    }
  }

  function scheduleReminderNotification(event, index = 0) {
    const key = reminderKey(event, index);
    clearReminderTimer(key);

    const start = new Date(event?.startTime).getTime();
    if (!Number.isFinite(start)) {
      return;
    }

    const delay = Math.max(0, start - Date.now() - REMINDER_LEAD_MS);
    if (delay > MAX_TIMER_MS) {
      return;
    }

    const timer = window.setTimeout(() => {
      showBrowserNotification("공연 알림", {
        body: `${displayTitle(event, index)} 시작이 가까워졌습니다. ${displayStage(event, index)} 일정을 확인해 주세요.`,
        tag: `festflow-event-${key}`,
      });
      reminderTimersRef.current.delete(key);
    }, delay);
    reminderTimersRef.current.set(key, timer);
  }

  async function toggleReminder(event, index = 0) {
    const key = reminderKey(event, index);
    const next = new Set(reminders);
    if (next.has(key)) {
      next.delete(key);
      clearReminderTimer(key);
      setMessage("공연 알림을 해제했습니다.");
    } else {
      if (!areNotificationsEnabled()) {
        setMessage("더보기에서 알림 설정을 켠 뒤 다시 시도해 주세요.");
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setMessage("브라우저 알림 권한이 필요합니다.");
        return;
      }
      next.add(key);
      scheduleReminderNotification(event, index);
      setMessage("공연 알림을 저장했습니다.");
    }
    setReminders(next);
    saveReminders(next);
  }

  useEffect(() => {
    reminderTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reminderTimersRef.current.clear();
    sortedEvents.forEach((event, index) => {
      const key = reminderKey(event, index);
      if (reminders.has(key)) {
        scheduleReminderNotification(event, index);
      }
    });

    return () => {
      reminderTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      reminderTimersRef.current.clear();
    };
  }, [reminders, sortedEvents]);

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
            <span>{eventStatus(heroEvent)}</span>
            <h2>{displayTitle(heroEvent, 0)}</h2>
            <p>{formatTime(heroEvent.startTime)} · {displayStage(heroEvent, 0)}</p>
            {aiRecommendedAction && (
              <p className="events-reference-ai-copy">
                {aiRecommendedAction.target} · {aiRecommendedAction.description}
              </p>
            )}
            <button type="button" onClick={() => toggleReminder(heroEvent, 0)}>
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
          const eventId = reminderKey(event, index);
          const reminded = reminders.has(String(eventId));
          const status = reminded ? STATUS.REMINDER : eventStatus(event);
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
                onClick={() => toggleReminder(event, index)}
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
