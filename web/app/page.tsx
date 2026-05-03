'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const router = useRouter();
  const token = useAuth((s) => s.token);

  useEffect(() => {
    router.replace(token ? '/dashboard' : '/signin');
  }, [router, token]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-ink-muted text-sm">Redirecting...</p>
    </main>
  );
}
