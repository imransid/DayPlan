import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Input, PressScale } from '../../components/UI';
import { colors, spacing, radius, elevation, motion } from '../../theme';
import type {
  MockActionResult,
  MockRouteProgress,
  MockRouteTarget,
  RouteEndBehaviour,
} from '../../services/mockLocation';
import type { SavedPlace } from '../../services/mockLocationStorage';

const stagger = (i: number) => FadeInDown.duration(motion.base).delay(i * 45);

const END_BEHAVIOURS: Array<{ value: RouteEndBehaviour; label: string; hint: string }> = [
  { value: 'STOP', label: 'Stop', hint: 'Hold at the destination' },
  { value: 'LOOP', label: 'Loop', hint: 'Start over from the beginning' },
  { value: 'PING_PONG', label: 'Return', hint: 'Turn around and drive back' },
];

/** Same rule as the static tab: reject rather than clamp. */
function parseCoord(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < -max || value > max) return null;
  return value;
}

function formatEta(ms: number | null): string {
  if (ms == null) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDistance(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(2)} km`
    : `${Math.round(metres)} m`;
}

interface Props {
  places: SavedPlace[];
  progress: MockRouteProgress | null;
  isRunning: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  startRoute: (target: MockRouteTarget) => Promise<MockActionResult>;
  pauseRoute: () => Promise<MockActionResult>;
  resumeRoute: () => Promise<MockActionResult>;
  stop: () => Promise<MockActionResult>;
  showResult: (result: MockActionResult) => void;
}

/**
 * Route mode, kept in its own file so the static layout stays exactly as it was
 * — that's the path already verified on device.
 *
 * Geometry is a straight great-circle line generated natively from the two
 * endpoints; road routing arrives later and changes nothing here.
 */
export function RouteMode({
  places,
  progress,
  isRunning,
  busy,
  setBusy,
  startRoute,
  pauseRoute,
  resumeRoute,
  stop,
  showResult,
}: Props) {
  const [startLat, setStartLat] = useState('');
  const [startLng, setStartLng] = useState('');
  const [endLat, setEndLat] = useState('');
  const [endLng, setEndLng] = useState('');
  const [speedKmh, setSpeedKmh] = useState('50');
  const [endBehaviour, setEndBehaviour] = useState<RouteEndBehaviour>('STOP');
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);

  const parsed = useMemo<MockRouteTarget | null>(() => {
    const sLat = parseCoord(startLat, 90);
    const sLng = parseCoord(startLng, 180);
    const eLat = parseCoord(endLat, 90);
    const eLng = parseCoord(endLng, 180);
    const speed = Number(speedKmh.trim());
    if (sLat == null || sLng == null || eLat == null || eLng == null) return null;
    if (!Number.isFinite(speed) || speed <= 0) return null;
    return {
      startLatitude: sLat,
      startLongitude: sLng,
      endLatitude: eLat,
      endLongitude: eLng,
      speedKmh: speed,
      endBehaviour,
      label: 'En route',
    };
  }, [startLat, startLng, endLat, endLng, speedKmh, endBehaviour]);

  const applyPlace = useCallback(
    (place: SavedPlace) => {
      const lat = String(place.latitude);
      const lng = String(place.longitude);
      if (picking === 'start') {
        setStartLat(lat);
        setStartLng(lng);
      } else if (picking === 'end') {
        setEndLat(lat);
        setEndLng(lng);
      }
      setPicking(null);
    },
    [picking],
  );

  const handleStart = useCallback(async () => {
    if (!parsed) {
      Alert.alert(
        'Check the route',
        'Both points need a valid latitude and longitude, and the speed must be above 0.',
      );
      return;
    }
    setBusy(true);
    try {
      showResult(await startRoute(parsed));
    } finally {
      setBusy(false);
    }
  }, [parsed, setBusy, showResult, startRoute]);

  const handlePauseResume = useCallback(async () => {
    setBusy(true);
    try {
      showResult(progress?.paused ? await resumeRoute() : await pauseRoute());
    } finally {
      setBusy(false);
    }
  }, [progress?.paused, pauseRoute, resumeRoute, setBusy, showResult]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      showResult(await stop());
    } finally {
      setBusy(false);
    }
  }, [setBusy, showResult, stop]);

  return (
    <>
      {isRunning && progress ? (
        <Animated.View entering={stagger(0)} style={[styles.card, styles.progressCard]}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressPercent}>
              {Math.round(progress.fraction * 100)}%
            </Text>
            <Text style={styles.progressState}>
              {progress.finished
                ? 'Arrived'
                : progress.paused
                ? 'Paused'
                : progress.reversed
                ? 'Returning'
                : 'Driving'}
            </Text>
          </View>

          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                { width: `${Math.max(0, Math.min(100, progress.fraction * 100))}%` },
              ]}
            />
          </View>

          <View style={styles.metrics}>
            <Metric label="REMAINING" value={formatDistance(progress.metresRemaining)} />
            <Metric label="ETA" value={progress.finished ? '—' : formatEta(progress.etaMs)} />
            <Metric
              label="SPEED"
              value={`${Math.round(progress.speedMps * 3.6)} km/h`}
            />
          </View>

          <Text style={styles.coords}>
            {progress.latitude.toFixed(5)}, {progress.longitude.toFixed(5)} ·{' '}
            {Math.round(progress.bearingDegrees)}°
          </Text>
        </Animated.View>
      ) : null}

      <Animated.Text entering={stagger(1)} style={styles.sectionLabel}>
        START
      </Animated.Text>
      <Animated.View entering={stagger(2)}>
        <CoordPair
          lat={startLat}
          lng={startLng}
          onLat={setStartLat}
          onLng={setStartLng}
          disabled={isRunning}
        />
        <Pressable onPress={() => setPicking(picking === 'start' ? null : 'start')} hitSlop={8}>
          <Text style={styles.linkText}>
            {picking === 'start' ? 'Cancel' : 'Pick from saved places'}
          </Text>
        </Pressable>
      </Animated.View>

      <Animated.Text entering={stagger(3)} style={styles.sectionLabel}>
        DESTINATION
      </Animated.Text>
      <Animated.View entering={stagger(4)}>
        <CoordPair
          lat={endLat}
          lng={endLng}
          onLat={setEndLat}
          onLng={setEndLng}
          disabled={isRunning}
        />
        <Pressable onPress={() => setPicking(picking === 'end' ? null : 'end')} hitSlop={8}>
          <Text style={styles.linkText}>
            {picking === 'end' ? 'Cancel' : 'Pick from saved places'}
          </Text>
        </Pressable>
      </Animated.View>

      {picking && (
        <Animated.View entering={stagger(5)}>
          {places.length === 0 ? (
            <Text style={styles.noneText}>
              No saved places yet — add one from the Static tab.
            </Text>
          ) : (
            places.map((place) => (
              <PressScale
                key={place.id}
                onPress={() => applyPlace(place)}
                scaleTo={0.98}
                style={styles.placeRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  <Text style={styles.placeCoords}>
                    {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                  </Text>
                </View>
                <Text style={styles.linkText}>
                  Use as {picking === 'start' ? 'start' : 'destination'}
                </Text>
              </PressScale>
            ))
          )}
        </Animated.View>
      )}

      <Animated.Text entering={stagger(6)} style={styles.sectionLabel}>
        SPEED
      </Animated.Text>
      <Animated.View entering={stagger(7)}>
        <Input
          label="KM/H"
          value={speedKmh}
          onChangeText={setSpeedKmh}
          keyboardType="numeric"
          placeholder="50"
          editable={!isRunning}
        />
        <Text style={styles.hint}>
          Eased over the first and last 50 m rather than starting and stopping
          dead. Road-timed speed arrives with real routing.
        </Text>
      </Animated.View>

      <Animated.Text entering={stagger(8)} style={styles.sectionLabel}>
        AT THE DESTINATION
      </Animated.Text>
      <Animated.View entering={stagger(9)} style={styles.segmented}>
        {END_BEHAVIOURS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => setEndBehaviour(option.value)}
            disabled={isRunning}
            style={[
              styles.segment,
              endBehaviour === option.value && styles.segmentActive,
              isRunning && endBehaviour !== option.value && { opacity: 0.35 },
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                endBehaviour === option.value && styles.segmentLabelActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
      <Text style={styles.hint}>
        {END_BEHAVIOURS.find((o) => o.value === endBehaviour)?.hint}
      </Text>

      <Animated.View entering={stagger(10)} style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {isRunning ? (
          <>
            <Button
              label={progress?.paused ? 'Resume' : 'Pause'}
              variant="secondary"
              loading={busy}
              onPress={handlePauseResume}
            />
            <Button
              label="Stop simulating"
              variant="primary"
              loading={busy}
              onPress={handleStop}
              style={styles.stopButton}
            />
          </>
        ) : (
          <Button
            label="Start driving"
            variant="accent"
            loading={busy}
            onPress={handleStart}
          />
        )}
      </Animated.View>
    </>
  );
}

function CoordPair({
  lat,
  lng,
  onLat,
  onLng,
  disabled,
}: {
  lat: string;
  lng: string;
  onLat: (v: string) => void;
  onLng: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Input
          label="LATITUDE"
          value={lat}
          onChangeText={onLat}
          keyboardType="numeric"
          placeholder="51.5074"
          autoCorrect={false}
          editable={!disabled}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Input
          label="LONGITUDE"
          value={lng}
          onChangeText={onLng}
          keyboardType="numeric"
          placeholder="-0.1278"
          autoCorrect={false}
          editable={!disabled}
        />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },

  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: spacing.lg,
  },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 4 },
  linkText: { fontSize: 13, color: colors.accent, fontWeight: '700', marginTop: 4 },
  noneText: { color: colors.textMuted, fontSize: 14, marginVertical: 8 },

  card: {
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    gap: 10,
    ...elevation.sm,
  },
  progressCard: {
    backgroundColor: colors.dangerBg,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressPercent: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  progressState: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', borderRadius: 3, backgroundColor: colors.danger },

  metrics: { flexDirection: 'row', gap: spacing.md },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  coords: { fontSize: 12, color: colors.textMuted },

  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.surfaceStrong, ...elevation.sm },
  segmentLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentLabelActive: { color: colors.textPrimary },

  stopButton: { backgroundColor: colors.danger },

  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    ...elevation.sm,
  },
  placeName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  placeCoords: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
