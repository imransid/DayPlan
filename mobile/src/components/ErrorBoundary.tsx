import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import { colors, spacing, radius, fontSize } from '../theme';

interface Props {
  children: React.ReactNode;
  /**
   * Optional compact replacement shown instead of the full-screen recovery
   * UI. Use when boundary-wrapping a small subtree (e.g. a media preview) so a
   * localized render crash degrades to a placeholder rather than taking over
   * the whole screen.
   */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary.
 *
 * A JavaScript exception thrown during render/commit of the React tree would
 * otherwise tear down the whole surface — in a release Hermes build that reads
 * as a blank screen or a hard crash, with no way back. This catches those,
 * shows a recoverable screen, and lets the user retry (re-mounting the tree)
 * instead of force-quitting.
 *
 * NOTE: this only catches JS render errors. Native crashes (e.g. a mismatched
 * native module) are not catchable here — those are addressed at the native /
 * dependency layer.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface to Metro / logcat for triage; never throws.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught render error:', error);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <View style={styles.root}>
        <Text style={styles.emoji}>🌀</Text>
        <Text style={styles.title}>Something hiccuped</Text>
        <Text style={styles.sub}>
          The app hit an unexpected error. Your data is safe — tap below to
          reload the screen.
        </Text>
        <Pressable onPress={this.handleReset} style={styles.btn}>
          <Text style={styles.btnText}>Reload</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.screen,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emoji: { fontSize: 44, marginBottom: spacing.md },
  title: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sub: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  btnText: { color: '#fff', fontSize: fontSize.body, fontWeight: '700' },
});
