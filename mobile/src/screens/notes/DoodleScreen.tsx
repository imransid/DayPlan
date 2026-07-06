import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Alert,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { PressScale } from '../../components/UI';
import { ChevronLeftIcon } from '../../components/Icon';
import { colors, spacing, radius, fontSize } from '../../theme';
import { copyIntoSandbox } from '../../services/attachmentStorage';
import type { MainStackParamList } from '../../navigation/types';
import type { NoteAttachment } from '../../types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'Doodle'>;

interface Stroke {
  d: string;
  color: string;
  width: number;
}

const PALETTE = ['#15172b', '#ef4444', '#f97316', '#10b981', '#06b6d4', '#6366f1', '#ec4899', '#ffffff'];
const WIDTHS = [3, 6, 12];

/**
 * Freehand doodle canvas. Drawing runs on the JS thread via PanResponder
 * (simple + reliable — no worklet plumbing needed), rendered as react-native-svg
 * <Path>s. On Done, react-native-view-shot rasterises the canvas to a PNG, which
 * is copied into the note-attachment sandbox and handed back to the editor as a
 * regular image attachment (so thumbnails / the viewer just work).
 */
export function DoodleScreen() {
  const navigation = useNavigation<Nav>();
  const canvasRef = useRef<View>(null);

  const [paths, setPaths] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [saving, setSaving] = useState(false);
  const size = useRef({ w: 0, h: 0 });

  // Refs so the once-created PanResponder reads the LATEST style/points.
  const currentRef = useRef('');
  const colorRef = useRef(color);
  const widthRef = useRef(width);

  const pickColor = (c: string) => {
    setColor(c);
    colorRef.current = c;
  };
  const pickWidth = (w: number) => {
    setWidth(w);
    widthRef.current = w;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentRef.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentRef.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderRelease: () => {
        const d = currentRef.current;
        currentRef.current = '';
        setCurrent('');
        if (d.includes('L')) {
          setPaths((p) => [...p, { d, color: colorRef.current, width: widthRef.current }]);
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    size.current = { w, h };
  };

  const undo = () => setPaths((p) => p.slice(0, -1));
  const clear = () => {
    setPaths([]);
    setCurrent('');
    currentRef.current = '';
  };

  const isEmpty = paths.length === 0 && !current;

  const onDone = async () => {
    if (isEmpty) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    try {
      const uri = await captureRef(canvasRef, { format: 'png', quality: 1 });
      const relativePath = await copyIntoSandbox(uri, 'png');
      const att: NoteAttachment = {
        relativePath,
        kind: 'image',
        name: `doodle_${Date.now()}.png`,
        mime: 'image/png',
        size: 0,
        width: Math.round(size.current.w),
        height: Math.round(size.current.h),
      };
      // Return to the SAME editor instance (merge keeps its noteId/notebookId).
      navigation.navigate({
        name: 'NoteEditor',
        params: { doodleAttachment: att },
        merge: true,
      });
    } catch (err: any) {
      setSaving(false);
      Alert.alert('Could not save doodle', String(err?.message ?? err));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <PressScale onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Cancel">
          <ChevronLeftIcon size={22} color={colors.textPrimary} />
        </PressScale>
        <View style={styles.headerMid}>
          <Pressable onPress={undo} disabled={paths.length === 0} hitSlop={8} style={styles.hBtn}>
            <Text style={[styles.hGlyph, paths.length === 0 && styles.hDisabled]}>↶</Text>
          </Pressable>
          <Pressable onPress={clear} disabled={isEmpty} hitSlop={8} style={styles.hBtn}>
            <Text style={[styles.hClear, isEmpty && styles.hDisabled]}>Clear</Text>
          </Pressable>
        </View>
        <PressScale
          onPress={onDone}
          disabled={saving}
          style={[styles.doneBtn, saving && { opacity: 0.5 }]}
          accessibilityLabel="Done"
        >
          <Text style={styles.doneText}>{saving ? '…' : 'Done'}</Text>
        </PressScale>
      </View>

      {/* Canvas — collapsable={false} so view-shot can capture it on Android. */}
      <View
        ref={canvasRef}
        collapsable={false}
        style={styles.canvas}
        onLayout={onLayout}
        {...responder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill}>
          {paths.map((p, i) => (
            <Path
              key={i}
              d={p.d}
              stroke={p.color}
              strokeWidth={p.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {!!current && (
            <Path
              d={current}
              stroke={color}
              strokeWidth={width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
      </View>

      {/* Tools */}
      <View style={styles.tools}>
        <View style={styles.swatches}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => pickColor(c)}
              style={[
                styles.swatch,
                { backgroundColor: c },
                c === '#ffffff' && styles.swatchLight,
                color === c && styles.swatchActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.widths}>
          {WIDTHS.map((w) => (
            <Pressable
              key={w}
              onPress={() => pickWidth(w)}
              style={[styles.widthBtn, width === w && styles.widthActive]}
            >
              <View style={{ width: w + 6, height: w + 6, borderRadius: (w + 6) / 2, backgroundColor: colors.textPrimary }} />
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerMid: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  hBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  hGlyph: { fontSize: 24, color: colors.textPrimary },
  hClear: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  hDisabled: { color: colors.textDisabled },
  doneBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  canvas: { flex: 1, backgroundColor: '#ffffff', marginHorizontal: spacing.md, borderRadius: radius.lg, overflow: 'hidden' },

  tools: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  swatchLight: { borderColor: colors.border },
  swatchActive: { borderColor: colors.accent, transform: [{ scale: 1.12 }] },
  widths: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', alignItems: 'center' },
  widthBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  widthActive: { borderColor: colors.accent, borderWidth: 2 },
});
