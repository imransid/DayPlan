// The build number this JS bundle was shipped with. CI (the android-release
// workflow) overwrites the 0 with the GitHub run number right before it bundles
// the release APK, so the running app can compare itself to the latest release.
// Local/dev builds stay 0 (the updater treats any published build as "newer",
// which is fine for dev — it just means the check offers the latest CI build).
export const APP_BUILD = 0;
