# System-wide mock location (Android)

> **Status: in progress.** Setup instructions, tested-device matrix and the full
> known-limitations list land with step 5. What follows is the device checklist
> the native layer has to survive, written down now so nothing gets verified by
> vibes later.

Placed under `mobile/docs/` rather than a repo-root `docs/` because the feature
is entirely inside the app; the repo root has no `docs/` directory today.

## How this works, in one paragraph

DayPlan registers itself as a test location provider through the platform's
documented `LocationManager.addTestProvider` API and re-pushes a fix about once
a second from a `location`-typed foreground service. The user must opt in twice:
grant precise location + notifications, and select DayPlan under **Developer
Options → Select mock location app**. Nothing here hides the mock from apps that
check for it — `Location.isMock()` stays true, by design.

## Route mode: session clock and recovery

Route position is a pure function of elapsed time (see `FixSource`). That makes
"what is the clock baseline?" the only state that matters, and it has to survive
three different interruptions. The rules below were decided before route code
was written, because getting them wrong is silent — the user just ends up in the
wrong place.

### Sticky restart (process killed, service restarted)

**Restore the clock baseline. Do not restart the route, and do not persist
progress per tick.**

`sessionStartRealtime` and `System.currentTimeMillis()` are written **once**, at
session start, next to the rest of the session record. Recovery restores
`sessionStartRealtime` verbatim, so position is wherever the elapsed time says —
the route kept driving while we were dead.

Rejected alternative: periodically persisting travelled distance. It would make
recovery seamless, but it costs a disk write on every tick and introduces a
second source of truth that can disagree with the clock. That is the accumulator
problem wearing a different hat.

Consequences, accepted deliberately:

- A brief death (the common case — START_STICKY restarts are usually seconds)
  produces a small forward jump, not a restart from zero.
- A long death can land past the destination. The route is then finished and the
  end-of-route behaviour applies, which is the correct outcome rather than a
  special case.

Note the bug this exists to prevent: `startSession` rebases the clock to zero
and START_STICKY recovery goes through `startSession`. Without an explicit
restore path, process death teleports the user back to the route's start.

### Reboot

`SystemClock.elapsedRealtime()` resets to ~0 on boot, so a stored baseline that
is **greater than the current elapsed realtime** proves a reboot happened. Route
through the existing boot-interrupted path: clear the session, post the
dismissible notice, never auto-resume. `System.currentTimeMillis()` is stored
alongside only as a cross-check; it is not the baseline, because it moves under
NTP corrections and manual clock changes.

### Explicit pause

**Pause stores travelled distance, not elapsed time.** Resume converts that
distance back to an elapsed value under the *currently selected* speed model and
rebases:

```
startRealtime = elapsedRealtime() - elapsedForDistance(travelled)
```

Storing distance rather than time is what makes changing the speed model while
paused preserve *position*. Storing elapsed time instead would keep the clock
and move the car.

The two choices differ because the interruptions differ: pause is user-intent
and may straddle a settings change, sticky recovery is involuntary and must not
cost per-tick I/O.

### Route file lifetime

Route points live in `filesDir/mock-route-<sessionId>.json`, too large for
SharedPreferences, which holds only the session id, the clocks and the settings.
The file is deleted on stop, and stale files are swept at process start in
`MainApplication.onCreate()` alongside the orphan-provider sweep — same
reasoning: a crash must not leave debris that only a visit to the feature screen
would clear.

## Device checklist

Nothing below has been run yet. Every box needs a real device; the emulator's
location stack does not reproduce OEM behaviour.

### Core

- [ ] Select DayPlan under Developer Options → "Select mock location app".
      **Verify DayPlan actually appears in that list.** AOSP's Settings
      `AppPicker` filters it to packages declaring `ACCESS_MOCK_LOCATION`, which
      is the only reason we declare a permission we can never hold. If DayPlan
      appears without it, the declaration can be dropped.
- [ ] Start a session targeting London. Google Maps' blue dot sits in London.
- [ ] WhatsApp → attach → Location offers London.
- [ ] Facebook check-in suggests London places.
- [ ] Background DayPlan (home button, then open other apps for 5+ minutes).
      The fix does not drift back to the real location.
- [ ] Screen off for 10+ minutes, then re-check. This is what the partial wake
      lock is for; without it the injection Handler stops firing in Doze.
- [ ] `stop()` restores the real GPS:
      `adb shell dumpsys location | grep -A5 "test provider"` shows none.

### Teardown and recovery

- [ ] **Force-stop DayPlan mid-session** (Settings → Apps → DayPlan → Force
      stop), then `adb shell dumpsys location`.

      Test providers are registered in `system_server`, not in our process, so
      they may well survive the kill. If `dumpsys` still lists them, the device
      keeps reporting the fake fix with the notification gone and no UI anywhere
      to stop it.

      **If they survive, the only recovery is relaunching DayPlan.** Nothing
      else clears them: force-stop also puts the app in the "stopped" state, so
      the boot receiver will not fire, and no background path runs.

      The sweep happens in two places, deliberately:

      1. `MainApplication.onCreate()` — unconditional, on process start. This is
         the one that makes "just relaunch the app" true.
      2. `MockLocationModule`'s init block — when the TurboModule is
         constructed.

      Only (2) existed at first, and it was not enough: TurboModules are built
      lazily, so that sweep did not run until JS imported the spec. Recovery
      then meant "reopen the app *and* reach the mock-location screen", which
      makes a safety net depend on the JS import graph. Keep (1) even if (2)
      appears to cover it in practice.

      Record the actual observed behaviour here, per Android version.

- [ ] Swipe DayPlan away from Recents mid-session, then `dumpsys location`.
      Expected to behave like force-stop; confirm.
- [ ] Kill the app mid-session, relaunch, and confirm the sweep clears the
      leftovers and the status reads `READY` rather than `RUNNING`. Check
      `dumpsys location` *before* opening the mock-location screen — the
      `MainApplication.onCreate()` sweep should already have cleared it.
- [ ] Reboot mid-session. Expect: no auto-resume, session cleared, and a
      dismissible "tap to resume" notification.

- [ ] **Force-stop mid-route, then relaunch and start the route again.** Confirm
      it resumes at the position the elapsed time implies rather than erroring
      out with "route data is missing".

      This guards a regression that shipped once: the process-start sweep in
      `MainApplication.onCreate()` deleted *every* route file, and
      `Application.onCreate()` runs before any Service in the process — so on a
      START_STICKY restart the file was gone before `recoverRouteSession` could
      read it, and recovery failed every single time, in exactly the scenario it
      was written for. The sweep now preserves the file belonging to a session
      still marked active.

- [ ] Let a STOP route arrive, then watch the notification for a minute. It
      should post "Arrived" once and then stay put. (It previously re-posted
      every second: the arrival sentinel `-1` made the 10s throttle comparison
      true on every tick.)

- [ ] Ping-pong route: on the return leg the progress bar should still count
      *up* while the distance remaining counts *down*, with the direction shown
      separately. Both are measured along the leg being driven, not the
      underlying geometry.

### Permission edge cases

- [ ] Deny POST_NOTIFICATIONS, then try to start. Expect a hard failure with
      `E_MOCK_NOTIFICATIONS`, not a silently invisible session. Note that anyone
      who declined the hourly-alarm prompt already has this denied, since
      notifee only requests it inside the alarm flow.
- [ ] Grant POST_NOTIFICATIONS but turn DayPlan's notifications off entirely in
      system settings, then try to start. Expect `E_MOCK_NOTIFICATIONS` with the
      *blocked* message pointing at notification settings — re-prompting for the
      permission does nothing in this state.
- [ ] Grant POST_NOTIFICATIONS, then set the "Simulated location" channel to
      `IMPORTANCE_NONE` (long-press the notification → turn the category off),
      and try to start. Same expectation. `startForeground` succeeds while
      displaying nothing, which is the exact failure this gate exists to catch.
- [ ] Revoke "Select mock location app" *while a session is running*. Expect the
      session to stop itself and report `NOT_SELECTED`.
- [ ] Revoke precise location while running. Expect a clean stop.

### Per-provider

- [ ] Check which of `gps` / `network` / `fused` actually registered:
      `adb shell dumpsys location | grep -i "mock\|test"`. `fused` is
      best-effort — on some OEM builds Play Services owns it and
      `addTestProvider` rejects it. Record which devices reject it.

## Tested devices

| Device | Android | gps | network | fused | Notes |
| ------ | ------- | --- | ------- | ----- | ----- |
| _(none yet)_ | | | | | |
