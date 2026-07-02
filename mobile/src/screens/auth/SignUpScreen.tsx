import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as RNLocalize from 'react-native-localize';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Input, Heading } from '../../components/UI';
import { colors, spacing, motion } from '../../theme';
import { useSignUpMutation } from '../../store/api/api';
import { useAppDispatch } from '../../store/hooks';
import { setCredentials } from '../../store/slices/authSlice';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [signUp, { isLoading }] = useSignUpMutation();
  const dispatch = useAppDispatch();

  const handleSubmit = async () => {
    if (!email || password.length < 8) {
      Alert.alert(
        'Check your input',
        'Email is required and password must be at least 8 characters.',
      );
      return;
    }
    try {
      const result = await signUp({
        email,
        password,
        name: name || undefined,
        timezone: RNLocalize.getTimeZone() || 'UTC',
      }).unwrap();
      dispatch(setCredentials({ accessToken: result.accessToken, user: result.user }));
    } catch (err: any) {
      Alert.alert('Sign up failed', err?.data?.message ?? 'Something went wrong');
    }
  };

  const stagger = (index: number) =>
    FadeInDown.duration(motion.base).delay(index * 70).easing(motion.easeOut);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View entering={stagger(0)}>
          <Heading subtitle="Quick sign up — under 30 seconds.">Create account</Heading>
        </Animated.View>

        <Animated.View entering={stagger(1)}>
          <Input
            label="EMAIL"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
        </Animated.View>

        <Animated.View entering={stagger(2)}>
          <Input
            label="PASSWORD"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
          />
        </Animated.View>

        <Animated.View entering={stagger(3)}>
          <Input
            label="NAME (OPTIONAL)"
            value={name}
            onChangeText={setName}
            placeholder="Rashid Ahmed"
          />
        </Animated.View>

        <Animated.View entering={stagger(4)} style={{ marginTop: 4 }}>
          <Button label="Continue" loading={isLoading} onPress={handleSubmit} />
        </Animated.View>

        <Animated.View entering={stagger(5)}>
          <Text style={styles.link} onPress={() => navigation.navigate('SignIn')}>
            Already have an account? <Text style={styles.linkAccent}>Sign in</Text>
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
