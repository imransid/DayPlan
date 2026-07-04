# Android release + auto-update — one-time setup

CI (`.github/workflows/android-release.yml`) builds a **release-signed** APK on
every push to `main` and publishes it to **GitHub Releases** as `build-<n>`. The
installed app checks that release on launch and offers a one-tap update
(`mobile/src/services/appUpdate.ts`) — so you never build or sideload manually
again.

You only have to do this **once**.

## 1. Generate an upload keystore (do this locally, keep it forever)

```bash
keytool -genkeypair -v \
  -keystore dayplan-upload.keystore \
  -alias dayplan-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=DayPlan, OU=Mobile, O=DayPlan, C=US"
# choose a store password + key password when prompted (they can be the same)
```

> ⚠️ **Back this file + passwords up permanently** (password manager / private
> drive). If you lose them you can **never** ship an update that installs over
> the app — every user would have to uninstall + reinstall. Do **not** commit it.

## 2. Add GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i dayplan-upload.keystore` (on macOS add `\| pbcopy` to copy) |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_ALIAS` | `dayplan-upload` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

## 3. First install (one-time signature switch)

The app currently on your phone is **debug-signed**. The first release-signed
build has a different signature, so Android won't install it *over* the existing
app. **Uninstall the current DayPlan once**, then install the first CI build.
After that, every future update installs seamlessly.

On the phone, allow **"Install unknown apps"** for DayPlan the first time it
downloads an update.

## 4. That's it

Push to `main` → Actions builds & signs → a new Release appears → your phone
offers the update on next launch.

- Local dev builds are unaffected: `assembleRelease` without the keystore props
  still debug-signs (`android/app/build.gradle`).
- The New-Architecture build is slow (~30–45 min in CI). It only runs on `main`
  pushes (or manual dispatch), not every feature-branch commit.

## Phase 2 (optional): instant OTA for JS-only changes

Most changes are JavaScript (no new native module) and could update **with no
install at all** via OTA. Recommended: **hot-updater** (open-source) with a
**Cloudflare R2** bucket. It ships the Hermes JS bundle OTA; the app pulls it on
next launch. Requires adding the `@hot-updater` native module (one more APK
rebuild) + an R2 bucket + CI publish step. Ask and I'll wire it up.
