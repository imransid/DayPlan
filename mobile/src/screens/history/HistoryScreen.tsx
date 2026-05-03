import React from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heading } from '../../components/UI';
import { colors, spacing, radius } from '../../theme';
import { useGetTaskHistoryQuery } from '../../store/api/api';

export function HistoryScreen() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const { data: byDate = {}, isLoading } = useGetTaskHistoryQuery({
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  });

  const dates = Object.keys(byDate).sort().reverse();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Heading subtitle="Last 30 days">History</Heading>
        {isLoading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : dates.length === 0 ? (
          <Text style={styles.empty}>No history yet — your first day is in progress.</Text>
        ) : (
          dates.map((date) => {
            const tasks = byDate[date];
            const done = tasks.filter((t) => t.doneAt).length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <View key={date} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayDate}>
                    {new Date(date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.dayStat}>
                    {done}/{tasks.length} · {pct}%
                  </Text>
                </View>
                <View style={styles.pbar}>
                  <View style={[styles.pfill, { width: `${pct}%` }]} />
                </View>
                {tasks.slice(0, 3).map((t) => (
                  <Text key={t.id} style={[styles.taskLine, !t.doneAt && styles.taskMissed]}>
                    {t.doneAt ? '✓' : '✗'} {t.title}
                  </Text>
                ))}
                {tasks.length > 3 && (
                  <Text style={styles.more}>+ {tasks.length - 3} more</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 60 },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dayDate: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  dayStat: { fontSize: 12, color: colors.textMuted },
  pbar: { height: 3, backgroundColor: colors.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 10 },
  pfill: { height: '100%', backgroundColor: colors.success },
  taskLine: { fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
  taskMissed: { color: colors.textMuted },
  more: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});
