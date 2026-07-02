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
import { colors, spacing, radius, elevation } from '../theme';

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
 * Dependency-free time picker. Two scrolling columns (hours 00-23, minutes
 * 00/15/30/45). Tap a row to select; Save returns "HH:mm".
 *
 * 15-minute granularity is chosen because the scheduler runs once per
 * minute — finer than that is pointless, and finer than 15 makes the
 * picker unwieldy without a wheel control.
 */
export function TimePickerModal({ visible, value, title, onClose, onSave }: Props) {
  const initial = parseTime(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  const hoursRef = useRef<ScrollView>(null);
  const minutesRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    const next = parseTime(value);
    setHour(next.hour);
    setMinute(next.minute);

    // Defer scroll until after layout — without the timeout the offset
    // is silently ignored.
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
              <Button label="Save" variant="accent" onPress={handleSave} />
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
              <Text style={[styles.colText, active && styles.colTextActive]}>
                {v}
              </Text>
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
  const m = parseInt(match[2], 10);
  // Snap minute to nearest supported step (00/15/30/45) for display.
  const snapped =
    m < 8 ? '00' : m < 23 ? '15' : m < 38 ? '30' : m < 53 ? '45' : '00';
  return { hour: h, minute: snapped };
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 35, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceStrong,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl + 12 : spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    ...elevation.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  preview: {
    fontSize: 36,
    fontWeight: '300',
    color: colors.accent,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
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
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: 8,
  },
  colScroll: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: radius.md,
    maxHeight: 168,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  colRow: {
    paddingVertical: 12,
    alignItems: 'center',
    height: ROW_HEIGHT,
    justifyContent: 'center',
  },
  colRowActive: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    marginHorizontal: 6,
  },
  colText: { fontSize: 16, color: colors.textPrimary, fontWeight: '500' },
  colTextActive: { color: 'white', fontWeight: '700' },
  colon: { paddingHorizontal: 4, paddingTop: 24 },
  colonText: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },

  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    alignItems: 'center',
  },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
});
