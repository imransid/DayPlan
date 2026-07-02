import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme';

/**
 * Tiny custom-icon kit drawn entirely with View primitives. Lets us replace
 * the emoji icons in the tab bar / settings rows without pulling in
 * react-native-svg (which is ~1MB and another native build dependency).
 *
 * Each icon is a 24×24 box. Stroke width and colour scale via props.
 *
 * Style cheat-sheet:
 *   - Lines are absolute-positioned Views with width/height derived from
 *     the trig of the rotation angle. We pre-compute these for the angles
 *     we need.
 *   - Curves are simulated with rounded squares. Coarse, but at icon
 *     sizes it reads cleanly and avoids canvas-style libraries.
 */

interface IconProps {
  size?: number;
  color?: string;
  /** Stroke thickness in px. Defaults to 1.8 — looks crisp at 24px. */
  weight?: number;
}

const DEFAULT_SIZE = 24;
const DEFAULT_WEIGHT = 1.8;

export function CheckIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, weight = DEFAULT_WEIGHT }: IconProps) {
  // Two strokes meeting at an angle — the short leg, then the long leg.
  // Sizes calibrated to the 24px box.
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      <View
        style={[
          iconStyles.stroke,
          {
            backgroundColor: color,
            height: weight,
            width: 7 * s,
            top: 13 * s,
            left: 4 * s,
            transform: [{ rotate: '45deg' }],
          },
        ]}
      />
      <View
        style={[
          iconStyles.stroke,
          {
            backgroundColor: color,
            height: weight,
            width: 12 * s,
            top: 11 * s,
            left: 8 * s,
            transform: [{ rotate: '-45deg' }],
          },
        ]}
      />
    </View>
  );
}

export function CalendarIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, weight = DEFAULT_WEIGHT }: IconProps) {
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      {/* Body */}
      <View
        style={{
          position: 'absolute',
          top: 5 * s,
          left: 3 * s,
          width: 18 * s,
          height: 16 * s,
          borderRadius: 3 * s,
          borderWidth: weight,
          borderColor: color,
        }}
      />
      {/* Header bar */}
      <View
        style={{
          position: 'absolute',
          top: 9 * s,
          left: 3 * s,
          width: 18 * s,
          height: weight,
          backgroundColor: color,
        }}
      />
      {/* Hangers */}
      <View style={{ position: 'absolute', top: 2 * s, left: 7 * s, width: weight, height: 5 * s, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: 2 * s, left: 16 * s, width: weight, height: 5 * s, backgroundColor: color }} />
    </View>
  );
}

export function SettingsIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, weight = DEFAULT_WEIGHT }: IconProps) {
  // Gear approximation: outer ring + inner hole + four nubs. Simpler than
  // an 8-tooth gear but reads as "settings" at tab-bar sizes.
  const s = size / DEFAULT_SIZE;
  const cx = 12 * s;
  const ring = 9 * s;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: cx - ring,
          top: cx - ring,
          width: ring * 2,
          height: ring * 2,
          borderRadius: ring,
          borderWidth: weight,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: cx - 3 * s,
          top: cx - 3 * s,
          width: 6 * s,
          height: 6 * s,
          borderRadius: 3 * s,
          borderWidth: weight,
          borderColor: color,
        }}
      />
      {/* Four nubs */}
      {[0, 90, 180, 270].map((deg) => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            left: cx - weight / 2,
            top: 1 * s,
            width: weight,
            height: 3 * s,
            backgroundColor: color,
            transformOrigin: `50% ${cx - 1 * s}px`,
            transform: [{ rotate: `${deg}deg` }],
          }}
        />
      ))}
    </View>
  );
}

export function PlusIcon({ size = DEFAULT_SIZE, color = colors.primaryText, weight = 2.4 }: IconProps) {
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 12 * s - weight / 2,
          width: 16 * s,
          height: weight,
          backgroundColor: color,
          borderRadius: weight,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 4 * s,
          left: 12 * s - weight / 2,
          width: weight,
          height: 16 * s,
          backgroundColor: color,
          borderRadius: weight,
        }}
      />
    </View>
  );
}

export function ChevronRightIcon({ size = 16, color = colors.textMuted, weight = 1.6 }: IconProps) {
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: 9 * s,
          top: 6 * s,
          width: 6 * s,
          height: weight,
          backgroundColor: color,
          borderRadius: weight,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 9 * s,
          top: 11.5 * s,
          width: 6 * s,
          height: weight,
          backgroundColor: color,
          borderRadius: weight,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

export function ChevronLeftIcon({ size = 18, color = colors.textPrimary, weight = 1.8 }: IconProps) {
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: 8 * s,
          top: 6 * s,
          width: 6 * s,
          height: weight,
          backgroundColor: color,
          borderRadius: weight,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 8 * s,
          top: 11.5 * s,
          width: 6 * s,
          height: weight,
          backgroundColor: color,
          borderRadius: weight,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

export function BellIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, weight = DEFAULT_WEIGHT }: IconProps) {
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      {/* Bell body — rounded top + flat bottom approximation */}
      <View
        style={{
          position: 'absolute',
          left: 5 * s,
          top: 4 * s,
          width: 14 * s,
          height: 12 * s,
          borderTopLeftRadius: 7 * s,
          borderTopRightRadius: 7 * s,
          borderWidth: weight,
          borderColor: color,
          borderBottomWidth: 0,
        }}
      />
      {/* Bottom bar */}
      <View style={{ position: 'absolute', left: 3 * s, top: 16 * s, width: 18 * s, height: weight, backgroundColor: color, borderRadius: weight }} />
      {/* Clapper */}
      <View
        style={{
          position: 'absolute',
          left: 10 * s,
          top: 18 * s,
          width: 4 * s,
          height: 3 * s,
          borderBottomLeftRadius: 2 * s,
          borderBottomRightRadius: 2 * s,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function PuzzleIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, weight = DEFAULT_WEIGHT }: IconProps) {
  // Block with a notched corner — a stylised "integration" piece
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: 4 * s,
          top: 4 * s,
          width: 16 * s,
          height: 16 * s,
          borderRadius: 3 * s,
          borderWidth: weight,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 14 * s,
          top: 8 * s,
          width: 4 * s,
          height: 4 * s,
          borderRadius: 2 * s,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function NoteIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, weight = DEFAULT_WEIGHT }: IconProps) {
  // A sheet of paper with text lines — reads as "notes" at tab-bar sizes.
  const s = size / DEFAULT_SIZE;
  return (
    <View style={[iconStyles.box, { width: size, height: size }]}>
      {/* Paper body */}
      <View
        style={{
          position: 'absolute',
          left: 5 * s,
          top: 3 * s,
          width: 14 * s,
          height: 18 * s,
          borderRadius: 3 * s,
          borderWidth: weight,
          borderColor: color,
        }}
      />
      {/* Text lines */}
      {[8, 12, 16].map((top, i) => (
        <View
          key={top}
          style={{
            position: 'absolute',
            left: 8 * s,
            top: top * s,
            width: (i === 2 ? 5 : 8) * s,
            height: weight,
            borderRadius: weight,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

const iconStyles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  stroke: { position: 'absolute', borderRadius: 4 },
});
