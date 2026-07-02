import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PressScale } from '../../components/UI';
import { ChevronRightIcon, ChevronLeftIcon } from '../../components/Icon';
import { colors, spacing, radius, motion, elevation } from '../../theme';
import {
  useGetConnectionsQuery,
  useLazyGetDiscordAuthUrlQuery,
  useGetSharedChannelsQuery,
  useLeaveSharedChannelMutation,
} from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Integrations'>;

export function IntegrationsScreen({ navigation }: Props) {
  const { data: connections = [], isLoading, refetch } = useGetConnectionsQuery();
  const { data: shared } = useGetSharedChannelsQuery();
  const [leaveShared] = useLeaveSharedChannelMutation();
  const [getAuthUrl] = useLazyGetDiscordAuthUrlQuery();

  const joinedTeams = shared?.joined ?? [];

  const confirmLeave = (id: string, name: string) => {
    Alert.alert('Leave team channel?', `Stop posting your plan to “${name}”.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveShared(id) },
    ]);
  };

  const handleConnectDiscord = async () => {
    try {
      const result = await getAuthUrl().unwrap();
      const isAvailable = await InAppBrowser.isAvailable();

      if (isAvailable) {
        const browserResult = await InAppBrowser.openAuth(result.url, 'dayplan://discord-connected', {
          ephemeralWebSession: false,
          showTitle: true,
          toolbarColor: colors.primary,
          secondaryToolbarColor: 'white',
          enableUrlBarHiding: true,
          enableDefaultShare: false,
        });
        if (browserResult.type === 'success') {
          refetch();
        }
      } else {
        await Linking.openURL(result.url);
      }
    } catch (err: any) {
      Alert.alert('Could not open Discord', err?.message ?? 'Try again');
    }
  };

  const hasConnections = connections.length > 0;

  const stagger = (i: number) =>
    FadeInDown.duration(motion.base).delay(i * 60).easing(motion.easeOut);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeftIcon size={20} color={colors.textPrimary} />
          <Text style={styles.backText}>Integrations</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Animated.Text entering={stagger(0)} style={styles.sectionLabel}>
              CONNECTED
            </Animated.Text>

            {hasConnections ? (
              connections.map((conn, idx) => (
                <Animated.View key={conn.id} entering={stagger(idx + 1)}>
                  <PressScale
                    onPress={() =>
                      navigation.navigate('ChannelManager', {
                        guildId: conn.guildId,
                        guildName: conn.guildName,
                      })
                    }
                    scaleTo={0.98}
                    style={[styles.card, styles.cardConnected]}
                  >
                    <View style={[styles.icon, { backgroundColor: colors.discord }]}>
                      <Text style={styles.iconText}>D</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{conn.guildName}</Text>
                      <Text style={styles.cardSub}>
                        Discord · {conn.channels.length} channel
                        {conn.channels.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <ChevronRightIcon size={18} color={colors.textMuted} />
                  </PressScale>
                </Animated.View>
              ))
            ) : (
              <Animated.Text entering={stagger(1)} style={styles.noneText}>
                No services connected yet.
              </Animated.Text>
            )}

            {/* ─── Team channels the user has joined ─── */}
            <Animated.Text
              entering={stagger(connections.length + 2)}
              style={[styles.sectionLabel, { marginTop: 28 }]}
            >
              TEAM CHANNELS
            </Animated.Text>

            {joinedTeams.map((team, idx) => (
              <Animated.View key={team.id} entering={stagger(connections.length + 3 + idx)}>
                <View style={[styles.card, styles.cardConnected]}>
                  <View style={[styles.icon, { backgroundColor: colors.accent }]}>
                    <Text style={styles.iconText}>#</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}># {team.channelName}</Text>
                    <Text style={styles.cardSub}>Team feed · posting your plan</Text>
                  </View>
                  <Pressable onPress={() => confirmLeave(team.id, team.channelName)} hitSlop={8}>
                    <Text style={styles.leaveText}>Leave</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ))}

            <Animated.View entering={stagger(connections.length + 3 + joinedTeams.length)}>
              <PressScale
                onPress={() => navigation.navigate('JoinTeamChannel')}
                scaleTo={0.98}
                style={styles.card}
              >
                <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.iconText, { color: colors.accent }]}>+</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>Join a team channel</Text>
                  <Text style={styles.cardSub}>Enter a code from your admin</Text>
                </View>
                <ChevronRightIcon size={18} color={colors.textMuted} />
              </PressScale>
            </Animated.View>

            <Animated.Text
              entering={stagger(connections.length + 5 + joinedTeams.length)}
              style={[styles.sectionLabel, { marginTop: 28 }]}
            >
              AVAILABLE
            </Animated.Text>

            <Animated.View entering={stagger(connections.length + 6 + joinedTeams.length)}>
              <PressScale onPress={handleConnectDiscord} scaleTo={0.98} style={styles.card}>
                <View style={[styles.icon, { backgroundColor: colors.discord }]}>
                  <Text style={styles.iconText}>D</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>
                    {hasConnections ? 'Add another Discord server' : 'Discord'}
                  </Text>
                  <Text style={styles.cardSub}>Multi-channel posting</Text>
                </View>
                <Text style={styles.addText}>+ Add</Text>
              </PressScale>
            </Animated.View>

            <Animated.View entering={stagger(connections.length + 7 + joinedTeams.length)}>
              <View style={styles.card}>
                <View style={[styles.icon, { backgroundColor: colors.slack, opacity: 0.6 }]}>
                  <Text style={styles.iconText}>S</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>Slack</Text>
                  <Text style={styles.cardSub}>Coming soon</Text>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, marginBottom: 8 },
  backText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },

  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    ...elevation.sm,
  },
  cardConnected: {
    borderColor: 'rgba(79, 157, 135, 0.45)',
    backgroundColor: colors.successBg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { color: 'white', fontWeight: '700', fontSize: 18 },
  cardName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.1 },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addText: { fontSize: 13, color: colors.accent, fontWeight: '700' },
  leaveText: { fontSize: 13, color: colors.danger, fontWeight: '700' },
  noneText: { color: colors.textMuted, fontSize: 14, marginVertical: 8 },
});
