import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';

import { Button } from './UI';
import { colors, spacing, radius } from '../theme';

interface Props {
  visible: boolean;
  /** Initial value, "HH:mm". */
  value: string;
  title?: string;
  onClose: () => void;
  /** Called with the new "HH:mm" string when user taps Save. */
  onSave: (value: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const ROW_HEIGHT = 44;

/**
 * Dependency-free time picker. Two side-by-side scrolling columns of values
 * (hours 00-23 and minutes 00/15/30/45). Tap a row to select; Save returns
 * the chosen "HH:mm" string. We picked 15-minute granularity because the
 * scheduler runs once per minute — finer-than-1-minute control would be
 * pointless and finer than 15 makes the picker unwieldy without a wheel.
 */
export function TimePickerModal({ visible, value, title, onClose, onSave }: Props) {
  const initial = parseTime(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  const hoursRef = useRef<ScrollView>(null);
  const minutesRef = useRef<ScrollView>(null);

  // When `value` changes (modal reopened with a new time) reset our local state
  // and scroll both columns to the selected rows.
  useEffect(() => {
    if (!visible) return;
    const next = parseTime(value);
    setHour(next.hour);
    setMinute(next.minute);

    // Defer scroll until after layout. Without the timeout the ScrollView
    // hasn't measured yet and the offset is silently ignored.
    const t = setTimeout(() => {
      const hourIdx = HOURS.indexOf(next.hour);
      const minIdx = MINUTES.indexOf(next.minute);
      if (hourIdx >= 0) {
        hoursRef.current?.scrollTo({ y: hourIdx * ROW_HEIGHT, animated: false });
      }
      if (minIdx >= 0) {
        minutesRef.current?.scrollTo({ y: minIdx * ROW_HEIGHT, animated: false });
      }
    }, 50);
    return () => clearTimeout(t);
  }, [visible, value]);

  const handleSave = () => {
    onSave(`${hour}:${minute}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title ?? 'Pick a time'}</Text>
          <Text style={styles.preview}>
            {hour}:{minute}
          </Text>

          <View style={styles.columns}>
            <Column
              ref={hoursRef}
              label="Hour"
              values={HOURS}
              selected={hour}
              onSelect={setHour}
            />
            <View style={styles.colon}>
              <Text style={styles.colonText}>:</Text>
            </View>
            <Column
              ref={minutesRef}
              label="Minute"
              values={MINUTES}
              selected={minute}
              onSelect={setMinute}
            />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Button label="Save" onPress={handleSave} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const Column = React.forwardRef<
  ScrollView,
  {
    label: string;
    values: string[];
    selected: string;
    onSelect: (v: string) => void;
  }
>(({ label, values, selected, onSelect }, ref) => {
  return (
    <View style={styles.column}>
      <Text style={styles.colLabel}>{label}</Text>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        style={styles.colScroll}
        contentContainerStyle={{ paddingVertical: 4 }}
      >
        {values.map((v) => {
          const active = v === selected;
          return (
            <Pressable
              key={v}
              onPress={() => onSelect(v)}
              style={[styles.colRow, active && styles.colRowActive]}
            >
              <Text style={[styles.colText, active && styles.colTextActive]}>{v}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

function parseTime(value: string): { hour: string; minute: string } {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return { hour: '09', minute: '00' };
  const h = match[1];
  // Snap minute to the nearest supported step (00/15/30/45). This is just a
  // display convenience — users can still pick any of the four.
  const m = parseInt(match[2], 10);
  const snapped =
    m < 8 ? '00' : m < 23 ? '15' : m < 38 ? '30' : m < 53 ? '45' : '00';
  return { hour: h, minute: snapped };
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl + 12 : spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, textAlign: 'center' },
  preview: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    letterSpacing: 1,
  },

  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 200,
  },
  column: { flex: 1 },
  colLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginBottom: 6,
  },
  colScroll: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    maxHeight: 168,
  },
  colRow: { paddingVertical: 12, alignItems: 'center', height: ROW_HEIGHT, justifyContent: 'center' },
  colRowActive: { backgroundColor: colors.primary, borderRadius: radius.sm },
  colText: { fontSize: 16, color: colors.textPrimary },
  colTextActive: { color: 'white', fontWeight: '600' },
  colon: { paddingHorizontal: 4, paddingTop: 24 },
  colonText: { fontSize: 22, color: colors.textMuted },

  actions: { flexDirection: 'row', gap: 12, marginTop: 20, alignItems: 'center' },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { color: colors.textMuted, fontSize: 14 },
});
