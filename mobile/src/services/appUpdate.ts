import { Alert, Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import { APP_BUILD } from '../appVersion';

// The GitHub repo whose Releases hold the built APKs. The CI workflow
// (.github/workflows/android-release.yml) publishes each build tagged
// `build-<runNumber>` with the asset named `dayplan-build-<runNumber>.apk`.
const REPO_URL = 'https://github.com/imransid/DayPlan';
const RELEASES_API =
  'https://api.github.com/repos/imransid/DayPlan/releases/latest';

interface GithubRelease {
  tag_name: string;
  name: string | null;
  body?: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

/** Extract the build number from a `build-<n>` tag (or any trailing number). */
function buildNumberFromTag(tag: string): number {
  const m = tag.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Resolve the latest release's tag WITHOUT the REST API. The web
 * `/releases/latest` route 302-redirects to `/releases/tag/<tag>`, and unlike
 * `api.github.com` it is NOT rate-limited (60 req/hr/IP) — that limit was making
 * the updater fail silently and never prompt. We read the redirected URL
 * (fetch follows redirects and exposes the final URL as `response.url`) and
 * only fall back to the API if that route doesn't yield a tag.
 */
async function resolveLatestTag(): Promise<string | null> {
  try {
    // RN's fetch follows redirects by default and sets `response.url` to the
    // final URL (…/releases/tag/<tag>).
    const res = await fetch(`${REPO_URL}/releases/latest`);
    const m = /\/releases\/tag\/([^/?#]+)/.exec(res.url || '');
    if (m) return decodeURIComponent(m[1]);
  } catch {
    // fall through to the API
  }
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const rel = (await res.json()) as GithubRelease;
      return rel.tag_name ?? null;
    }
  } catch {
    // give up below
  }
  return null;
}

/**
 * Check GitHub Releases for a newer APK and, if the user agrees, download it and
 * launch the Android system installer. Android only (iOS cannot self-install).
 *
 * @param silent when true (app-launch check), stay quiet unless an update exists.
 */
export async function checkForUpdate(
  opts: { silent?: boolean } = {},
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const tag = await resolveLatestTag();
  if (!tag) {
    if (!opts.silent) {
      Alert.alert('Update check failed', 'Couldn’t reach GitHub. Please try again later.');
    }
    return;
  }

  const latest = buildNumberFromTag(tag);
  if (!latest || latest <= APP_BUILD) {
    if (!opts.silent) {
      Alert.alert('Up to date', `You’re on the latest version (build ${APP_BUILD}).`);
    }
    return;
  }

  // Direct asset URL from the CI's known naming — no API call, no rate limit.
  const apkUrl = `${REPO_URL}/releases/download/${tag}/dayplan-build-${latest}.apk`;
  Alert.alert(
    'Update available',
    `Build ${latest} is ready.\n\nDownload and install it now?`,
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Update', onPress: () => downloadAndInstall(apkUrl) },
    ],
  );
}

async function downloadAndInstall(url: string): Promise<void> {
  try {
    const res = await RNBlobUtil.config({
      fileCache: true,
      appendExt: 'apk',
    }).fetch('GET', url);
    // Hands the downloaded APK to the OS package installer. On Android 8+ the
    // user is asked to allow "install unknown apps" for DayPlan the first time.
    await RNBlobUtil.android.actionViewIntent(
      res.path(),
      'application/vnd.android.package-archive',
    );
  } catch {
    Alert.alert('Download failed', 'Could not download the update. Try again.');
  }
}
