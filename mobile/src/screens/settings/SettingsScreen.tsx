import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Heading } from '../../components/UI';
import { TimePickerModal } from '../../components/TimePickerModal';
import { colors, spacing, radius } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useGetMeQuery, useUpdateProfileMutation } from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Settings'>;

// Which time row is currently being edited. `null` means the picker is closed.
type EditingField = 'goalPostTime' | 'workUpdateTime' | null;

export function SettingsScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const localUser = useAppSelector((s) => s.auth.user);
  // Pull the freshest copy from the server so updates from another device
  // (or the initial defaults set by the migration) show up correctly.
  const { data: me } = useGetMeQuery();
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation();

  const user = me ?? localUser;
  const goalPostTime = user?.goalPostTime ?? '09:00';
  const workUpdateTime = user?.workUpdateTime ?? '18:00';

  const [editing, setEditing] = useState<EditingField>(null);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  const handleSaveTime = async (field: 'goalPostTime' | 'workUpdateTime', next: string) => {
    try {
      await updateProfile({ [field]: next }).unwrap();
    } catch (err: any) {
      Alert.alert('Could not save time', err?.data?.message ?? err?.message ?? 'Try again');
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Heading>Settings</Heading>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name ?? 'You'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* ─── Discord posting schedule ─────────────────────── */}
        <Text style={styles.sectionLabel}>DISCORD POSTING</Text>
        <View style={styles.section}>
          <Row
            label="Goal post time"
            sub="Posts today's task list as TODAY GOAL"
            value={formatTime(goalPostTime)}
            onPress={() => setEditing('goalPostTime')}
          />
          <Row
            label="Work update time"
            sub="Posts completed tasks as Work Updated"
            value={formatTime(workUpdateTime)}
            onPress={() => setEditing('workUpdateTime')}
            last
          />
        </View>

        {/* ─── Other settings ───────────────────────────────── */}
        <View style={styles.section}>
          <Row label="Reminder schedule" value="9 AM – 9 PM" onPress={() => {}} />
          <Row
            label="Integrations"
            value="Manage"
            onPress={() => navigation.navigate('Integrations')}
          />
          <Row label="Notifications" value="On" onPress={() => {}} last />
        </View>

        <View style={styles.section}>
          <Row label="About" value="v1.0.0" last />
        </View>

        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
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

/** Format "HH:mm" → "9:00 AM" for display. */
function formatTime(value: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const h24 = parseInt(m[1], 10);
  const min = m[2];
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${period}`;
}

function Row({
  label,
  sub,
  value,
  onPress,
  last,
}: {
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {onPress && <Text style={styles.chevron}>›</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { padding: spacing.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: 'white', fontWeight: '500', fontSize: 16 },
  profileName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  profileEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  rowLabel: { fontSize: 14, color: colors.textPrimary },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontSize: 13, color: colors.textMuted },
  chevron: { fontSize: 18, color: colors.textMuted },

  logoutBtn: { padding: 14, alignItems: 'center', marginTop: spacing.md },
  logoutText: { color: colors.danger, fontSize: 14, fontWeight: '500' },
});
