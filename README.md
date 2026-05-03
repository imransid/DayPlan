# DayPlan — Full Stack

Daily task planner with hourly reminders and auto-posting to Discord, Slack, Telegram.

## Architecture

```
dayplan/
├── backend/    NestJS + CQRS + Prisma + PostgreSQL
├── mobile/     React Native CLI (NOT Expo) + Redux Toolkit
└── web/        Next.js 14 (App Router) + Tailwind
```

## Quick start

### 1. Database

```bash
docker compose up -d db   # Postgres on localhost:5432
```

### 2. Backend

```bash
cd backend
cp .env.example .env  # fill in JWT_SECRET, DISCORD_*
npm install
npx prisma migrate dev --name init
npm run start:dev
# → http://localhost:3000  (Swagger at /docs)
```

### 3. Mobile (React Native CLI)

```bash
cd mobile
# See mobile/README.md for full setup — requires native Android/iOS bootstrap
npm install
cd ios && pod install && cd ..    # iOS only
npm run ios       # or
npm run android
```

### 4. Web

```bash
cd web
cp .env.example .env  # set NEXT_PUBLIC_API_URL
npm install
npm run dev
# → http://localhost:3001
```

## Discord bot setup

1. Go to https://discord.com/developers/applications
2. New Application → name it "DayPlan"
3. Bot tab → Add Bot → copy token → set as `DISCORD_BOT_TOKEN` in backend/.env
4. OAuth2 tab → copy Client ID and Secret → set as `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
5. OAuth2 → Redirects → add `http://localhost:3000/auth/discord/callback`
6. Bot → Permissions → Send Messages, Read Message History

## What's where

- **Auth**: JWT-based, in `backend/src/auth/`
- **Tasks CRUD**: CQRS, in `backend/src/tasks/`
- **Discord integration**: bot OAuth + multi-channel posting, in `backend/src/discord/`
- **Cron scheduler**: end-of-day posting, in `backend/src/scheduler/`
- **Mobile state**: Redux Toolkit + RTK Query in `mobile/src/store/`
- **Web auth**: Zustand + middleware, in `web/`

See each subfolder's README for details.

## Why React Native CLI instead of Expo

- Direct access to native code when you need it (custom modules, native SDKs)
- No Expo-specific build pipeline; fully standard Android Gradle / iOS Xcode
- Smaller app size; no Expo runtime overhead
- More flexibility for production builds and CI/CD

The trade-off: setup is heavier (CocoaPods, Android SDK, JDK). For a serious app shipping to stores, that's worth it.
