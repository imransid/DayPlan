import RNBlobUtil from 'react-native-blob-util';

/**
 * On-device attachment storage for notes.
 *
 * Picked files arrive as transient URIs (a cache path, or an Android
 * `content://` that the picker already copied to a `file://` cache path for
 * us). We copy the bytes into a managed folder under the app's DocumentDir so
 * they survive app restarts, and we store only the RELATIVE path in redux
 * (absolute iOS container paths change across reinstalls/OS updates). The
 * displayable `file://` URI is rebuilt from the relative path at render time.
 */
const DOCS = RNBlobUtil.fs.dirs.DocumentDir;
const SUBDIR = 'notes_attachments';
const DIR_ABS = `${DOCS}/${SUBDIR}`;

/** blob-util's fs works with plain filesystem paths, not `file://` URIs. */
function toFsPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace('file://', ''));
  }
  if (uri.startsWith('content://')) {
    // blob-util's fs.cp can't read a `content://` handle. The pickers are
    // configured to hand us a copied `file://` path (image-picker copies to
    // cache; document-picker via copyTo), so reaching here means that copy
    // didn't happen — fail loudly instead of writing an unreadable file.
    throw new Error('Unsupported content:// source — the picker did not provide a file copy');
  }
  return uri;
}

function sanitizeExt(ext: string): string {
  const clean = (ext || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return clean || 'bin';
}

async function ensureDir(): Promise<void> {
  const exists = await RNBlobUtil.fs.exists(DIR_ABS);
  if (!exists) {
    await RNBlobUtil.fs.mkdir(DIR_ABS);
  }
}

/**
 * Copy a picked file into the sandbox. Returns the path RELATIVE to DocumentDir
 * (this is what gets persisted in the note).
 */
export async function copyIntoSandbox(sourceUri: string, ext: string): Promise<string> {
  await ensureDir();
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `att_${Date.now()}_${rand}.${sanitizeExt(ext)}`;
  const destAbs = `${DIR_ABS}/${filename}`;
  await RNBlobUtil.fs.cp(toFsPath(sourceUri), destAbs);
  return `${SUBDIR}/${filename}`;
}

/** Rebuild the displayable `file://` URI for Image/Video/etc. from a stored relative path. */
export function absoluteUri(relativePath: string): string {
  return `file://${DOCS}/${relativePath}`;
}

/** Best-effort delete of a stored attachment. Never throws (cleanup is non-critical). */
export async function removeAttachment(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    const abs = `${DOCS}/${relativePath}`;
    if (await RNBlobUtil.fs.exists(abs)) {
      await RNBlobUtil.fs.unlink(abs);
    }
  } catch {
    // Orphaned file at worst; not worth surfacing to the user.
  }
}
