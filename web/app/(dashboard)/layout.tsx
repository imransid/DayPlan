'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, BarChart3, Settings, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/history', label: 'History', icon: Calendar },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !token) router.replace('/signin');
  }, [token, router]);

  if (!token) return null;

  const handleLogout = () => {
    logout();
    router.replace('/signin');
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-black/[0.08] bg-surface px-4 py-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-8 h-8 bg-ink text-white rounded-lg flex items-center justify-center text-sm font-semibold">DP</div>
          <span className="font-medium">DayPlan</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                  active ? 'bg-surface-alt text-ink font-medium' : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-black/[0.08] pt-3">
          <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center text-xs font-medium">
              {user?.name?.[0]?.toUpperCase() ?? user?.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{user?.name ?? user?.email}</div>
              {user?.name && <div className="text-xs text-ink-subtle truncate">{user.email}</div>}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-ink-muted hover:bg-surface-alt rounded-lg transition mt-1"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-surface border-b border-black/[0.08] flex items-center justify-between px-4 z-40">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-ink text-white rounded-md flex items-center justify-center text-xs font-semibold">DP</div>
          <span className="font-medium text-sm">DayPlan</span>
        </Link>
        <button onClick={() => setMobileOpen(true)} className="p-1.5">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileOpen(false)}>
          <aside className="absolute right-0 top-0 bottom-0 w-72 bg-surface flex flex-col px-4 py-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMobileOpen(false)} className="self-end p-1.5 -mr-1.5 mb-4">
              <X className="w-5 h-5" />
            </button>
            <nav className="flex-1 space-y-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                      active ? 'bg-surface-alt font-medium' : 'text-ink-muted',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 text-sm text-ink-muted">
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
