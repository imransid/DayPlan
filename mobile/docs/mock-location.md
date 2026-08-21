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
