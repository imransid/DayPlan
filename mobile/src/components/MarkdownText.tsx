import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { colors, spacing, fontSize } from '../theme';

/**
 * Tiny dependency-free markdown renderer for note bodies. Covers the subset the
 * editor's "Aa" toolbar produces: # / ## headings, - • bullets, > quotes, and
 * inline **bold**, *italic* / _italic_, and `code`. Notes stay stored as PLAIN
 * markdown text (so search, the checklist, and card previews keep working) —
 * this only renders it for the preview toggle / read view.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text
    .split(INLINE)
    .filter((s) => s.length > 0)
    .map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      if (part.length >= 4 && part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={key} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={key} style={styles.code}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      if (part.length >= 2 && part.startsWith('*') && part.endsWith('*')) {
        return (
          <Text key={key} style={styles.italic}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      if (part.length >= 2 && part.startsWith('_') && part.endsWith('_')) {
        return (
          <Text key={key} style={styles.italic}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return <Text key={key}>{part}</Text>;
    });
}

export function MarkdownText({ text, style }: { text: string; style?: TextStyle }) {
  const lines = text.split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const key = `l${i}`;
        const h2 = /^##\s+(.*)/.exec(line);
        if (h2) {
          return (
            <Text key={key} style={[styles.p, styles.h2, style]}>
              {renderInline(h2[1], key)}
            </Text>
          );
        }
        const h1 = /^#\s+(.*)/.exec(line);
        if (h1) {
          return (
            <Text key={key} style={[styles.p, styles.h1, style]}>
              {renderInline(h1[1], key)}
            </Text>
          );
        }
        const bullet = /^[-*]\s+(.*)/.exec(line);
        if (bullet) {
          return (
            <View key={key} style={styles.bulletRow}>
              <Text style={[styles.p, styles.bulletDot, style]}>•</Text>
              <Text style={[styles.p, styles.bulletText, style]}>{renderInline(bullet[1], key)}</Text>
            </View>
          );
        }
        const quote = /^>\s+(.*)/.exec(line);
        if (quote) {
          return (
            <View key={key} style={styles.quote}>
              <Text style={[styles.p, styles.quoteText, style]}>{renderInline(quote[1], key)}</Text>
            </View>
          );
        }
        if (line.trim() === '') return <View key={key} style={styles.blank} />;
        return (
          <Text key={key} style={[styles.p, style]}>
            {renderInline(line, key)}
          </Text>
        );
      })}
    </View>
  );
}

/** Strip markdown syntax for compact plain-text previews (list cards). */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*>]\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
}

const styles = StyleSheet.create({
  p: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 22 },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 6, marginBottom: 2 },
  h2: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2, marginTop: 4, marginBottom: 2 },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: 'monospace',
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
  },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  bulletDot: { lineHeight: 22 },
  bulletText: { flex: 1 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accentSoft,
    paddingLeft: spacing.md,
    marginVertical: 2,
  },
  quoteText: { color: colors.textSecondary, fontStyle: 'italic' },
  blank: { height: 10 },
});
