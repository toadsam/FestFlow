import { useEffect, useState } from 'react';
import { fetchEvents } from '../api';

const statusClassName = {
  예정: 'bg-indigo-100 text-indigo-700',
  진행중: 'bg-emerald-100 text-emerald-700',
  종료: 'bg-slate-200 text-slate-700',
};

export default function EventPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section className="pt-4 space-y-3">
      <h2 className="text-lg font-bold">공연 라인업</h2>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {events.map((event) => (
        <article key={event.id} className="rounded-xl border border-slate-200 p-3 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">{event.title}</h3>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusClassName[event.status] || 'bg-slate-100 text-slate-600'}`}>
              {event.status}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-2">
            {event.startTime.replace('T', ' ')} ~ {event.endTime.replace('T', ' ')}
          </p>
        </article>
      ))}
    </section>
  );
}
