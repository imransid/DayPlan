import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Video, { type VideoRef } from 'react-native-video';

import { PressScale } from './UI';
import { colors, glass, radius, spacing, fontSize } from '../theme';

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Compact glass audio player for a note attachment. We reuse react-native-video
 * as the audio engine (one media dependency for both audio and video); the
 * <Video> surface is collapsed to 0×0 since audio has no picture, and playback
 * is driven imperatively via the ref + progress callbacks.
 */
export function InlineAudioPlayer({
  uri,
  durationMs,
}: {
  uri: string;
  durationMs?: number;
}) {
  const ref = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(true);
  const [pos, setPos] = useState(0); // seconds
  const [dur, setDur] = useState(durationMs ? durationMs / 1000 : 0);
  const [barWidth, setBarWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  const progress = dur > 0 ? Math.min(pos / dur, 1) : 0;

  const onBarLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);
  const onSeek = (e: { nativeEvent: { locationX: number } }) => {
    if (dur <= 0 || barWidth <= 0) return;
    const frac = Math.max(0, Math.min(e.nativeEvent.locationX / barWidth, 1));
    const target = frac * dur;
    ref.current?.seek(target);
    setPos(target);
  };

  return (
    <View style={styles.container}>
      {/* Audio engine — no visible surface. */}
      <Video
        ref={ref}
        source={{ uri }}
        paused={paused}
        style={styles.hiddenVideo}
        playInBackground={false}
        ignoreSilentSwitch="ignore"
        onLoad={(d) => setDur(d.duration)}
        onProgress={(p) => setPos(p.currentTime)}
        onEnd={() => {
          setPaused(true);
          setPos(0);
          ref.current?.seek(0);
        }}
        onError={() => {
          setPaused(true);
          setFailed(true);
        }}
      />

      <PressScale
        onPress={() => setPaused((p) => !p)}
        style={[styles.playBtn, failed && styles.playBtnDisabled]}
        disabled={failed}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play audio' : 'Pause audio'}
      >
        {paused ? <PlayGlyph /> : <PauseGlyph />}
      </PressScale>

      <View style={styles.right}>
        {failed ? (
          <Text style={styles.errorText}>Couldn’t play this audio</Text>
        ) : (
          <>
            <Pressable style={styles.track} onPress={onSeek} onLayout={onBarLayout}>
              <View style={styles.trackBase} />
              <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
            </Pressable>
            <Text style={styles.time}>
              {fmt(pos)} / {fmt(dur)}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function PlayGlyph() {
  return <View style={styles.playTriangle} />;
}
function PauseGlyph() {
  return (
    <View style={styles.pauseRow}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...glass.cardSoft,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  hiddenVideo: { width: 0, height: 0 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnDisabled: { backgroundColor: colors.textDisabled },
  errorText: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
  },
  pauseRow: { flexDirection: 'row', gap: 4 },
  pauseBar: { width: 4, height: 15, borderRadius: 1.5, backgroundColor: '#fff' },
  right: { flex: 1, gap: 8 },
  track: { height: 20, justifyContent: 'center' },
  trackBase: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  time: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
