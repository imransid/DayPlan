import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
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

  const pickMedia = useCallback(async (): Promise<NoteAttachment | null> => {
    setIsBusy(true);
    try {
      const res = await launchImageLibrary({
        mediaType: 'mixed', // images AND videos
        selectionLimit: 1,
        includeExtra: true,
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
      setIsBusy(false);
    }
  }, []);

  const pickFile = useCallback(async (): Promise<NoteAttachment | null> => {
    setIsBusy(true);
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
      setIsBusy(false);
    }
  }, []);

  return { pickMedia, pickFile, isBusy };
}
