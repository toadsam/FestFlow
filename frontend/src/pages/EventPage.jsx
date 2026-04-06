import { useEffect, useMemo, useRef, useState } from 'react';
import { createEventStream, downloadEventCsv, fetchEvents } from '../api';

const statusClassName = {
  예정: 'bg-indigo-100 text-indigo-700',
  진행중: 'bg-emerald-100 text-emerald-700',
  종료: 'bg-slate-200 text-slate-700',
};

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

export default function EventPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const stream = createEventStream();

    stream.addEventListener('events', (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents(data);
      } catch {
        // SSE 파싱 오류는 무시합니다.
      }
    });

    return () => stream.close();
  }, []);

  useEffect(() => {
    const now = new Date();
    events.forEach((event) => {
      const diff = new Date(event.startTime) - now;
      const key = `${event.id}-imminent`;

      if (event.status === '예정' && diff > 0 && diff <= 15 * 60 * 1000 && !notifiedRef.current.has(key)) {
        notify('공연 임박', `${event.title} 공연이 15분 이내 시작됩니다.`);
        notifiedRef.current.add(key);
      }
    });
  }, [events]);

  const filtered = useMemo(() => {
    if (statusFilter === '전체') return events;
    return events.filter((event) => event.status === statusFilter);
  }, [events, statusFilter]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return events.find((event) => {
      const diff = new Date(event.startTime) - now;
      return event.status === '예정' && diff > 0 && diff < 60 * 60 * 1000;
    });
  }, [events]);

  return (
    <section className="pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">공연 라인업</h2>
        <button type="button" onClick={downloadEventCsv} className="text-xs rounded-lg border px-2 py-1 min-h-11">
          CSV
        </button>
      </div>

      {upcoming && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          임박 공연: {upcoming.title} ({upcoming.startTime.replace('T', ' ')})
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
        {['전체', '예정', '진행중', '종료'].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-md py-1.5 min-h-11 text-xs font-semibold ${statusFilter === status ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'}`}
          >
            {status}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="space-y-2">
        {filtered.map((event, index) => (
          <article key={event.id} className="rounded-xl border border-slate-200 p-3 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-6 flex justify-center text-slate-400 text-xs">{index + 1}</div>
              <div className="w-1 h-12 bg-teal-200 rounded" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">{event.title}</h3>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusClassName[event.status] || 'bg-slate-100 text-slate-600'}`}>
                    {event.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {event.startTime.replace('T', ' ')} ~ {event.endTime.replace('T', ' ')}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
          선택한 상태의 공연이 없습니다. 관리자에서 공연을 등록하거나, 잠시 후 새로고침해 주세요.
        </div>
      )}
    </section>
  );
}
