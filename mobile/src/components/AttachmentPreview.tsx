import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Video from 'react-native-video';

import { PressScale } from './UI';
import { AppModal } from './AppModal';
import { InlineAudioPlayer } from './InlineAudioPlayer';
import { absoluteUri } from '../services/attachmentStorage';
import { colors, glass, radius, spacing, fontSize, elevation } from '../theme';
import type { NoteAttachment } from '../types';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(n, hi));
}

/**
 * Renders a note's attachment inline, styled per kind:
 *   image → tappable thumbnail (opens a full-screen viewer)
 *   video → embedded player with native controls
 *   audio → compact glass audio player
 *   file  → a labelled file chip (extension badge + name + size)
 *
 * When `onRemove` is provided (editor context) a × button is overlaid.
 */
export function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: NoteAttachment;
  onRemove?: () => void;
}) {
  const uri = absoluteUri(attachment.relativePath);

  return (
    <View style={styles.wrap}>
      {attachment.kind === 'image' && <ImageAttachment uri={uri} attachment={attachment} />}
      {attachment.kind === 'video' && <VideoAttachment uri={uri} />}
      {attachment.kind === 'audio' && (
        <InlineAudioPlayer uri={uri} durationMs={attachment.durationMs} />
      )}
      {attachment.kind === 'file' && <FileChip attachment={attachment} />}

      {onRemove && (
        <PressScale
          onPress={onRemove}
          style={styles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
        >
          <View style={[styles.xBar, { transform: [{ rotate: '45deg' }] }]} />
          <View style={[styles.xBar, { transform: [{ rotate: '-45deg' }] }]} />
        </PressScale>
      )}
    </View>
  );
}

function ImageAttachment({ uri, attachment }: { uri: string; attachment: NoteAttachment }) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  const ratio =
    attachment.width && attachment.height
      ? clamp(attachment.width / attachment.height, 0.6, 2)
      : 4 / 3;

  // If the decode fails (missing/corrupt file, or a picker copy that landed
  // as a 0-byte file when the OS recreated the Activity mid-pick), show a
  // graceful placeholder instead of a broken image surface.
  if (failed) {
    return (
      <View style={[styles.mediaBox, styles.mediaError, { aspectRatio: ratio }]}>
        <Text style={styles.imageErrorText}>Couldn’t load this image</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setZoomed(true)} style={[styles.mediaBox, { aspectRatio: ratio }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          // Downsample during decode (Android) instead of loading the full-res
          // bitmap into memory — a large photo decoded at full size into this
          // small thumbnail box can OOM-crash on low-RAM devices.
          resizeMethod="resize"
          onError={() => setFailed(true)}
        />
      </Pressable>

      <AppModal visible={zoomed} onClose={() => setZoomed(false)} variant="full">
        <Pressable style={styles.viewerFull} onPress={() => setZoomed(false)}>
          <Image
            source={{ uri }}
            style={styles.viewerImage}
            resizeMode="contain"
            resizeMethod="resize"
            // Only close the viewer; the thumbnail already decoded fine, so
            // don't collapse it to the error placeholder too.
            onError={() => setZoomed(false)}
          />
        </Pressable>
      </AppModal>
    </>
  );
}

function VideoAttachment({ uri }: { uri: string }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[styles.mediaBox, styles.videoBox, styles.mediaError]}>
        <Text style={styles.mediaErrorText}>Couldn’t play this video</Text>
      </View>
    );
  }
  return (
    <View style={[styles.mediaBox, styles.videoBox]}>
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        controls
        paused
        resizeMode="contain"
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
      />
      {loading && (
        <View style={styles.videoLoader} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </View>
  );
}

function FileChip({ attachment }: { attachment: NoteAttachment }) {
  const ext = (attachment.name.split('.').pop() ?? 'file').slice(0, 4).toUpperCase();
  const size = formatSize(attachment.size);
  return (
    <View style={styles.chip}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{ext}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.chipName} numberOfLines={1}>
          {attachment.name}
        </Text>
        {!!size && <Text style={styles.chipMeta}>{size}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  mediaBox: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
    backgroundColor: colors.surfaceAlt,
  },
  videoBox: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.primary,
  },
  videoLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaError: { alignItems: 'center', justifyContent: 'center' },
  mediaErrorText: { color: '#fff', fontSize: fontSize.small, fontWeight: '600' },
  imageErrorText: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: '600' },
  // ── File chip ──
  chip: {
    ...glass.cardSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(99, 102, 241, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  chipName: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  chipMeta: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 },
  // ── Remove button ──
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 16, 35, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBar: {
    position: 'absolute',
    width: 13,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  // ── Full-screen image viewer (AppModal 'full' provides the dark backdrop) ──
  viewerFull: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
});
