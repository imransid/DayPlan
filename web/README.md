# DayPlan Web

Next.js 14 (App Router) + TanStack Query + Tailwind + Zustand.

## Setup

```bash
npm install
cp .env.example .env  # set NEXT_PUBLIC_API_URL
npm run dev
# → http://localhost:3001
```

## Architecture

- **App Router** with route groups:
  - `app/(auth)/...` — sign in / sign up (no auth required)
  - `app/(dashboard)/...` — everything else (auth required)
- **TanStack Query** for server state — auto refetch, mutation hooks, optimistic updates
- **Zustand** for auth state — persisted to localStorage
- **Tailwind** with a custom design token palette matching the mobile app
- **Responsive sidebar** — full sidebar on `lg:`, mobile drawer below

## Pages

| Route                             | Purpose                                    |
|-----------------------------------|--------------------------------------------|
| `/`                               | Redirects based on auth                    |
| `/signin`, `/signup`              | Email + password auth                      |
| `/dashboard`                      | Today's tasks (the daily driver)           |
| `/history`                        | Last 30 days, grouped by date              |
| `/stats`                          | 7-day completion chart                     |
| `/settings`                       | Settings menu                              |
| `/settings/integrations`          | Discord OAuth, channel management          |

## Optimistic updates

The `toggleTask` mutation in `/dashboard/page.tsx` shows the pattern:

```tsx
onMutate: async (id) => {
  await queryClient.cancelQueries(...);
  const previous = queryClient.getQueryData(...);
  queryClient.setQueryData(..., (old) => /* flip the task */);
  return { previous };
},
onError: (_err, _id, context) => {
  // Rollback if request fails
  queryClient.setQueryData(['tasks', today], context.previous);
},
```

The UI updates instantly; if the server rejects, it rolls back transparently.

## Discord OAuth flow on web

1. User clicks "Connect Discord" on `/settings/integrations`
2. Frontend calls `GET /discord/auth-url` to get the URL
3. `window.location.href = url` redirects the whole tab
4. User authorizes on Discord
5. Backend redirects back to `/settings/integrations` (same page)
6. Page mounts, fetches connections, sees the new one

For mobile users on the web, the same flow works — the redirect handles everything.

## Production

```bash
npm run build
npm start
```

Or deploy to Vercel — `vercel --prod`. Set `NEXT_PUBLIC_API_URL` in the dashboard.
