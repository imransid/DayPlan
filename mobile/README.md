# DayPlan Mobile

**React Native CLI** (not Expo) + Redux Toolkit + RTK Query + React Navigation.

## Prerequisites

- Node 18+
- For iOS: macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`)
- For Android: Android Studio, JDK 17, Android SDK 34

Full RN environment setup: https://reactnative.dev/docs/set-up-your-environment

## Setup

This folder contains the JS/TS source files. To bootstrap the native iOS and Android projects, you have two options:

### Option A — Init fresh, then copy in source (recommended)

```bash
# 1. Init a new RN CLI project elsewhere
npx @react-native-community/cli@latest init DayPlanApp --version 0.74.1

# 2. Replace its source files with this folder's:
cp -r src App.tsx index.js app.json babel.config.js metro.config.js tsconfig.json /path/to/DayPlanApp/

# 3. Use this folder's package.json (or merge dependencies)
cp package.json /path/to/DayPlanApp/

# 4. Install
cd /path/to/DayPlanApp
npm install
cd ios && pod install && cd ..

# 5. Apply native configs (see ANDROID_SETUP.md and IOS_SETUP.md)

# 6. Run
npm run ios       # iOS simulator
npm run android   # Android emulator
```

### Option B — Use this folder directly

This requires you to add the `android/` and `ios/` native folders. Run:

```bash
npx @react-native-community/cli@latest init DayPlanTemp --version 0.74.1
mv DayPlanTemp/android DayPlanTemp/ios .
rm -rf DayPlanTemp

npm install
cd ios && pod install && cd ..
```

Then follow `ANDROID_SETUP.md` and `IOS_SETUP.md` for native config.

## Architecture

- **Redux Toolkit** — `store/store.ts` combines slices, persists `auth` to AsyncStorage
- **RTK Query** — `store/api/api.ts` is the single API surface; hooks auto-generated
- **React Navigation** — `RootNavigator` switches between auth and main based on token
- **Deep linking** — `dayplan://` scheme. After Discord OAuth, backend redirects to `dayplan://discord-connected` which lands on Integrations
- **Notifications** — `services/notifications.ts` uses `@notifee/react-native` (modern, well-maintained alternative to expo-notifications)
- **OAuth in-app browser** — `react-native-inappbrowser-reborn` opens ASWebAuthenticationSession (iOS) / Custom Tab (Android), which forward the deep link back automatically

## Native dependencies

These all require pod install (iOS) and Gradle sync (Android):

| Package | What it does |
|---------|--------------|
| `@notifee/react-native` | Local push notifications, channels, scheduled triggers |
| `react-native-inappbrowser-reborn` | OAuth flow with auto-redirect |
| `react-native-localize` | Get device timezone for end-of-day cron |
| `@react-native-async-storage/async-storage` | Token + state persistence |
| `react-native-gesture-handler` | Required by React Navigation |
| `react-native-reanimated` | Required by React Navigation, animations |
| `react-native-safe-area-context` | Notch handling |
| `react-native-screens` | Native screen primitives |

## State management pattern

```
Component
   ↓ useGetTasksQuery() ─→ RTK Query cache
   ↓                       ↓
   ├─ data: Task[]         (auto-refetched on focus, network change)
   ├─ isLoading
   └─ refetch()

Component
   ↓ useToggleTaskMutation() ─→ optimistic update ─→ UI flips instantly
                                                  ↓
                                                  network call
                                                  ↓ success: confirm
                                                  ↓ failure: rollback
```

The `auth` slice is the only persisted slice. Tasks/connections live in RTK Query cache, invalidated by tags.

## Discord OAuth UX

1. User taps "Connect Discord" on Integrations screen
2. App calls `useLazyGetDiscordAuthUrlQuery` to fetch URL
3. `InAppBrowser.openAuth(url, 'dayplan://discord-connected')` opens secure browser session
4. User authorizes on Discord → backend redirects to `dayplan://discord-connected?guild=...`
5. The browser session detects the redirect URL and closes automatically
6. The promise resolves with `type: 'success'` → app refetches connections
7. Picker is shown with the new server's channels

## Files

```
mobile/
├── App.tsx                          # Root component with providers
├── index.js                         # Entry point (registers App)
├── app.json                         # name + displayName
├── package.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── ANDROID_SETUP.md                 # native Android config steps
├── IOS_SETUP.md                     # native iOS config steps
└── src/
    ├── config.ts                    # API URL, deep link scheme
    ├── theme/                       # colors, spacing, radius
    ├── types/                       # shared TS types
    ├── components/UI.tsx            # Button, Input, Card, etc.
    ├── services/notifications.ts    # Notifee scheduling
    ├── store/
    │   ├── store.ts                 # Redux store + persist
    │   ├── hooks.ts                 # Typed dispatch/selector
    │   ├── slices/authSlice.ts
    │   └── api/api.ts               # RTK Query — all endpoints
    ├── navigation/
    │   ├── RootNavigator.tsx        # Auth vs Main switch + deep links
    │   ├── AuthNavigator.tsx
    │   ├── MainNavigator.tsx
    │   └── types.ts
    └── screens/
        ├── auth/                    # Welcome, SignUp, SignIn
        ├── home/HomeScreen.tsx      # Today's tasks
        ├── history/HistoryScreen.tsx
        ├── settings/SettingsScreen.tsx
        └── integrations/            # Discord OAuth, ChannelManager, ChannelPicker
```

## Production build

### Android (release APK)

```bash
cd android
./gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

For Play Store, use AAB:
```bash
./gradlew bundleRelease
# AAB at android/app/build/outputs/bundle/release/app-release.aab
```

### iOS (App Store)

Open `ios/dayplan.xcworkspace` in Xcode, choose "Any iOS Device", Product → Archive. Upload via Organizer.

## Troubleshooting

**`Unable to resolve module @notifee/react-native`**
→ Run `cd ios && pod install`. On Android, do `./gradlew clean` then rebuild.

**Deep link doesn't return to app on iOS**
→ Verify `CFBundleURLSchemes` in Info.plist matches `dayplan`. Check that `InAppBrowser.openAuth` is being awaited.

**Android emulator can't reach backend**
→ Use `http://10.0.2.2:3000` not `localhost`. The `config.ts` does this automatically via `Platform.select`.

**Notifications not appearing on Android 13+**
→ User must explicitly grant POST_NOTIFICATIONS permission. `notifee.requestPermission()` triggers the system dialog.
