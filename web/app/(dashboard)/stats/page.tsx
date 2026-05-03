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

export default function StatsPage() {
  const token = useAuth((s) => s.token);

  const { from, to } = utcHistoryRangeIso(6);

  const { data: byDate = {}, isLoading } = useQuery({
    queryKey: ['stats', from, to],
    queryFn: () =>
      api<Record<string, Task[]>>(
        `/tasks/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token },
      ),
  });

  const allTasks = Object.values(byDate).flat();
  const totalDone = allTasks.filter((t) => t.doneAt).length;
  const totalRate = allTasks.length > 0 ? Math.round((totalDone / allTasks.length) * 100) : 0;

  const toDay = DateTime.utc().startOf('day');
  const days = Array.from({ length: 7 }, (_, i) => toDay.minus({ days: 6 - i }).toISODate()!);

  return (
    <div>
      <h1 className="text-3xl font-medium tracking-tight mb-1">Stats</h1>
      <p className="text-sm text-ink-muted mb-8">Last 7 days</p>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading...</p>
      ) : (
        <>
          <div className="card text-center mb-6">
            <div className="text-5xl font-medium tracking-tight">{totalDone}<span className="text-ink-muted font-normal">/{allTasks.length}</span></div>
            <div className="text-success font-medium mt-2">{totalRate}% complete</div>
          </div>

          <div className="card">
            <h3 className="font-medium mb-4 text-sm">Daily completion</h3>
            <div className="flex items-end justify-between h-32 gap-2">
              {days.map((date) => {
                const tasks = byDate[date] ?? [];
                const done = tasks.filter((t) => t.doneAt).length;
                const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
                const label = DateTime.fromISO(date, { zone: 'utc' }).toFormat('ccc');
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full bg-surface-alt rounded-t flex flex-col justify-end" style={{ height: '100px' }}>
                      <div
                        className={`w-full rounded-t ${pct >= 50 ? 'bg-success' : 'bg-ink-disabled'}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-muted">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
