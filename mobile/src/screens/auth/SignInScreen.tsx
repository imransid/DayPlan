import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet, Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Input, Heading } from '../../components/UI';
import { colors, spacing, motion } from '../../theme';
import { useSignInMutation } from '../../store/api/api';
import { useAppDispatch } from '../../store/hooks';
import { setCredentials } from '../../store/slices/authSlice';
import type { AuthStackParamList } from '../../navigation/types';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../config/demoAccount';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export function SignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState(__DEV__ ? DEMO_EMAIL : '');
  const [password, setPassword] = useState(__DEV__ ? DEMO_PASSWORD : '');
  const [signIn, { isLoading }] = useSignInMutation();
  const dispatch = useAppDispatch();

  const handleSubmit = async () => {
    try {
      const result = await signIn({ email, password }).unwrap();
      dispatch(setCredentials({ accessToken: result.accessToken, user: result.user }));
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.data?.message ?? 'Invalid credentials');
    }
  };

  // Each child animates in with a 60ms stagger so the form feels alive
  // without making the user wait. Easing keeps the motion gentle.
  const stagger = (index: number) =>
    FadeInDown.duration(motion.base).delay(index * 70).easing(motion.easeOut);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View entering={stagger(0)}>
          <Heading subtitle="Welcome back.">Sign in</Heading>
        </Animated.View>

        <Animated.View entering={stagger(1)}>
          <Input
            label="EMAIL"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </Animated.View>

        <Animated.View entering={stagger(2)}>
          <Input label="PASSWORD" secureTextEntry value={password} onChangeText={setPassword} />
        </Animated.View>

        <Animated.View entering={stagger(3)} style={{ marginTop: 4 }}>
          <Button label="Sign in" loading={isLoading} onPress={handleSubmit} />
        </Animated.View>

        <Animated.View entering={stagger(4)}>
          <Text style={styles.link} onPress={() => navigation.navigate('SignUp')}>
            Don't have an account? <Text style={styles.linkAccent}>Create one</Text>
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: 4 },
  link: { textAlign: 'center', color: colors.textSecondary, marginTop: 16, fontSize: 13 },
  linkAccent: { color: colors.accent, fontWeight: '600' },
});
