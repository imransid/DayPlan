import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../components/UI';
import { ChevronLeftIcon } from '../../components/Icon';
import { colors, spacing, radius, fontSize } from '../../theme';
import { useJoinSharedChannelMutation } from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'JoinTeamChannel'>;

export function JoinTeamChannelScreen({ navigation }: Props) {
  const [code, setCode] = useState('');
  const [join, { isLoading }] = useJoinSharedChannelMutation();

  const submit = async () => {
    const joinCode = code.trim();
    if (!joinCode || isLoading) return;
    try {
      const res = await join({ joinCode }).unwrap();
      Alert.alert('Joined', `Your daily plan now posts to “${res.channelName}”.`);
      navigation.goBack();
    } catch (err: any) {
      const message =
        err?.data?.message ?? 'That code is invalid, expired, or full.';
      Alert.alert('Could not join', String(message));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeftIcon size={20} color={colors.textPrimary} />
          <Text style={styles.backText}>Join a team channel</Text>
        </Pressable>

        <View style={styles.body}>
          <Text style={styles.help}>
            Enter the code your team admin shared with you. Your daily{' '}
            <Text style={styles.bold}>TODAY GOAL</Text> and{' '}
            <Text style={styles.bold}>Work Updated</Text> posts will appear in
            their channel automatically, under your name — no Discord login
            needed.
          </Text>

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="e.g. K7mPq2xR9wTa"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={24}
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!isLoading}
          />

          <Button
            label="Join team channel"
            variant="accent"
            loading={isLoading}
            disabled={!code.trim() || isLoading}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  backText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  body: { padding: spacing.lg, gap: spacing.md },
  help: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 21 },
  bold: { fontWeight: '700', color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    fontSize: 18,
    letterSpacing: 2,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
