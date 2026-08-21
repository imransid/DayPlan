import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Input, PressScale } from '../../components/UI';
import { ChevronLeftIcon } from '../../components/Icon';
import { colors, spacing, radius, elevation, motion } from '../../theme';
import { useMockLocation } from '../../hooks/useMockLocation';
import {
  isIgnoringBatteryOptimizations,
  openAppSettings,
  openDeveloperOptions,
  openNotificationSettings,
  requestIgnoreBatteryOptimizations,
  type MockActionResult,
  type MockStatus,
} from '../../services/mockLocation';
import {
  createPlaceId,
  type SavedPlace,
} from '../../services/mockLocationStorage';
import { RouteMode } from './RouteMode';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'MockLocation'>;

const stagger = (i: number) => FadeInDown.duration(motion.base).delay(i * 45);

/** Accepts "51.5074", "-0.1278", and rejects everything else including "". */
function parseCoord(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (value < -max || value > max) return null;
  return value;
}

export function MockLocationScreen({ navigation }: Props) {
  const {
    status,
    error,
    current,
    isRunning,
    isSupported,
    bootInterrupted,
    places,
    progress,
    sessionMode,
    permissionBlocked,
    requestPermissions,
    start,
    startRoute,
    pauseRoute,
    resumeRoute,
    stop,
    setLocation,
    dismissBootInterrupted,
    savePlaces,
  } = useMockLocation();

  const [mode, setMode] = useState<'STATIC' | 'ROUTE'>('STATIC');

  /**
   * Open on the tab matching whatever is actually running.
   *
   * Landing on Static with a route live is what made an accidental static
   * update() reachable at all — one tap on a saved place used to replace the
   * running route with a frozen point. Applied once, so the user stays in
   * control after that.
   */
  const modeAdopted = useRef(false);
  useEffect(() => {
    if (modeAdopted.current || sessionMode === 'NONE') return;
    modeAdopted.current = true;
    setMode(sessionMode === 'ROUTE' ? 'ROUTE' : 'STATIC');
  }, [sessionMode]);

  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [batteryExempt, setBatteryExempt] = useState(true);
  const [batteryDismissed, setBatteryDismissed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Seed the fields from the restored target, once it arrives.
  useEffect(() => {
    if (!current) return;
    setLat(String(current.latitude));
    setLng(String(current.longitude));
    setLabel(current.label ?? '');
  }, [current]);

  useEffect(() => {
    if (!isSupported) return;
    void isIgnoringBatteryOptimizations().then(setBatteryExempt);
  }, [isSupported, isRunning]);

  const parsed = useMemo(() => {
    const latitude = parseCoord(lat, 90);
    const longitude = parseCoord(lng, 180);
    if (latitude === null || longitude === null) return null;
    return {
      latitude,
      longitude,
      label: label.trim() || undefined,
    };
  }, [lat, lng, label]);

  const showResult = useCallback(
    (result: MockActionResult) => {
      if (result.ok) return;

      // Each failure has a different remedy, so route rather than just report.
      if (result.code === 'E_MOCK_NOT_SELECTED') {
        Alert.alert('Not set as the mock location app', result.message, [
          { text: 'Later', style: 'cancel' },
          { text: 'Open Developer Options', onPress: () => void openDeveloperOptions() },
        ]);
        return;
      }

      if (
        result.code === 'E_MOCK_PERMISSION' ||
        result.code === 'E_MOCK_NOTIFICATIONS'
      ) {
        const isNotifications = result.code === 'E_MOCK_NOTIFICATIONS';
        // blockedPermanently === false means the user just declined the system
        // dialog, so asking again still works. true (or undefined, meaning the
        // native side rejected before any prompt) means only settings can fix it.
        const canPromptAgain = result.blockedPermanently === false;
        Alert.alert(
          isNotifications ? 'Notifications are off' : 'Permission needed',
          result.message,
          [
            { text: 'Later', style: 'cancel' },
            canPromptAgain
              ? { text: 'Try again', onPress: () => void requestPermissions() }
              : {
                  text: isNotifications ? 'Notification settings' : 'App settings',
                  onPress: () =>
                    void (isNotifications ? openNotificationSettings() : openAppSettings()),
                },
          ],
        );
        return;
      }

      Alert.alert("Couldn't simulate that location", result.message);
    },
    [requestPermissions],
  );

  const handleToggle = useCallback(async () => {
    setBusy(true);
    try {
      if (isRunning) {
        showResult(await stop());
      } else {
        if (!parsed) {
          Alert.alert(
            'Check the coordinates',
            'Latitude must be between -90 and 90, longitude between -180 and 180.',
          );
          return;
        }
        showResult(await start(parsed));
      }
    } finally {
      setBusy(false);
    }
  }, [isRunning, parsed, showResult, start, stop]);

  const handleSelectPlace = useCallback(
    async (place: SavedPlace) => {
      setLat(String(place.latitude));
      setLng(String(place.longitude));
      setLabel(place.name);
      showResult(
        await setLocation({
          latitude: place.latitude,
          longitude: place.longitude,
          label: place.name,
        }),
      );
    },
    [setLocation, showResult],
  );

  const handleSavePlace = useCallback(() => {
    if (!parsed) {
      Alert.alert('Check the coordinates', 'Enter a valid latitude and longitude first.');
      return;
    }
    const name = parsed.label ?? `${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}`;
    savePlaces([
      ...places,
      {
        id: createPlaceId(),
        name,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      },
    ]);
  }, [parsed, places, savePlaces]);

  // Renaming is inline rather than an Alert prompt: Alert.prompt is iOS-only,
  // and this screen only ever runs on Android.
  const beginRename = useCallback((place: SavedPlace) => {
    setRenamingId(place.id);
    setRenameDraft(place.name);
  }, []);

  const commitRename = useCallback(() => {
    const trimmed = renameDraft.trim();
    if (renamingId && trimmed) {
      savePlaces(
        places.map((p) => (p.id === renamingId ? { ...p, name: trimmed } : p)),
      );
    }
    setRenamingId(null);
    setRenameDraft('');
  }, [places, renameDraft, renamingId, savePlaces]);

  const handleDeletePlace = useCallback(
    (place: SavedPlace) => {
      Alert.alert('Delete place?', `Remove “${place.name}” from saved places.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => savePlaces(places.filter((p) => p.id !== place.id)),
        },
      ]);
    },
    [places, savePlaces],
  );

  // ── Android-only guard ────────────────────────────────────────────────────
  if (!isSupported) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <Header onBack={() => navigation.goBack()} />
          <View style={[styles.card, styles.cardMuted]}>
            <Text style={styles.bannerTitle}>Android only</Text>
            <Text style={styles.bannerBody}>
              {Platform.OS === 'ios'
                ? 'iOS has no system-wide equivalent of Android’s mock location provider, so this feature can’t work here.'
                : 'The mock location module isn’t available in this build.'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Header onBack={() => navigation.goBack()} />

        {status === null ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
        ) : (
          <>
            {bootInterrupted && (
              <Animated.View entering={stagger(0)} style={[styles.card, styles.cardWarn]}>
                <Text style={styles.bannerTitle}>Session ended at restart</Text>
                <Text style={styles.bannerBody}>
                  Restarting the phone stopped the simulated location. It was not
                  resumed automatically.
                </Text>
                <Pressable onPress={dismissBootInterrupted} hitSlop={8}>
                  <Text style={styles.linkText}>Dismiss</Text>
                </Pressable>
              </Animated.View>
            )}

            <StatusBanner
              status={status}
              error={error}
              index={1}
              permissionBlocked={permissionBlocked}
              onRequestPermissions={() => void requestPermissions()}
            />

            {isRunning && (
              <Animated.View entering={stagger(2)} style={[styles.card, styles.cardLive]}>
                <View style={styles.liveDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveTitle}>Every app sees this location</Text>
                  <Text style={styles.liveBody}>
                    {current?.label ??
                      `${current?.latitude.toFixed(5)}, ${current?.longitude.toFixed(5)}`}
                  </Text>
                </View>
              </Animated.View>
            )}

            <Animated.View entering={stagger(3)} style={styles.modeSwitch}>
              {(['STATIC', 'ROUTE'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  // Switching mode mid-session would silently change what is
                  // being injected, so it waits until the session is stopped.
                  disabled={isRunning}
                  style={[
                    styles.modeOption,
                    mode === m && styles.modeOptionActive,
                    isRunning && mode !== m && { opacity: 0.35 },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeLabel,
                      mode === m && styles.modeLabelActive,
                    ]}
                  >
                    {m === 'STATIC' ? 'Static' : 'Route'}
                  </Text>
                </Pressable>
              ))}
            </Animated.View>

            {mode === 'ROUTE' ? (
              <RouteMode
                places={places}
                progress={progress}
                isRunning={isRunning}
                busy={busy}
                setBusy={setBusy}
                startRoute={startRoute}
                pauseRoute={pauseRoute}
                resumeRoute={resumeRoute}
                stop={stop}
                showResult={showResult}
              />
            ) : (
              <>
            <Animated.Text entering={stagger(3)} style={styles.sectionLabel}>
              COORDINATES
            </Animated.Text>
            <Animated.View entering={stagger(4)}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="LATITUDE"
                    value={lat}
                    onChangeText={setLat}
                    keyboardType="numeric"
                    placeholder="51.5074"
                    autoCorrect={false}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="LONGITUDE"
                    value={lng}
                    onChangeText={setLng}
                    keyboardType="numeric"
                    placeholder="-0.1278"
                    autoCorrect={false}
                  />
                </View>
              </View>
              <Input
                label="NAME (SHOWN IN THE NOTIFICATION)"
                value={label}
                onChangeText={setLabel}
                placeholder="London"
                autoCorrect={false}
              />
              <Pressable onPress={handleSavePlace} hitSlop={8}>
                <Text style={styles.linkText}>Save as a place</Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={stagger(5)} style={{ marginTop: spacing.lg }}>
              <Button
                label={isRunning ? 'Stop simulating' : 'Start simulating'}
                variant={isRunning ? 'primary' : 'accent'}
                loading={busy}
                onPress={handleToggle}
                style={isRunning ? styles.stopButton : undefined}
              />
            </Animated.View>

            {!batteryExempt && !batteryDismissed && (
              <Animated.View entering={stagger(6)} style={[styles.card, styles.cardMuted]}>
                <Text style={styles.bannerBody}>
                  Android may suspend the simulation when the screen is off.
                  Exempting DayPlan from battery optimisation prevents that.
                </Text>
                <View style={styles.bannerActions}>
                  <Pressable onPress={() => void requestIgnoreBatteryOptimizations()} hitSlop={8}>
                    <Text style={styles.linkText}>Allow</Text>
                  </Pressable>
                  <Pressable onPress={() => setBatteryDismissed(true)} hitSlop={8}>
                    <Text style={styles.mutedLink}>Not now</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            <Animated.Text entering={stagger(7)} style={styles.sectionLabel}>
              SAVED PLACES
            </Animated.Text>
            {places.length === 0 ? (
              <Text style={styles.noneText}>
                No saved places yet. Enter coordinates above and tap “Save as a place”.
              </Text>
            ) : (
              places.map((place, i) => (
                <Animated.View key={place.id} entering={stagger(8 + i)}>
                  {renamingId === place.id ? (
                    <View style={styles.placeRow}>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={renameDraft}
                          onChangeText={setRenameDraft}
                          autoFocus
                          onSubmitEditing={commitRename}
                          returnKeyType="done"
                          placeholder={place.name}
                        />
                      </View>
                      <Pressable onPress={commitRename} hitSlop={10}>
                        <Text style={styles.linkText}>Save</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <PressScale
                      onPress={() => void handleSelectPlace(place)}
                      onLongPress={() => beginRename(place)}
                      scaleTo={0.98}
                      style={styles.placeRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.placeName}>{place.name}</Text>
                        <Text style={styles.placeCoords}>
                          {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                        </Text>
                      </View>
                      <Pressable onPress={() => beginRename(place)} hitSlop={10}>
                        <Text style={styles.linkText}>Rename</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeletePlace(place)} hitSlop={10}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </Pressable>
                    </PressScale>
                  )}
                </Animated.View>
              ))
            )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <Pressable onPress={onBack} style={styles.back}>
      <ChevronLeftIcon size={20} color={colors.textPrimary} />
      <Text style={styles.backText}>Simulated location</Text>
    </Pressable>
  );
}

/**
 * One banner per status. NOT_SELECTED gets the numbered walkthrough because it
 * is the only state the user can't fix from inside the app.
 */
function StatusBanner({
  status,
  error,
  index,
  permissionBlocked,
  onRequestPermissions,
}: {
  status: MockStatus;
  error: string | null;
  index: number;
  permissionBlocked: 'location' | 'notifications' | null;
  onRequestPermissions: () => void;
}) {
  if (status === 'RUNNING') return null;

  if (status === 'NOT_SELECTED') {
    return (
      <Animated.View entering={stagger(index)} style={[styles.card, styles.cardWarn]}>
        <Text style={styles.bannerTitle}>One-time setup</Text>
        <Text style={styles.bannerBody}>
          Android only lets an app you explicitly choose simulate a location.
        </Text>
        <Text style={styles.step}>1. Open Settings → About phone</Text>
        <Text style={styles.step}>2. Tap “Build number” seven times</Text>
        <Text style={styles.step}>3. Go to System → Developer options</Text>
        <Text style={styles.step}>4. Tap “Select mock location app”</Text>
        <Text style={styles.step}>5. Choose DayPlan</Text>
        <Pressable onPress={() => void openDeveloperOptions()} hitSlop={8}>
          <Text style={styles.linkText}>Open Developer Options</Text>
        </Pressable>
      </Animated.View>
    );
  }

  if (status === 'PERMISSION_MISSING') {
    return (
      <Animated.View entering={stagger(index)} style={[styles.card, styles.cardWarn]}>
        <Text style={styles.bannerTitle}>Permission needed</Text>
        <Text style={styles.bannerBody}>
          {error ??
            'Location and notification permissions are both required before a location can be simulated.'}
        </Text>
        {permissionBlocked === null ? (
          // The common case, and always the case on a fresh install: nothing has
          // ever asked, so the prompt is the fix. Sending someone to Settings
          // here would be telling them to fix something they were never offered.
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Grant permissions" variant="accent" onPress={onRequestPermissions} />
          </View>
        ) : (
          <View style={styles.bannerActions}>
            <Pressable
              onPress={() =>
                void (permissionBlocked === 'notifications'
                  ? openNotificationSettings()
                  : openAppSettings())
              }
              hitSlop={8}
            >
              <Text style={styles.linkText}>
                {permissionBlocked === 'notifications'
                  ? 'Notification settings'
                  : 'App settings'}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    );
  }

  if (error) {
    return (
      <Animated.View entering={stagger(index)} style={[styles.card, styles.cardMuted]}>
        <Text style={styles.bannerBody}>{error}</Text>
      </Animated.View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginBottom: 8,
  },
  backText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },

  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: spacing.lg,
  },

  row: { flexDirection: 'row', gap: spacing.md },

  modeSwitch: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modeOptionActive: {
    backgroundColor: colors.surfaceStrong,
    ...elevation.sm,
  },
  modeLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  modeLabelActive: { color: colors.textPrimary },

  card: {
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    gap: 6,
    ...elevation.sm,
  },
  cardWarn: {
    backgroundColor: colors.warningBg,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  cardMuted: { backgroundColor: colors.surfaceAlt },
  cardLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.dangerBg,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  liveTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  liveBody: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  bannerTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  bannerBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  bannerActions: { flexDirection: 'row', gap: spacing.lg, marginTop: 4 },
  step: { fontSize: 13, color: colors.textSecondary, marginLeft: 2 },

  linkText: { fontSize: 13, color: colors.accent, fontWeight: '700', marginTop: 4 },
  mutedLink: { fontSize: 13, color: colors.textMuted, fontWeight: '700', marginTop: 4 },
  noneText: { color: colors.textMuted, fontSize: 14, marginVertical: 8 },

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
  deleteText: { fontSize: 13, color: colors.danger, fontWeight: '700' },
});
