import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createBoothStream,
  createEventStream,
  fetchBooths,
  fetchEvents,
  fetchTrafficHourly,
} from "../api";
import {
  IconAlert,
  IconMapPin,
  IconMusic,
  IconSearch,
} from "../components/UxIcons";
import { resolveBoothImageUrl } from "../config/boothImages";
import {
  FESTIVAL_IMAGE,
  fallbackBooths,
  fallbackEvents,
} from "../data/festivalUiData";

const EVENT_RECOMMEND_IMAGE = "/images/og-festflow.png";

function reservationLabel(booth) {
  if (booth?.reservationEnabled === false) return "현장 이용";
  const seats = Number(booth?.reservationAvailableSeats);
  if (Number.isFinite(seats) && seats > 0) return `예약 ${seats}석`;
  if (booth?.reservation) return booth.reservation;
  return "예약 확인";
}

function compactWaitLabel(booth) {
  const value = booth?.estimatedWaitMinutes ?? booth?.wait;
  if (value == null || value === "") return "대기 확인 중";
  return `대기 ${String(value).replace("분", "")}분`;
}

function crowdLevel(percent) {
  if (percent >= 75) return "혼잡";
  if (percent >= 45) return "보통";
  return "여유";
}

function cardTone(index) {
  return ["mint", "violet", "amber"][index] || "mint";
}

export default function HomePage() {
  const navigate = useNavigate();
  const [booths, setBooths] = useState([]);
  const [events, setEvents] = useState([]);
  const [traffic, setTraffic] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    Promise.allSettled([
      fetchBooths(),
      fetchEvents(),
      fetchTrafficHourly(),
    ]).then(([boothResult, eventResult, trafficResult]) => {
      if (!mounted) return;
      if (boothResult.status === "fulfilled") setBooths(boothResult.value || []);
      if (eventResult.status === "fulfilled") setEvents(eventResult.value || []);
      if (trafficResult.status === "fulfilled") setTraffic(trafficResult.value || []);
      const failed = [boothResult, eventResult].some((item) => item.status === "rejected");
      setMessage(failed ? "일부 실시간 정보는 기본 안내로 표시 중입니다." : "");
    });

    const streams = [];
    try {
      const boothStream = createBoothStream();
      boothStream.addEventListener("booths", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setBooths(next);
        } catch {
          // Ignore malformed stream payloads.
        }
      });
      streams.push(boothStream);
    } catch {
      // Streaming is optional for the public home.
    }

    try {
      const eventStream = createEventStream();
      eventStream.addEventListener("events", (event) => {
        try {
          const next = JSON.parse(event.data);
          if (Array.isArray(next)) setEvents(next);
        } catch {
          // Ignore malformed stream payloads.
        }
      });
      streams.push(eventStream);
    } catch {
      // Streaming is optional for the public home.
    }

    return () => {
      mounted = false;
      streams.forEach((stream) => stream.close());
    };
  }, []);

  const boothSource = booths.length ? booths : fallbackBooths;
  const eventSource = events.length ? events : fallbackEvents;

  const homeCards = useMemo(() => {
    const sortedBooths = [...boothSource].sort(
      (a, b) => (Number(a.estimatedWaitMinutes) || 0) - (Number(b.estimatedWaitMinutes) || 0),
    );
    const nextEvent = [...eventSource]
      .filter((event) => event.startTime)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0];
    const firstBooth = sortedBooths[0];
    const reservable =
      boothSource.find(
        (booth) =>
          booth.id !== firstBooth?.id &&
          booth.reservationEnabled !== false &&
          Number(booth.reservationAvailableSeats) > 0,
      ) ||
      sortedBooths.find((booth) => booth.id !== firstBooth?.id) ||
      boothSource[0];

    return [
      {
        id: firstBooth?.id,
        type: "booth",
        tag: crowdLevel(Math.min(95, Number(firstBooth?.estimatedWaitMinutes || 0) * 5)),
        title: firstBooth?.name || "응급 케어 스팟",
        caption: firstBooth ? compactWaitLabel(firstBooth) : "대기 0분",
        image: firstBooth ? resolveBoothImageUrl(firstBooth) : FESTIVAL_IMAGE,
        imageFocus: "center",
      },
      {
        id: nextEvent?.id,
        type: "event",
        tag: "곧 시작",
        title: nextEvent?.title || "중앙무대 공연",
        caption: nextEvent?.startTime
          ? `${new Date(nextEvent.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 시작`
          : "18:30 시작",
        image: nextEvent?.imageUrl || EVENT_RECOMMEND_IMAGE,
        imageFocus: nextEvent?.imageFocus || "center",
      },
      {
        id: reservable?.id,
        type: "booth",
        tag: "예약 가능",
        title: reservable?.name || "푸드 박스 부스",
        caption: reservable ? reservationLabel(reservable) : "예약 가능 12명",
        image: reservable ? resolveBoothImageUrl(reservable) : "/images/booths/%EC%A3%BC%EC%A0%90%EC%82%AC%EC%A7%84.jpg",
        imageFocus: "center",
      },
    ];
  }, [boothSource, eventSource]);

  const crowdPercent = useMemo(() => {
    if (!traffic.length) return 55;
    const latest = Number(traffic[traffic.length - 1]?.count) || 0;
    const max = Math.max(1, ...traffic.map((item) => Number(item.count) || 0));
    return Math.min(99, Math.max(1, Math.round((latest / max) * 100)));
  }, [traffic]);

  return (
    <section className="uni-page uni-home-page reference-home-page">
      <header
        className="home-hero-card"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7,26,61,0.15), rgba(7,26,61,0.98)), url(/images/og-festflow.png)`,
        }}
      >
        <div className="home-hero-top">
          <strong>FestFlow</strong>
          <button type="button" aria-label="공지사항" onClick={() => navigate("/more")}>
            <IconAlert className="h-4 w-4" />
          </button>
        </div>
        <div className="home-hero-copy">
          <h1>오늘의 아주대 축제</h1>
          <span>지금 뭐 할지 바로 고르세요!</span>
          <small>공연, 부스, 지도, 혼잡도까지 한 번에 확인하세요.</small>
        </div>
        <div className="hero-action-grid">
          <button type="button" onClick={() => navigate("/events")}>
            <IconMusic className="h-5 w-5" />
            <span>공연 보기</span>
          </button>
          <button type="button" onClick={() => navigate("/stage-map")}>
            <IconSearch className="h-5 w-5" />
            <span>부스 찾기</span>
          </button>
          <button type="button" onClick={() => navigate("/stage-map")}>
            <IconMapPin className="h-5 w-5" />
            <span>지도 열기</span>
          </button>
        </div>
      </header>

      {message && <p className="app-inline-note">{message}</p>}

      <section className="uni-section">
        <div className="uni-section-head">
          <h2>지금 추천</h2>
          <button type="button" onClick={() => navigate("/stage-map")}>더보기</button>
        </div>
        <div className="recommend-strip">
          {homeCards.slice(0, 3).map((item, index) => (
            <button
              key={`${item.type}-${item.id || item.title}`}
              type="button"
              className={`recommend-card recommend-card--${cardTone(index)}`}
              style={{
                "--recommend-image": `url("${item.image}")`,
                "--recommend-focus": item.imageFocus || "center",
              }}
              onClick={() => {
                if (item.type === "event") navigate("/events");
                else navigate(item.id ? `/booths/${item.id}` : "/stage-map");
              }}
            >
              <span>{item.tag}</span>
              <strong>{item.title}</strong>
              <small>{item.caption}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="uni-card crowd-summary-card" onClick={() => navigate("/analytics")}>
        <div className="uni-section-head">
          <h2>실시간 혼잡도</h2>
          <button type="button">더보기</button>
        </div>
        <div className="crowd-score-row">
          <div>
            <p>축제장 전체 혼잡도</p>
            <span>{crowdLevel(crowdPercent)}</span>
          </div>
          <strong>{crowdPercent}%</strong>
        </div>
        <div className="crowd-meter" aria-hidden="true">
          <span className="meter-green" />
          <span className="meter-yellow" />
          <span className="meter-red" />
        </div>
        <div className="crowd-scale">
          <span>0%</span>
          <span>100%</span>
        </div>
      </section>
    </section>
  );
}
