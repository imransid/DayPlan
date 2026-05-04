import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { colors, spacing, radius } from '../../theme';
import { useGetConnectionsQuery, useLazyGetDiscordAuthUrlQuery } from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Integrations'>;

export function IntegrationsScreen({ navigation }: Props) {
  const { data: connections = [], isLoading, refetch } = useGetConnectionsQuery();
  const [getAuthUrl] = useLazyGetDiscordAuthUrlQuery();

  const handleConnectDiscord = async () => {
    try {
      const result = await getAuthUrl().unwrap();
      const isAvailable = await InAppBrowser.isAvailable();

      if (isAvailable) {
        // ASWebAuthenticationSession on iOS, Custom Tab on Android — both forward
        // the dayplan:// deep link redirect back to the app automatically.
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
        // Fallback to system browser if InAppBrowser isn't available
        await Linking.openURL(result.url);
      }
    } catch (err: any) {
      Alert.alert('Could not open Discord', err?.message ?? 'Try again');
    }
  };

  const hasConnections = connections.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Integrations</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>CONNECTED</Text>
            {hasConnections ? (
              connections.map((conn) => (
                <Pressable
                  key={conn.id}
                  onPress={() =>
                    navigation.navigate('ChannelManager', {
                      guildId: conn.guildId,
                      guildName: conn.guildName,
                    })
                  }
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
                      {conn.channels.length > 0
                        ? ` · ${conn.channels.map((c) => `#${c.channelName}`).join(', ')}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.noneText}>No services connected yet.</Text>
            )}

            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>AVAILABLE</Text>
            <Pressable onPress={handleConnectDiscord} style={styles.card}>
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
            </Pressable>
            <View style={styles.card}>
              <View style={[styles.icon, { backgroundColor: colors.slack }]}>
                <Text style={styles.iconText}>S</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>Slack</Text>
                <Text style={styles.cardSub}>Coming soon</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { padding: spacing.lg },
  back: { paddingVertical: 8, marginBottom: 8 },
  backText: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  sectionLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.4, marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: 8,
  },
  cardConnected: { borderColor: colors.success, backgroundColor: colors.successBg },
  icon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  iconText: { color: 'white', fontWeight: '600', fontSize: 16 },
  cardName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.textMuted },
  addText: { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  noneText: { color: colors.textMuted, fontSize: 13, marginVertical: 8 },
});