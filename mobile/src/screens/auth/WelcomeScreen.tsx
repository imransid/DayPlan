import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/UI';
import { colors, spacing } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.center}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>DP</Text>
          </View>
          <Text style={styles.appName}>DayPlan</Text>
          <Text style={styles.tagline}>
            Plan your day. Stay on track.{'\n'}Auto-share your wins.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Get started" onPress={() => navigation.navigate('SignUp')} />
          <Button
            label="I have an account"
            variant="ghost"
            onPress={() => navigation.navigate('SignIn')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: {
    width: 72,
    height: 72,
    backgroundColor: colors.primary,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: { color: 'white', fontSize: 24, fontWeight: '600' },
  appName: {
    fontSize: 32,
    fontWeight: '500',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  actions: { gap: 8 },
});
