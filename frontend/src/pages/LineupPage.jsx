import { useEffect, useMemo, useState } from "react";
import { createEventStream, fetchEvents } from "../api";
import { IconMusic } from "../components/UxIcons";
import { FESTIVAL_IMAGE, fallbackEvents, formatTime } from "../data/festivalUiData";

const LINEUP_POSTER_PRESETS = [
  {
    title: "10CM",
    stage: "메인 스테이지",
    image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "볼빨간사춘기",
    stage: "메인 스테이지",
    image: "https://commons.wikimedia.org/wiki/Special:Redirect/file/H1-Key_in_February_2026.png?width=900",
  },
  {
    title: "하현상",
    stage: "보조 무대",
    image: "https://commons.wikimedia.org/wiki/Special:Redirect/file/BABYMONSTER_in_Seattle.jpg?width=900",
  },
  {
    title: "DJ NIGHT",
    stage: "메인 스테이지",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80",
  },
];

const LINEUP_TONES = ["blue", "violet", "teal", "navy"];
const LINEUP_HERO_IMAGE = "https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=1200";

function dateKey(value) {
  return value ? String(value).slice(0, 10) : "all";
}

function shortDate(value) {
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
  return LINEUP_POSTER_PRESETS[index % LINEUP_POSTER_PRESETS.length];
}

function getPosterTitle(event, index) {
  return isSeedLikeEvent(event) ? presetFor(index).title : event?.title || presetFor(index).title;
}

function getPosterStage(event, index) {
  return event?.artist || event?.locationName || presetFor(index).stage;
}

function getPosterImage(event, index) {
  if (isSeedLikeEvent(event)) return presetFor(index).image;
  return event?.imageUrl || presetFor(index).image || FESTIVAL_IMAGE;
}

export default function LineupPage() {
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState("featured");
  const [showAll, setShowAll] = useState(false);

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
          // Streaming is optional for this public view.
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
  const activeEvents = activeDate === "all"
    ? sortedEvents
    : sortedEvents.filter((event) => dateKey(event.startTime) === activeDate);
  const visibleEvents = showAll ? activeEvents : activeEvents.slice(0, 3);

  function selectDate(date) {
    setSelectedDate(date);
    setShowAll(false);
  }

  function showFullLineup() {
    setSelectedDate("all");
    setShowAll(true);
  }

  return (
    <section className="lineup-reference-page">
      <header
        className="lineup-reference-hero"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(2,8,23,0.12), rgba(2,8,23,0.72) 58%, #03112c 100%), url(${LINEUP_HERO_IMAGE})`,
        }}
      >
        <div className="lineup-reference-copy">
          <span>2026 아주대 축제</span>
          <h1>LINEUP</h1>
          <p>함께 만들어가는 우리의 무대</p>
        </div>
        <div className="lineup-reference-tabs">
          {dateOptions.map((date) => (
            <button
              key={date}
              type="button"
              className={activeDate === date ? "active" : ""}
              onClick={() => selectDate(date)}
            >
              {shortDate(date)}
            </button>
          ))}
        </div>
      </header>

      <div className="lineup-reference-list">
        {visibleEvents.map((event, index) => (
          <article
            key={event.id || `${event.title}-${index}`}
            className={`lineup-reference-card lineup-reference-card--${LINEUP_TONES[index % LINEUP_TONES.length]}`}
          >
            <div className="lineup-reference-info">
              {index === 0 && <span>헤드라이너</span>}
              <h2>{getPosterTitle(event, index)}</h2>
              <strong>{formatTime(event.startTime)}</strong>
              <small>{getPosterStage(event, index)}</small>
            </div>
            <img src={getPosterImage(event, index)} alt="" loading="lazy" decoding="async" />
          </article>
        ))}
        {activeEvents.length === 0 && (
          <p className="lineup-reference-empty">선택한 날짜의 라인업이 아직 등록되지 않았습니다.</p>
        )}
      </div>

      <button type="button" className="lineup-reference-cta" onClick={showFullLineup}>
        <IconMusic className="h-4 w-4" />
        전체 라인업 보기
      </button>
    </section>
  );
}
