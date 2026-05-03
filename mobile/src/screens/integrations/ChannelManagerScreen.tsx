import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../components/UI';
import { colors, spacing, radius } from '../../theme';
import { useGetConnectionsQuery, useSaveChannelsMutation } from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';
import type { DiscordChannel } from '../../types';

type Props = NativeStackScreenProps<MainStackParamList, 'ChannelManager'>;

type ToggleField = 'enabled' | 'postGoals' | 'postUpdates';

export function ChannelManagerScreen({ route, navigation }: Props) {
  const { guildId, guildName } = route.params;
  const { data: connections = [], isLoading } = useGetConnectionsQuery();
  const [saveChannels, { isLoading: saving }] = useSaveChannelsMutation();

  const conn = connections.find((c) => c.guildId === guildId);

  // Toggle one of three fields on a channel and persist the whole list.
  // We send the full list every time because the backend save is a wipe-and-replace.
  const handleToggle = async (channelId: string, field: ToggleField) => {
    if (!conn) return;
    const updated = conn.channels.map((c) =>
      c.channelId === channelId ? { ...c, [field]: !c[field] } : c,
    );
    await saveChannels({
      guildId,
      channels: updated.map((c) => ({
        channelId: c.channelId,
        channelName: c.channelName,
        enabled: c.enabled,
        format: c.format,
        postGoals: c.postGoals,
        postUpdates: c.postUpdates,
      })),
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const enabledCount = conn?.channels.filter((c) => c.enabled).length ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ {guildName}</Text>
        </Pressable>

        <Text style={styles.summary}>
          <Text style={{ fontWeight: '600', color: colors.textPrimary }}>
            {enabledCount} active
          </Text>{' '}
          of {conn?.channels.length ?? 0} channels
        </Text>

        <Text style={styles.helpText}>
          Each channel can receive the morning <Text style={styles.bold}>goal post</Text> (today's
          full task list), the evening <Text style={styles.bold}>work update</Text> (only completed
          tasks), or both. Set the times in Settings.
        </Text>

        {conn?.channels.map((channel) => (
          <ChannelCard
            key={channel.channelId}
            channel={channel}
            saving={saving}
            onToggle={(field) => handleToggle(channel.channelId, field)}
          />
        ))}

        <Button
          label="+ Add more channels"
          variant="secondary"
          onPress={() => navigation.navigate('ChannelPicker', { guildId, guildName })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChannelCard({
  channel,
  saving,
  onToggle,
}: {
  channel: DiscordChannel;
  saving: boolean;
  onToggle: (field: ToggleField) => void;
}) {
  return (
    <View style={styles.channelCard}>
      <View style={styles.channelHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.channelName}># {channel.channelName}</Text>
          <Text style={styles.channelMeta}>
            {channel.format === 'EMBED'
              ? 'Embed'
              : channel.format === 'PLAIN'
                ? 'Plain text'
                : 'Compact'}
          </Text>
        </View>
        <Switch
          value={channel.enabled}
          onValueChange={() => onToggle('enabled')}
          trackColor={{ false: colors.textDisabled, true: colors.success }}
          thumbColor="white"
          disabled={saving}
        />
      </View>

      {channel.enabled && (
        <View style={styles.subRows}>
          <SubRow
            label="Post goal list"
            sub="TODAY GOAL — every task planned for today"
            value={channel.postGoals}
            onChange={() => onToggle('postGoals')}
            disabled={saving}
          />
          <SubRow
            label="Post work updates"
            sub="Work Updated — only completed tasks"
            value={channel.postUpdates}
            onChange={() => onToggle('postUpdates')}
            disabled={saving}
            last
          />
        </View>
      )}
    </View>
  );
}

function SubRow({
  label,
  sub,
  value,
  onChange,
  disabled,
  last,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.subRow, !last && styles.subRowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.subRowLabel}>{label}</Text>
        <Text style={styles.subRowSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.textDisabled, true: colors.success }}
        thumbColor="white"
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { padding: spacing.lg },
  back: { paddingVertical: 8, marginBottom: 4 },
  backText: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  summary: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  helpText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 17,
  },
  bold: { fontWeight: '600', color: colors.textSecondary },

  channelCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  channelName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  channelMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  subRows: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  subRowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  subRowLabel: { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  subRowSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
});
