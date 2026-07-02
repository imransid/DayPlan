import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../components/UI';
import { HeroOrb } from '../../components/HeroOrb';
import { colors, spacing, motion } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

/**
 * Welcome screen with a staggered intro:
 *   - Hero orb (its own breathing animation)
 *   - App name fades up at +200ms
 *   - Tagline at +320ms
 *   - Buttons appear together at +500ms
 *
 * Each delay is small enough that the screen still feels fast (~600ms full
 * intro), but the staggering reads as "designed", not "everything pops in".
 */
export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.center}>
          <Animated.View
            entering={FadeInDown.duration(motion.slow).easing(motion.easeOut)}
            style={{ marginBottom: spacing.xl }}
          >
            <HeroOrb size={104} />
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.duration(motion.base).delay(200).easing(motion.easeOut)}
            style={styles.appName}
          >
            DayPlan
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.duration(motion.base).delay(320).easing(motion.easeOut)}
            style={styles.tagline}
          >
            Plan your day. Stay on track.{'\n'}Auto-share your wins.
          </Animated.Text>
        </View>

        <Animated.View
          entering={FadeInDown.duration(motion.base).delay(500).easing(motion.easeOut)}
          style={styles.actions}
        >
          <Button label="Get started" onPress={() => navigation.navigate('SignUp')} />
          <Button
            label="I have an account"
            variant="ghost"
            onPress={() => navigation.navigate('SignIn')}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  appName: {
    fontSize: 38,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    paddingHorizontal: 12,
  },
  actions: { gap: 10 },
});
