import React from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { DateTime } from 'luxon';

import { Heading } from '../../components/UI';
import { AnimatedProgressBar } from '../../components/AnimatedProgress';
import { colors, spacing, radius, motion, elevation } from '../../theme';
import { useGetTaskHistoryQuery } from '../../store/api/api';
import { utcHistoryRangeIso } from '../../utils/utcTaskDay';

export function HistoryScreen() {
  const { from, to } = utcHistoryRangeIso(30);
  const { data: byDate = {}, isLoading } = useGetTaskHistoryQuery({ from, to });
  const dates = Object.keys(byDate).sort().reverse();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(motion.base).easing(motion.easeOut)}>
          <Heading subtitle="Last 30 days">History</Heading>
        </Animated.View>

        {isLoading ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
        ) : dates.length === 0 ? (
          <Animated.Text
            entering={FadeInDown.duration(motion.base).delay(100)}
            style={styles.empty}
          >
            No history yet — your first day is in progress.
          </Animated.Text>
        ) : (
          dates.map((date, index) => {
            const tasks = byDate[date];
            const done = tasks.filter((t) => t.doneAt).length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <Animated.View
                key={date}
                entering={FadeInDown.duration(motion.base)
                  .delay(Math.min(index, 8) * 50)
                  .easing(motion.easeOut)}
                style={styles.dayCard}
              >
                <View style={styles.dayHeader}>
                  <View>
                    <Text style={styles.dayDate}>
                      {DateTime.fromISO(date, { zone: 'utc' }).toLocaleString({
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                    <Text style={styles.dayMeta}>
                      {done} of {tasks.length} completed
                    </Text>
                  </View>
                  <View style={styles.pctBubble}>
                    <Text style={styles.pctText}>{pct}%</Text>
                  </View>
                </View>

                <View style={{ marginVertical: 10 }}>
                  <AnimatedProgressBar value={pct} height={5} />
                </View>

                {tasks.slice(0, 3).map((t) => (
                  <View key={t.id} style={styles.taskRow}>
                    <View
                      style={[
                        styles.taskDot,
                        { backgroundColor: t.doneAt ? colors.success : colors.textDisabled },
                      ]}
                    />
                    <Text
                      style={[styles.taskLine, !t.doneAt && styles.taskMissed]}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                  </View>
                ))}
                {tasks.length > 3 && (
                  <Text style={styles.more}>+ {tasks.length - 3} more</Text>
                )}
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 80 },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...elevation.sm,
  },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayDate: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.2 },
  dayMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  pctBubble: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pctText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },

  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  taskDot: { width: 5, height: 5, borderRadius: 3 },
  taskLine: { fontSize: 13, color: colors.textPrimary, flex: 1 },
  taskMissed: { color: colors.textMuted },
  more: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginLeft: 13 },
});
