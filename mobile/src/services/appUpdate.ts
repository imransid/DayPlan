import { Alert, Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import { APP_BUILD } from '../appVersion';

// The GitHub repo whose Releases hold the built APKs. The CI workflow
// (.github/workflows/android-release.yml) publishes each build here tagged
// `build-<runNumber>` with app-release.apk attached.
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
 * Check GitHub Releases for a newer APK and, if the user agrees, download it and
 * launch the Android system installer. Android only (iOS cannot self-install).
 *
 * @param silent when true (app-launch check), stay quiet unless an update exists.
 */
export async function checkForUpdate(
  opts: { silent?: boolean } = {},
): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const release: GithubRelease = await res.json();

    const latest = buildNumberFromTag(release.tag_name);
    if (latest <= APP_BUILD) {
      if (!opts.silent) {
        Alert.alert('Up to date', 'You’re on the latest version.');
      }
      return;
    }

    const apk = release.assets.find((a) => a.name.endsWith('.apk'));
    if (!apk) return;

    Alert.alert(
      'Update available',
      `${release.name || release.tag_name}\n\nDownload and install the latest build?`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Update', onPress: () => downloadAndInstall(apk.browser_download_url) },
      ],
    );
  } catch {
    if (!opts.silent) {
      Alert.alert('Update check failed', 'Please try again later.');
    }
  }
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
