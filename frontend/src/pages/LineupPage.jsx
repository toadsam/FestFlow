import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createEventStream, fetchEvents } from '../api';

const THEMES = [
  { id: 'violet', frame: 'lineup-card-violet', role: 'HEAD VOCAL', accent: 'VX-01' },
  { id: 'green', frame: 'lineup-card-green', role: 'MAIN DANCER', accent: 'GX-07' },
  { id: 'silver', frame: 'lineup-card-silver', role: 'PERFORMANCE', accent: 'SX-22' },
  { id: 'cyan', frame: 'lineup-card-cyan', role: 'STAGE UNIT', accent: 'CX-13' },
];

function toCode(title) {
  return title.replace(/\s+/g, '').slice(0, 6).toUpperCase();
}

function artistLabel(title) {
  return title.split(' ')[0] || title;
}

export default function LineupPage() {
  const [events, setEvents] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [flippedIds, setFlippedIds] = useState(() => new Set());
  const [spinId, setSpinId] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [error, setError] = useState('');
  const touchStartXRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const stream = createEventStream();
    stream.addEventListener('events', (event) => {
      try {
        setEvents(JSON.parse(event.data));
      } catch {
        // ignore parse error
      }
    });
    return () => stream.close();
  }, []);

  const lineup = useMemo(() => {
    return events.map((event, index) => {
      const theme = THEMES[index % THEMES.length];
      return {
        ...event,
        theme,
        artist: artistLabel(event.title),
        code: toCode(event.title),
      };
    });
  }, [events]);

  useEffect(() => {
    if (lineup.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((prev) => Math.max(0, Math.min(prev, lineup.length - 1)));
  }, [lineup]);

  const selected = lineup[activeIndex] || null;

  function handleCardMove(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    card.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(x * 11).toFixed(2)}deg`);
  }

  function handleCardLeave(e) {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }

  function goToIndex(index) {
    if (lineup.length === 0) return;
    setActiveIndex(Math.max(0, Math.min(index, lineup.length - 1)));
  }

  function toggleCard(index, id) {
    if (index !== activeIndex) {
      setActiveIndex(index);
      return;
    }

    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSpinId(id);
    window.setTimeout(() => setSpinId((current) => (current === id ? null : current)), 560);
  }

  function handleTouchStart(e) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
    draggingRef.current = true;
  }

  function handleTouchMove(e) {
    if (!draggingRef.current || touchStartXRef.current == null) return;
    const x = e.touches[0]?.clientX ?? touchStartXRef.current;
    setDragOffset(x - touchStartXRef.current);
  }

  function handleTouchEnd() {
    if (!draggingRef.current) return;
    const threshold = 50;
    if (dragOffset <= -threshold) {
      goToIndex(activeIndex + 1);
    } else if (dragOffset >= threshold) {
      goToIndex(activeIndex - 1);
    }
    draggingRef.current = false;
    touchStartXRef.current = null;
    setDragOffset(0);
  }

  return (
    <section className="cyber-page pt-4 space-y-3 lineup-page">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold glitch-title" data-text="FESTIVAL LINEUP">FESTIVAL LINEUP</h2>
        <Link to="/events" className="lineup-back px-3 py-2 text-xs font-semibold rounded-lg">BACK</Link>
      </div>

      <p className="text-xs text-cyan-200/90">아티스트 카드형 라인업 · 좌우 스와이프</p>

      {error && <p className="text-sm text-rose-500">{error}</p>}

      <div
        className="lineup-carousel"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="lineup-track"
          style={{
            transform: `translateX(calc((100% - 74%) / 2 - ${activeIndex} * (74% + 14px) + ${dragOffset}px))`,
          }}
        >
          {lineup.map((item, index) => {
            const distance = Math.abs(index - activeIndex);
            const isActive = index === activeIndex;
            const flipped = flippedIds.has(item.id);

            return (
              <button
                key={item.id}
                type="button"
                className={`lineup-card ${item.theme.frame} ${isActive ? 'lineup-card-active' : ''} ${flipped ? 'lineup-card-flipped' : ''} ${spinId === item.id ? 'lineup-card-spin' : ''}`}
                onClick={() => toggleCard(index, item.id)}
                onMouseMove={handleCardMove}
                onMouseLeave={handleCardLeave}
                style={{
                  opacity: distance > 2 ? 0.32 : 1 - distance * 0.18,
                  transform: `scale(${isActive ? 1 : distance === 1 ? 0.92 : 0.86})`,
                }}
              >
                <div className="lineup-card-inner">
                  <div className="lineup-face lineup-face-front">
                    <div className="lineup-card-noise" />
                    <p className="lineup-chip">{item.theme.accent}</p>
                    <div className="lineup-portrait">
                      <div className="lineup-portrait-glow" />
                      <span className="lineup-artist-name">{item.artist}</span>
                    </div>
                    <div className="lineup-meta">
                      <p className="lineup-role">{item.theme.role}</p>
                      <p className="lineup-title">{item.title}</p>
                      <p className="lineup-time">{item.startTime?.replace('T', ' ').slice(5, 16)} - {item.endTime?.replace('T', ' ').slice(11, 16)}</p>
                    </div>
                    <p className="lineup-code">{item.code}</p>
                  </div>

                  <div className="lineup-face lineup-face-back">
                    <p className="lineup-back-label">ARTIST PROFILE</p>
                    <p className="lineup-back-name">{item.artist}</p>
                    <p className="lineup-back-title">{item.title}</p>
                    <p className="lineup-back-time">{item.startTime?.replace('T', ' ')} ~ {item.endTime?.replace('T', ' ')}</p>
                    <div className="lineup-back-row">
                      <span className="lineup-back-chip">{item.theme.role}</span>
                      <span className="lineup-back-chip">{item.status}</span>
                    </div>
                    <p className="lineup-back-tip">CLICK AGAIN TO FLIP BACK</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lineup-dots">
        {lineup.map((item, idx) => (
          <button
            key={`dot-${item.id}`}
            type="button"
            className={`lineup-dot ${idx === activeIndex ? 'lineup-dot-active' : ''}`}
            onClick={() => goToIndex(idx)}
            aria-label={`${item.title} 카드로 이동`}
          />
        ))}
      </div>

      {selected && (
        <article className="lineup-focus rounded-xl p-3 border border-cyan-300/50">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">NOW SELECTED</h3>
            <span className="text-xs px-2 py-1 rounded-full border border-cyan-300/60">{selected.status}</span>
          </div>
          <p className="mt-1 text-base font-extrabold">{selected.title}</p>
          <p className="text-xs mt-1 text-cyan-200">{selected.startTime?.replace('T', ' ')} ~ {selected.endTime?.replace('T', ' ')}</p>
        </article>
      )}
    </section>
  );
}
