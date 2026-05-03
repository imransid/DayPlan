'use client';

import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { utcHistoryRangeIso } from '@/lib/utcTaskDay';

interface Task {
  id: string;
  title: string;
  date: string;
  doneAt: string | null;
}

export default function HistoryPage() {
  const token = useAuth((s) => s.token);

  const { from, to } = utcHistoryRangeIso(30);

  const { data: byDate = {}, isLoading } = useQuery({
    queryKey: ['history', from, to],
    queryFn: () =>
      api<Record<string, Task[]>>(
        `/tasks/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token },
      ),
  });

  const dates = Object.keys(byDate).sort().reverse();

  return (
    <div>
      <h1 className="text-3xl font-medium tracking-tight mb-1">History</h1>
      <p className="text-sm text-ink-muted mb-8">Last 30 days</p>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading...</p>
      ) : dates.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-ink-muted">No history yet — your first day is in progress.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dates.map((date) => {
            const tasks = byDate[date];
            const done = tasks.filter((t) => t.doneAt).length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <div key={date} className="card">
                <div className="flex justify-between items-baseline mb-2">
                  <h3 className="font-medium">
                    {DateTime.fromISO(date, { zone: 'utc' }).toLocaleString({
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </h3>
                  <span className="text-xs text-ink-muted">{done}/{tasks.length} · {pct}%</span>
                </div>
                <div className="h-1 bg-surface-alt rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                </div>
                <ul className="space-y-1">
                  {tasks.map((t) => (
                    <li key={t.id} className={`text-sm ${t.doneAt ? '' : 'text-ink-muted'}`}>
                      {t.doneAt ? '✓' : '✗'} {t.title}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
