'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  date: string;
  doneAt: string | null;
  position: number;
}

export default function DashboardPage() {
  const token = useAuth((s) => s.token);
  const queryClient = useQueryClient();
  const [newTask, setNewTask] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', today],
    queryFn: () => api<Task[]>(`/tasks?date=${today}`, { token }),
  });

  const createTask = useMutation({
    mutationFn: (title: string) =>
      api<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title, date: today }), token }),
    onSuccess: () => {
      setNewTask('');
      queryClient.invalidateQueries({ queryKey: ['tasks', today] });
    },
  });

  const toggleTask = useMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/toggle`, { method: 'PATCH', token }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', today] });
      const previous = queryClient.getQueryData<Task[]>(['tasks', today]);
      queryClient.setQueryData<Task[]>(['tasks', today], (old) =>
        old?.map((t) => (t.id === id ? { ...t, doneAt: t.doneAt ? null : new Date().toISOString() } : t)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['tasks', today], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks', today] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', today] }),
  });

  const done = tasks.filter((t) => t.doneAt);
  const pct = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  const formatDate = () =>
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Today</h1>
          <p className="text-sm text-ink-muted mt-1">{formatDate()}</p>
        </div>
        {tasks.length > 0 && (
          <div className="text-sm text-ink-muted">
            {done.length} of {tasks.length} · {pct}%
          </div>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="h-1 bg-surface-alt rounded-full overflow-hidden mb-6">
          <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTask.trim()) createTask.mutate(newTask.trim());
        }}
        className="flex gap-2 mb-6"
      >
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a task for today..."
          className="input flex-1"
        />
        <button type="submit" disabled={!newTask.trim() || createTask.isPending} className="btn btn-primary">
          <Plus className="w-4 h-4" />
        </button>
      </form>

      {isLoading ? (
        <p className="text-ink-muted text-sm py-8">Loading...</p>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-surface-alt rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📋</div>
          <h2 className="text-base font-medium mb-1">No tasks yet</h2>
          <p className="text-sm text-ink-muted">Plan your day in 30 seconds — type above to add your first task.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const isDone = !!task.doneAt;
            return (
              <li
                key={task.id}
                className={cn(
                  'flex items-center gap-3 p-3.5 rounded-lg border transition group',
                  isDone ? 'bg-surface-alt border-transparent' : 'bg-surface border-black/[0.08] hover:border-black/[0.15]',
                )}
              >
                <button
                  onClick={() => toggleTask.mutate(task.id)}
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center border-2 transition shrink-0',
                    isDone ? 'bg-success border-success' : 'border-ink-disabled hover:border-ink-muted',
                  )}
                  aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                >
                  {isDone && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </button>
                <span className={cn('flex-1 text-sm', isDone && 'line-through text-ink-muted')}>{task.title}</span>
                <button
                  onClick={() => deleteTask.mutate(task.id)}
                  className="text-ink-subtle hover:text-danger text-xs opacity-0 group-hover:opacity-100 transition"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
