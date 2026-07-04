import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker, { types as DocTypes } from 'react-native-document-picker';

import { copyIntoSandbox } from '../services/attachmentStorage';
import type { AttachmentKind, NoteAttachment } from '../types';

function kindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Derive a file extension from the original name, falling back to the MIME subtype. */
function deriveExt(name: string | undefined, mime: string): string {
  const fromName = name && name.includes('.') ? name.split('.').pop() : undefined;
  if (fromName) return fromName;
  const sub = mime.split('/')[1];
  return sub || 'bin';
}

/**
 * Attach-a-file flows for notes. Everything is PICK-only (no camera/mic), and
 * the picked file is copied into the app sandbox before we resolve, so the
 * returned `relativePath` is durable.
 *
 * - `pickMedia` → system photo/video picker (react-native-image-picker); best
 *   UX + rich metadata (dimensions, duration) for images and videos.
 * - `pickFile`  → system document picker (react-native-document-picker); used
 *   for audio and any other file type.
 *
 * Each resolves to a normalized `NoteAttachment`, or `null` if the user
 * cancelled or something failed (a friendly Alert is shown on real errors).
 */
export function useAttachmentPicker() {
  const [isBusy, setIsBusy] = useState(false);
  // True while a native picker is open (the app is backgrounded to it).
  const pendingRef = useRef(false);

  const setBusy = useCallback((next: boolean) => {
    pendingRef.current = next;
    setIsBusy(next);
  }, []);

  // Stuck-loader recovery. When a picker is open the OS may (under memory
  // pressure, or with "Don't keep activities" on) destroy and recreate our
  // Activity. react-native-image-picker's onActivityResult then early-returns
  // because its callback was lost, so the awaited promise NEVER resolves and
  // the UI is stuck showing a spinner with the buttons disabled forever.
  // On return to the foreground, give the normal result a beat to land, then
  // clear the orphaned busy flag so the attach buttons re-enable.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active' && pendingRef.current) {
        setTimeout(() => {
          if (pendingRef.current) setBusy(false);
        }, 1200);
      }
    });
    return () => sub.remove();
  }, [setBusy]);

  const pickMedia = useCallback(async (): Promise<NoteAttachment | null> => {
    setBusy(true);
    try {
      const res = await launchImageLibrary({
        mediaType: 'mixed', // images AND videos
        selectionLimit: 1,
        // includeExtra only adds timestamp/id (which we don't use) and on
        // some devices nudges the picker toward extra metadata permissions —
        // dimensions/duration/size come back without it. Keep it off.
        includeExtra: false,
      });
      if (res.didCancel) return null;
      if (res.errorCode) {
        Alert.alert('Could not attach', res.errorMessage ?? 'Unknown picker error.');
        return null;
      }
      const asset = res.assets?.[0];
      if (!asset?.uri) return null;

      const mime = asset.type ?? 'application/octet-stream';
      const name = asset.fileName ?? `media.${deriveExt(undefined, mime)}`;
      const relativePath = await copyIntoSandbox(asset.uri, deriveExt(asset.fileName, mime));

      return {
        relativePath,
        kind: kindFromMime(mime),
        name,
        mime,
        size: asset.fileSize ?? 0,
        durationMs:
          typeof asset.duration === 'number' ? Math.round(asset.duration * 1000) : undefined,
        width: asset.width,
        height: asset.height,
      };
    } catch (err: any) {
      Alert.alert('Could not attach', String(err?.message ?? err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [setBusy]);

  const pickFile = useCallback(async (): Promise<NoteAttachment | null> => {
    setBusy(true);
    try {
      // `copyTo: 'cachesDirectory'` gives us a stable file:// path (fileCopyUri)
      // even on Android where the raw uri is a transient content:// handle.
      const r = await DocumentPicker.pickSingle({
        type: [DocTypes.allFiles],
        copyTo: 'cachesDirectory',
      });
      const source = r.fileCopyUri ?? r.uri;
      if (!source) return null;

      const mime = r.type ?? 'application/octet-stream';
      const name = r.name ?? `file.${deriveExt(undefined, mime)}`;
      const relativePath = await copyIntoSandbox(source, deriveExt(r.name ?? undefined, mime));

      return {
        relativePath,
        kind: kindFromMime(mime),
        name,
        mime,
        size: r.size ?? 0,
      };
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) return null;
      Alert.alert('Could not attach', String(err?.message ?? err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [setBusy]);

  return { pickMedia, pickFile, isBusy };
}
