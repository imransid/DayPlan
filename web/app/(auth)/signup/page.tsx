'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';

export default function SignUpPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '', name: '' });

  const mutation = useMutation({
    mutationFn: async (vars: typeof form) =>
      api<{ accessToken: string; user: User }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          ...vars,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      }),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      router.replace('/dashboard');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 bg-ink rounded-2xl mx-auto flex items-center justify-center text-white text-xl font-semibold mb-4">DP</div>
          <h1 className="text-2xl font-medium tracking-tight">Create your account</h1>
          <p className="text-sm text-ink-muted mt-1">Plan your day, share your wins</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="space-y-3"
        >
          <input
            type="text"
            placeholder="Name (optional)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password (8+ characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input"
            minLength={8}
            required
          />
          {mutation.error && (
            <p className="text-xs text-danger">{(mutation.error as any)?.body?.message ?? 'Sign up failed'}</p>
          )}
          <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full">
            {mutation.isPending ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-ink-muted">
          Already have an account?{' '}
          <Link href="/signin" className="text-ink font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
