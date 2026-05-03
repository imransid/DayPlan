'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';

export default function SignInPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: async (vars: { email: string; password: string }) =>
      api<{ accessToken: string; user: User }>('/auth/signin', {
        method: 'POST',
        body: JSON.stringify(vars),
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
          <h1 className="text-2xl font-medium tracking-tight">Welcome back</h1>
          <p className="text-sm text-ink-muted mt-1">Sign in to your DayPlan account</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ email, password });
          }}
          className="space-y-3"
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
          {mutation.error && (
            <p className="text-xs text-danger">{(mutation.error as any)?.body?.message ?? 'Invalid credentials'}</p>
          )}
          <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full">
            {mutation.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-ink-muted">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-ink font-medium hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
}
