import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  AppState,
  AppStateStatus,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { DateTime } from 'luxon';

import { AnimatedTaskRow } from '../../components/AnimatedTaskRow';
import { AnimatedFab } from '../../components/AnimatedFab';
import { AnimatedProgressBar, AnimatedNumber } from '../../components/AnimatedProgress';
import { colors, spacing, radius, motion, elevation } from '../../theme';
import {
  useGetTasksQuery,
  useToggleTaskMutation,
  useDeleteTaskMutation,
  useRolloverTasksMutation,
} from '../../store/api/api';
import { syncHourlyAlarms } from '../../services/notifications';
import { utcTaskDayStartIso, localCalendarDateKey } from '../../utils/utcTaskDay';
import type { MainStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const today = utcTaskDayStartIso();

  const { data: tasks = [], isLoading, refetch } = useGetTasksQuery(today);
  const [toggleTask] = useToggleTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [rolloverTasks] = useRolloverTasksMutation();

  // Open the add-task sheet. AddTaskScreen owns its own createTask
  // mutation; RTK Query invalidates the "Tasks" tag on success and our
  // useGetTasksQuery here refetches automatically — no callback or
  // event bus required.
  const openAddTask = useCallback(() => {
    navigation.navigate('AddTask', { date: today });
  }, [navigation, today]);

  // ── Day-rollover detection ──────────────────────────────────────────
  const lastSeenLocalDay = useRef<string>(localCalendarDateKey());
  const rolloverInFlight = useRef(false);

  const checkDayRollover = useCallback(async () => {
    const currentDay = localCalendarDateKey();
    if (currentDay === lastSeenLocalDay.current) return;
    if (rolloverInFlight.current) return;

    rolloverInFlight.current = true;
    try {
      await rolloverTasks().unwrap().catch(() => undefined);
      lastSeenLocalDay.current = currentDay;
      refetch();
    } finally {
      rolloverInFlight.current = false;
    }
  }, [rolloverTasks, refetch]);

  useEffect(() => {
    (async () => {
      rolloverInFlight.current = true;
      try {
        await rolloverTasks().unwrap().catch(() => undefined);
        refetch();
      } finally {
        rolloverInFlight.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(useCallback(() => { checkDayRollover(); }, [checkDayRollover]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkDayRollover();
    });
    return () => sub.remove();
  }, [checkDayRollover]);

  // ── Derived task stats — memoized so they aren't recomputed on every
  //    re-render that doesn't actually change `tasks`. ─────────────────
  const { done, pendingCount, pct } = useMemo(() => {
    const doneList = tasks.filter((t) => t.doneAt);
    const pending = tasks.length - doneList.length;
    const percent =
      tasks.length > 0 ? Math.round((doneList.length / tasks.length) * 100) : 0;
    return { done: doneList, pendingCount: pending, pct: percent };
  }, [tasks]);

  // ── Hourly alarm reconciliation ─────────────────────────────────────
  // syncHourlyAlarms reads the user's alarm config and decides whether to
  // (re)schedule or cancel. Called whenever pendingCount changes, so:
  //   - Completing a task → body text updates from "5 tasks remaining"
  //     to "4 tasks remaining" for all future hours today.
  //   - Pending hits zero → all alarms cancelled (nothing to remind about).
  //   - User toggled the feature off in Settings → cancel takes effect on
  //     the next change here, and Settings already cancelled directly.
  // Permission is handled at the Settings toggle, not here, so this can
  // run silently in the background without surfacing a permission prompt.
  useEffect(() => {
    syncHourlyAlarms(pendingCount).catch(() => undefined);
  }, [pendingCount]);

  const formatDate = () =>
    DateTime.local().toLocaleString({
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

  const isEmpty = !isLoading && tasks.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Animated.ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.textMuted}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(motion.base).easing(motion.easeOut)}
          style={styles.header}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.day}>Today</Text>
              <Text style={styles.date}>{formatDate()}</Text>
            </View>

            {tasks.length > 0 && (
              <View style={styles.statBubble}>
                <AnimatedNumber value={done.length} style={styles.statNumber} />
                <Text style={styles.statSep}>/</Text>
                <AnimatedNumber value={tasks.length} style={styles.statTotal} />
              </View>
            )}
          </View>

          {tasks.length > 0 && (
            <View style={styles.progressWrap}>
              <AnimatedProgressBar value={pct} height={8} />
              <View style={styles.progressMeta}>
                <Text style={styles.progressLabel}>
                  {pct === 100 ? 'All done — nicely done.' : `${pct}% complete`}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── Empty state ──────────────────────────────────────── */}
        {isEmpty && (
          <Animated.View
            entering={FadeIn.duration(motion.slow).delay(150)}
            style={styles.empty}
          >
            <View style={styles.emptyOrbOuter}>
              <View style={styles.emptyOrbInner}>
                <Text style={styles.emptyOrbEmoji}>✨</Text>
              </View>
            </View>
            <Text style={styles.emptyTitle}>Plant your day.</Text>
            <Text style={styles.emptySub}>
              Add the first thing you want to{'\n'}get done — keep it small.
            </Text>
          </Animated.View>
        )}

        {/* ── Task list ────────────────────────────────────────── */}
        {tasks.map((task, index) => (
          <Animated.View
            key={task.id}
            // Stagger initial layout so the list "lands" instead of all at
            // once. Cap the delay at 6 items so a long list doesn't take a
            // perceptible time to fully render.
            entering={FadeInDown.duration(motion.base)
              .delay(Math.min(index, 6) * 40)
              .easing(motion.easeOut)}
            exiting={FadeOut.duration(motion.fast)}
            // Layout transition handles smooth re-positioning when tasks
            // are deleted or reordered.
            layout={LinearTransition.springify().damping(20).stiffness(180)}
          >
            <AnimatedTaskRow
              task={task}
              onToggle={() => toggleTask(task.id)}
              onLongPress={() => deleteTask(task.id)}
            />
          </Animated.View>
        ))}

        {/* ── Inline "add task" affordance ─────────────────────── */}
        {tasks.length > 0 && (
          <Animated.View
            entering={FadeIn.duration(motion.base).delay(120)}
            layout={LinearTransition.springify()}
          >
            <Pressable onPress={openAddTask} style={styles.addInline}>
              <Text style={styles.addInlineText}>+ Add task</Text>
            </Pressable>
          </Animated.View>
        )}
      </Animated.ScrollView>

      {/* ── FAB ──────────────────────────────────────────────────
          Pure launcher — pressing it pushes the AddTask screen onto
          the stack. The user sees the bottom sheet rise up; tapping
          the backdrop or hardware back dismisses it. */}
      <AnimatedFab
        onPress={openAddTask}
        // Pulse only when there's nothing to do — gentle nudge to add the
        // first task. Stops once any task is present.
        pulse={isEmpty}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },

  // Header
  header: { marginBottom: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  day: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  date: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },

  statBubble: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...elevation.sm,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  statSep: { fontSize: 14, color: colors.textMuted, marginHorizontal: 3 },
  statTotal: {
    fontSize: 14,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  progressWrap: { gap: 8 },
  progressMeta: { flexDirection: 'row', justifyContent: 'flex-end' },
  progressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  addInline: {
    padding: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(99, 102, 241, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: radius.md,
    marginTop: 4,
  },
  addInlineText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },

  // Empty state — modern orb with accent gradient ring
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyOrbOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(199, 210, 254, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    ...elevation.md,
  },
  emptyOrbInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  emptyOrbEmoji: { fontSize: 30 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  emptySub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
});