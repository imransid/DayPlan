import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { colors, spacing, radius } from '../../theme';
import { useListAvailableChannelsQuery, useSaveChannelsMutation } from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ChannelPicker'>;

export function ChannelPickerScreen({ route, navigation }: Props) {
  const { guildId, guildName } = route.params;
  const { data: channels = [], isLoading } = useListAvailableChannelsQuery(guildId);
  const [saveChannels, { isLoading: saving }] = useSaveChannelsMutation();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(channels.filter((c) => c.name.includes('daily')).map((c) => c.id)),
  );

  const filtered = useMemo(() => {
    if (!search) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [channels, search]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleSave = async () => {
    const picked = channels.filter((c) => selected.has(c.id));
    await saveChannels({
      guildId,
      channels: picked.map((c) => ({
        channelId: c.id,
        channelName: c.name,
        enabled: true,
        format: 'EMBED',
      })),
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>‹ {guildName}</Text>
      </Pressable>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search channels..."
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          extraData={selected}
          removeClippedSubviews={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                style={[styles.row, isSelected && styles.rowSelected]}
              >
                <Text style={styles.hash}>#</Text>
                <Text style={styles.channelName}>{item.name}</Text>
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.bottomBar}>
        <Text style={styles.count}>
          <Text style={{ fontWeight: '600' }}>{selected.size}</Text> selected
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={saving || selected.size === 0}
          style={[styles.saveBtn, (saving || selected.size === 0) && { opacity: 0.5 }]}
        >
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save channels'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  back: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: 12 },
  search: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  rowSelected: { backgroundColor: colors.successBg },
  hash: { color: colors.textMuted, fontSize: 16, width: 14, textAlign: 'center' },
  channelName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.textDisabled,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  check: { color: 'white', fontWeight: '700', fontSize: 12 },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  count: { fontSize: 13, color: colors.textSecondary },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveText: { color: 'white', fontWeight: '500', fontSize: 14 },
});
