import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Switch,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PressScale } from '../../components/UI';
import { TimePickerModal } from '../../components/TimePickerModal';
import {
  ChevronRightIcon,
  BellIcon,
  PuzzleIcon,
  SettingsIcon,
} from '../../components/Icon';
import { colors, spacing, radius, motion, elevation } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import {
  useGetMeQuery,
  useGetTasksQuery,
  useUpdateProfileMutation,
  useTestPublishMutation,
} from '../../store/api/api';
import {
  loadAlarmConfig,
  saveAlarmConfig,
  type AlarmConfig,
} from '../../services/alarmStorage';
import {
  syncHourlyAlarms,
  requestPermissions,
  openAlarmSoundSettings,
} from '../../services/notifications';
import {
  loadAutoPostConfig,
  saveAutoPostConfig,
  syncAutoPosts,
  scheduleAutoPosts,
  type AutoPostConfig,
} from '../../services/scheduledPosts';
import { utcTaskDayStartIso } from '../../utils/utcTaskDay';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Settings'>;

type EditingField = 'goalPostTime' | 'workUpdateTime' | null;

export function SettingsScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const localUser = useAppSelector((s) => s.auth.user);
  const { data: me } = useGetMeQuery();
  const [updateProfile] = useUpdateProfileMutation();
  const [testPublish, { isLoading: testing }] = useTestPublishMutation();

  // Read today's tasks via the same RTK Query hook HomeScreen uses with
  // the same cache key — the request is deduplicated, no extra network
  // round-trip. We need the count so toggling the alarm here can schedule
  // with an accurate "{N} tasks remaining today" body.
  const today = utcTaskDayStartIso();
  const { data: tasks = [] } = useGetTasksQuery(today);
  const pendingCount = useMemo(
    () => tasks.filter((t) => !t.doneAt).length,
    [tasks],
  );

  const user = me ?? localUser;
  const goalPostTime = user?.goalPostTime ?? '09:00';
  const workUpdateTime = user?.workUpdateTime ?? '18:00';

  const [editing, setEditing] = useState<EditingField>(null);
  const [alarm, setAlarm] = useState<AlarmConfig>({ enabled: false });
  const [alarmLoaded, setAlarmLoaded] = useState(false);
  const [autoPost, setAutoPost] = useState<AutoPostConfig>({ enabled: false });
  const [autoPostLoaded, setAutoPostLoaded] = useState(false);

  useEffect(() => {
    loadAlarmConfig().then((cfg) => {
      setAlarm(cfg);
      setAlarmLoaded(true);
    });
    loadAutoPostConfig().then((cfg) => {
      setAutoPost(cfg);
      setAutoPostLoaded(true);
    });
  }, []);

  // Keep the OS-held daily post triggers aligned with the user's current times
  // while auto-post is on (times arrive from getMe after mount, and can change).
  useEffect(() => {
    if (autoPostLoaded && autoPost.enabled) {
      scheduleAutoPosts(goalPostTime, workUpdateTime).catch(() => undefined);
    }
  }, [autoPostLoaded, autoPost.enabled, goalPostTime, workUpdateTime]);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  const handleSaveTime = (
    field: 'goalPostTime' | 'workUpdateTime',
    next: string,
  ) => {
    // Fire-and-forget: the optimistic updateProfile patch updates the displayed
    // time instantly (from the getMe cache); the network settles in the
    // background and only surfaces on failure.
    updateProfile({ [field]: next })
      .unwrap()
      .catch((err: any) => {
        Alert.alert(
          'Could not save time',
          err?.data?.message ?? err?.message ?? 'Try again',
        );
      });
  };

  /**
   * Toggle the hourly alarm on or off.
   *
   * Flow:
   *   - When turning ON: ask for notification permission first. If denied,
   *     bail without persisting — showing the toggle as ON when nothing
   *     can ring would be a lie.
   *   - When turning OFF: persist + cancel. No permission check needed.
   *
   * Scheduling itself is delegated to syncHourlyAlarms, which reads the
   * config back and decides schedule-vs-cancel. HomeScreen uses the same
   * helper when the pending task count changes, so the on-device schedule
   * stays consistent regardless of which screen mutates the state.
   */
  const handleToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            'Notifications disabled',
            "Turn on notifications for DayPlan in your phone's settings, then try again.",
          );
          // Force a re-render so the Switch snaps back to its previous
          // value (the controlled `alarm.enabled` is still false).
          setAlarm((prev) => ({ ...prev }));
          return;
        }
      }

      const next: AlarmConfig = { enabled };
      setAlarm(next);
      await saveAlarmConfig(next);

      try {
        await syncHourlyAlarms(pendingCount);
      } catch (err: any) {
        Alert.alert(
          enabled ? 'Could not set alarm' : 'Could not cancel alarm',
          err?.message ?? 'Try again',
        );
      }
    },
    [pendingCount],
  );

  /**
   * Toggle phone-driven auto-posting. When ON, the OS fires a trigger at the
   * goal/work-update time — even with the app closed — and a short background
   * task posts to Discord (Android). Needs notification permission to schedule.
   */
  const handleToggleAutoPost = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            'Notifications disabled',
            "Turn on notifications for DayPlan in your phone's settings, then try again.",
          );
          setAutoPost((prev) => ({ ...prev }));
          return;
        }
      }

      const next: AutoPostConfig = { enabled };
      setAutoPost(next);
      await saveAutoPostConfig(next);

      try {
        await syncAutoPosts(goalPostTime, workUpdateTime);
      } catch (err: any) {
        Alert.alert('Could not update auto-post', err?.message ?? 'Try again');
      }
    },
    [goalPostTime, workUpdateTime],
  );

  const handleOpenAlarmSound = () => {
    openAlarmSoundSettings().catch(() => {
      Alert.alert(
        'Could not open sound settings',
        Platform.OS === 'android'
          ? "Open DayPlan → Notifications → “Hourly task alarm” in your phone's settings to change the ringtone."
          : "Open DayPlan → Notifications in your phone's settings.",
      );
    });
  };

  const handleTestPublish = async (kind: 'goal' | 'work_update') => {
    try {
      const result = await testPublish({ kind }).unwrap();
      if (result.posted === 0 && result.failed === 0) {
        Alert.alert(
          'Nothing posted',
          kind === 'work_update'
            ? 'Nothing to post yet — complete a task first, and make sure you’ve joined a team channel (or connected Discord) that receives work updates.'
            : 'No destination for this post. Join a team channel under Integrations (enter your admin’s code), or connect Discord and pick channels.',
        );
        return;
      }
      const lines = result.results.map((r) =>
        r.status === 'success'
          ? `✓ #${r.channelName}`
          : `✗ #${r.channelName} — ${r.error}`,
      );
      Alert.alert(
        `Posted ${result.posted}, failed ${result.failed}`,
        lines.join('\n'),
      );
    } catch (err: any) {
      Alert.alert(
        'Test publish failed',
        err?.data?.message ?? err?.message ?? 'Try again',
      );
    }
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const stagger = (i: number) =>
    FadeInDown.duration(motion.base).delay(i * 60).easing(motion.easeOut);

  // Subtitle under the alarm toggle. Tells the user exactly what enabling
  // it means, including the iOS caveat — Apple does not let third-party
  // apps loop sound, so on iOS each fire is a single ~30s ring.
  const alarmSub =
    Platform.OS === 'ios'
      ? 'Rings every hour, 11 AM – 11 PM, with your remaining tasks. iOS plays sound once per fire (~30s).'
      : 'Rings every hour, 11 AM – 11 PM, with your remaining tasks. Works even if the app is closed.';

  // Subtitle under the auto-post toggle. Android fires a background task at the
  // set time even when the app is closed; iOS can only remind (Apple won't run
  // app code on notification delivery while the app is fully quit).
  const autoPostSub =
    Platform.OS === 'ios'
      ? 'Reminds you at each time — tap the notification to send. iOS can’t post while the app is fully closed.'
      : 'Posts at your goal & work-update times automatically, even when the app is closed.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title ─────────────────────────────────────────── */}
        <Animated.View entering={stagger(0)} style={styles.titleWrap}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Tune your day</Text>
        </Animated.View>

        {/* ── Profile hero card ─────────────────────────────── */}
        <Animated.View entering={stagger(1)} style={styles.profileCard}>
          <View style={styles.profileHalo} pointerEvents="none" />
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.name ?? 'You'}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email}
            </Text>
            <View style={styles.profileBadge}>
              <View style={styles.profileBadgeDot} />
              <Text style={styles.profileBadgeText}>Active</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Alarm ─────────────────────────────────────────── */}
        <Animated.View entering={stagger(2)}>
          <SectionHeader
            icon={<BellIcon size={14} color={colors.accent} weight={1.9} />}
            label="Hourly alarm"
            tint={colors.accent}
          />
          <View style={styles.section}>
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>Hourly task alarm</Text>
                <Text style={styles.rowSub}>{alarmSub}</Text>
              </View>
              {alarmLoaded ? (
                <Switch
                  value={alarm.enabled}
                  onValueChange={handleToggle}
                  trackColor={{ false: 'rgba(0,0,0,0.1)', true: colors.accent }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor="rgba(0,0,0,0.1)"
                />
              ) : (
                <ActivityIndicator size="small" color={colors.textMuted} />
              )}
            </View>
            <SettingsRow
              label="Alarm sound"
              sub="Pick the ringtone & vibration (choose an alarm tone for a louder ring)"
              value="Change"
              onPress={handleOpenAlarmSound}
              last
            />
          </View>
        </Animated.View>

        {/* ── Discord posting ───────────────────────────────── */}
        <Animated.View entering={stagger(3)}>
          <SectionHeader
            icon={<PuzzleIcon size={14} color={colors.discord} weight={1.9} />}
            label="Discord posting"
            tint={colors.discord}
          />
          <View style={styles.section}>
            <SettingsRow
              label="Goal post time"
              sub="Posts today's task list as TODAY GOAL"
              value={formatTime(goalPostTime)}
              onPress={() => setEditing('goalPostTime')}
            />
            <SettingsRow
              label="Work update time"
              sub="Posts completed tasks as Work Updated"
              value={formatTime(workUpdateTime)}
              onPress={() => setEditing('workUpdateTime')}
            />
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>Auto-post at these times</Text>
                <Text style={styles.rowSub}>{autoPostSub}</Text>
              </View>
              {autoPostLoaded ? (
                <Switch
                  value={autoPost.enabled}
                  onValueChange={handleToggleAutoPost}
                  trackColor={{ false: 'rgba(0,0,0,0.1)', true: colors.discord }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor="rgba(0,0,0,0.1)"
                />
              ) : (
                <ActivityIndicator size="small" color={colors.textMuted} />
              )}
            </View>
            <SettingsRow
              label="Send goal post now"
              sub="Manually publish to verify Discord delivery"
              loading={testing}
              onPress={() => handleTestPublish('goal')}
              action
            />
            <SettingsRow
              label="Send work update now"
              sub="Manually publish completed tasks"
              loading={testing}
              onPress={() => handleTestPublish('work_update')}
              action
              last
            />
          </View>
        </Animated.View>

        {/* ── Preferences ──────────────────────────────────── */}
        <Animated.View entering={stagger(4)}>
          <SectionHeader
            icon={<SettingsIcon size={14} color={colors.cool} weight={1.9} />}
            label="Preferences"
            tint={colors.cool}
          />
          <View style={styles.section}>
            <SettingsRow
              label="Integrations"
              value="Manage"
              onPress={() => navigation.navigate('Integrations')}
              last
            />
          </View>
        </Animated.View>

        {/* ── About + Sign out ─────────────────────────────── */}
        <Animated.View entering={stagger(5)} style={styles.footer}>
          <Text style={styles.footerVersion}>DayPlan · v1.0.0</Text>

          <PressScale
            onPress={handleLogout}
            scaleTo={0.97}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutText}>Sign out</Text>
          </PressScale>
        </Animated.View>
      </ScrollView>

      <TimePickerModal
        visible={editing === 'goalPostTime'}
        title="Goal post time"
        value={goalPostTime}
        onClose={() => setEditing(null)}
        onSave={(t) => handleSaveTime('goalPostTime', t)}
      />
      <TimePickerModal
        visible={editing === 'workUpdateTime'}
        title="Work update time"
        value={workUpdateTime}
        onClose={() => setEditing(null)}
        onSave={(t) => handleSaveTime('workUpdateTime', t)}
      />
    </SafeAreaView>
  );
}

// ─── Helpers ─────────────────────────────────────────────

function formatTime(value: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const h24 = parseInt(m[1], 10);
  const min = m[2];
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${period}`;
}

function SectionHeader({
  icon,
  label,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  tint: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View
        style={[
          styles.sectionIconWrap,
          { borderColor: tint + '40', backgroundColor: tint + '15' },
        ]}
      >
        {icon}
      </View>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

interface RowProps {
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  disabled?: boolean;
  loading?: boolean;
  action?: boolean;
}

function SettingsRow({
  label,
  sub,
  value,
  onPress,
  last,
  disabled,
  loading,
  action,
}: RowProps) {
  const labelColor = disabled
    ? colors.textMuted
    : action
    ? colors.accent
    : colors.textPrimary;

  const content = (
    <>
      <View style={styles.rowMain}>
        <Text
          style={[
            styles.rowLabel,
            { color: labelColor },
            action && { fontWeight: '600' },
          ]}
        >
          {label}
        </Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : onPress ? (
          <ChevronRightIcon
            size={16}
            color={action ? colors.accent : colors.textMuted}
          />
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, !last && styles.rowBorder]}>{content}</View>;
  }

  return (
    <PressScale
      onPress={disabled ? undefined : onPress}
      scaleTo={0.99}
      style={[
        styles.row,
        !last && styles.rowBorder,
        disabled && { opacity: 0.45 },
      ]}
    >
      {content}
    </PressScale>
  );
}

// ─── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },

  titleWrap: { marginBottom: spacing.lg },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...elevation.md,
  },
  profileHalo: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accent,
    opacity: 0.18,
    top: -120,
    left: -60,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    ...elevation.sm,
  },
  avatar: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 20,
    letterSpacing: 0.4,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.successBg,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 8,
    gap: 5,
  },
  profileBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  profileBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    letterSpacing: 0.5,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.7,
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...elevation.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 15, 30, 0.07)',
  },
  rowMain: { flex: 1, paddingRight: 12 },
  rowLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  footer: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
  },
  footerVersion: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  logoutBtn: {
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  logoutText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});