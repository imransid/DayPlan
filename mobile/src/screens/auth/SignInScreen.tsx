import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Input, Heading } from '../../components/UI';
import { colors, spacing } from '../../theme';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Heading subtitle="Welcome back.">Sign in</Heading>
        <Input
          label="EMAIL"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input label="PASSWORD" secureTextEntry value={password} onChangeText={setPassword} />
        <Button label="Sign in" loading={isLoading} onPress={handleSubmit} />
        <Text style={styles.link} onPress={() => navigation.navigate('SignUp')}>
          Don't have an account? Create one
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: 4 },
  link: { textAlign: 'center', color: colors.textSecondary, marginTop: 16, fontSize: 13 },
});
