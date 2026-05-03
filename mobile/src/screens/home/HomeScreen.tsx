import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/UI';
import { colors, spacing, radius } from '../../theme';
import {
  useGetTasksQuery,
  useCreateTaskMutation,
  useToggleTaskMutation,
  useDeleteTaskMutation,
} from '../../store/api/api';
import { scheduleHourlyReminders, requestPermissions } from '../../services/notifications';
import { utcTaskDayStartIso } from '../../utils/utcTaskDay';
import type { Task } from '../../types';
import { DateTime } from 'luxon';

export function HomeScreen() {
  const today = utcTaskDayStartIso();
  const { data: tasks = [], isLoading, refetch } = useGetTasksQuery(today);
  const [createTask, { isLoading: creating }] = useCreateTaskMutation();
  const [toggleTask] = useToggleTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const pending = tasks.filter((t) => !t.doneAt).length;
    if (pending > 0) {
      requestPermissions().then((granted) => {
        if (granted) scheduleHourlyReminders(9, 21, pending);
      });
    }
  }, [tasks]);

  const done = tasks.filter((t) => t.doneAt);
  const pct = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  const handleAdd = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    setModalOpen(false);
    await createTask({ title, date: today });
  };

  const formatDate = () =>
    DateTime.utc().toLocaleString({
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        extraData={tasks}
        // Android Fabric + native-stack: default removeClippedSubviews causes ViewGroup
        // child-count desync on navigation/unmount ("Cannot remove child at index …").
        removeClippedSubviews={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.textMuted}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.row}>
              <View>
                <Text style={styles.day}>Today</Text>
                <Text style={styles.date}>{formatDate()}</Text>
              </View>
              {tasks.length > 0 && (
                <Text style={styles.progress}>
                  {done.length} of {tasks.length}
                </Text>
              )}
            </View>
            {tasks.length > 0 && (
              <View style={styles.pbar}>
                <View style={[styles.pfill, { width: `${pct}%` }]} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Text style={{ fontSize: 24 }}>📋</Text>
              </View>
              <Text style={styles.emptyTitle}>No tasks yet</Text>
              <Text style={styles.emptySub}>
                Plan your day in 30 seconds.{'\n'}Tap the button below to add your first task.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            onToggle={() => toggleTask(item.id)}
            onDelete={() => deleteTask(item.id)}
          />
        )}
        ListFooterComponent={
          tasks.length > 0 ? (
            <Pressable onPress={() => setModalOpen(true)} style={styles.addInline}>
              <Text style={styles.addInlineText}>+ Add task</Text>
            </Pressable>
          ) : null
        }
      />

      <Pressable onPress={() => setModalOpen(true)} style={styles.fab}>
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => setModalOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
            <Pressable style={styles.modal}>
              <View style={styles.handle} />
              <Text style={styles.modalTitle}>New task</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="What do you want to get done?"
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                autoFocus
                onSubmitEditing={handleAdd}
                returnKeyType="done"
              />
              <Button label="Add task" loading={creating} onPress={handleAdd} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isDone = !!task.doneAt;
  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onDelete}
      style={[styles.task, isDone ? styles.taskDone : styles.taskPending]}
    >
      <View style={[styles.circle, isDone ? styles.circleDone : styles.circlePending]}>
        {isDone && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.taskText, isDone && styles.taskTextDone]}>{task.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  header: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  day: { fontSize: 26, fontWeight: '500', color: colors.textPrimary, letterSpacing: -0.4 },
  date: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  progress: { fontSize: 12, color: colors.textMuted },
  pbar: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, overflow: 'hidden' },
  pfill: { height: '100%', backgroundColor: colors.success, borderRadius: 2 },

  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 6,
  },
  taskDone: { backgroundColor: colors.surfaceAlt },
  taskPending: { borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface },
  circle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  circleDone: { backgroundColor: colors.success },
  circlePending: { borderWidth: 1.5, borderColor: colors.textDisabled },
  checkmark: { color: 'white', fontSize: 12, fontWeight: '700' },
  taskText: { flex: 1, fontSize: 15, color: colors.textPrimary },
  taskTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },

  addInline: {
    padding: 12,
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderColor: colors.textDisabled,
    borderRadius: radius.md,
    marginTop: 8,
  },
  addInlineText: { textAlign: 'center', fontSize: 13, color: colors.textSecondary },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabIcon: { color: 'white', fontSize: 28, lineHeight: 30 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '500', marginBottom: 16, color: colors.textPrimary },
  modalInput: {
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 16,
  },
});
