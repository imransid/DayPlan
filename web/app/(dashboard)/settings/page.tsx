'use client';

import Link from 'next/link';
import { Clock, Zap, Bell, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const user = useAuth((s) => s.user);

  return (
    <div>
      <h1 className="text-3xl font-medium tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-ink-muted mb-8">Manage your account, schedule, and integrations</p>

      <div className="card mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-ink text-white flex items-center justify-center font-medium">
            {user?.name?.[0]?.toUpperCase() ?? user?.email[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{user?.name ?? 'Your account'}</div>
            <div className="text-sm text-ink-muted">{user?.email}</div>
          </div>
        </div>
      </div>

      <div className="card !p-0 divide-y divide-black/[0.08]">
        <Link href="/settings/integrations" className="flex items-center justify-between p-4 hover:bg-surface-alt/50 transition">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-alt rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <div className="font-medium text-sm">Integrations</div>
              <div className="text-xs text-ink-muted">Discord, Slack, Telegram</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-muted" />
        </Link>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-alt rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <div className="font-medium text-sm">Reminder schedule</div>
              <div className="text-xs text-ink-muted">9:00 AM – 9:00 PM</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-muted" />
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-alt rounded-lg flex items-center justify-center">
              <Bell className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <div className="font-medium text-sm">End-of-day post</div>
              <div className="text-xs text-ink-muted">11:00 PM in your timezone</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-muted" />
        </div>
      </div>
    </div>
  );
}
