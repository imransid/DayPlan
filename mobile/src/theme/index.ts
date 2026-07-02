import { Easing } from "react-native-reanimated";

/**
 * Modern liquid-glass palette.
 *
 * Direction: cool lavender base + vivid accent blobs visible *through*
 * translucent surfaces. This gives cards a real "glass" feel — light passes
 * through, edges catch highlights, content stays readable.
 *
 * Keys are kept identical to the previous theme so every screen continues
 * to compile. Only the colour values shift.
 */
export const colors = {
  // ── Base background ───────────────────────────────────────────────────
  // `screen` stays transparent — LiquidGlassBackground paints the canvas.
  // `bg` is the solid fallback used when the background component is
  // unavailable (e.g. Android low-end devices that disable the blur layer).
  screen: "transparent",
  bg: "#eef0fb",

  // ── Glass surfaces ────────────────────────────────────────────────────
  // High alpha so the colourful background reads through the cards.
  // surfaceStrong is for popovers/modals where readability comes first.
  surface: "rgba(255, 255, 255, 0.55)",
  surfaceAlt: "rgba(255, 255, 255, 0.38)",
  surfaceStrong: "rgba(255, 255, 255, 0.85)",
  surfacePressed: "rgba(255, 255, 255, 0.72)",

  // ── Glass borders ─────────────────────────────────────────────────────
  // The bright top edge is what visually sells "glass". The shadow color
  // sits at the bottom of cards via `elevation`.
  border: "rgba(255, 255, 255, 0.55)",
  borderStrong: "rgba(255, 255, 255, 0.85)",
  borderShadow: "rgba(15, 15, 30, 0.08)",

  // ── Text ──────────────────────────────────────────────────────────────
  // Cool deep navy reads better on lavender than the old warm black.
  textPrimary: "#15172b",
  textSecondary: "#4a4d6a",
  textMuted: "#7c7f99",
  textDisabled: "#bfc1d4",

  // ── Brand ─────────────────────────────────────────────────────────────
  primary: "#15172b",
  primaryText: "#ffffff",

  // ── Accent palette ────────────────────────────────────────────────────
  // Modern: indigo / cyan / pink / amber. All saturated enough to "pop"
  // through 50%+ glass surfaces but soft enough not to clash.
  accent: "#6366f1", // indigo — primary accent (was sage)
  accentSoft: "#c7d2fe",
  warm: "#f97316", // tangerine
  warmSoft: "#fed7aa",
  cool: "#06b6d4", // cyan
  coolSoft: "#a5f3fc",
  pink: "#ec4899",
  pinkSoft: "#fbcfe8",

  // ── Status ────────────────────────────────────────────────────────────
  success: "#10b981",
  successBg: "rgba(16, 185, 129, 0.14)",
  warning: "#f59e0b",
  warningBg: "rgba(245, 158, 11, 0.14)",
  danger: "#ef4444",
  dangerBg: "rgba(239, 68, 68, 0.12)",

  // ── Brand colours for integration tiles ───────────────────────────────
  discord: "#5865f2",
  slack: "#611f69",
  telegram: "#229ED9",

  // ── Shadow tokens ─────────────────────────────────────────────────────
  // Cool-tinted shadows blend into the cool background instead of looking
  // muddy like neutral grays would.
  shadowLight: "rgba(40, 30, 80, 0.08)",
  shadowMedium: "rgba(40, 30, 80, 0.14)",
  shadowStrong: "rgba(40, 30, 80, 0.22)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  title: 18,
  heading: 28,
  display: 38,
  hero: 52,
} as const;

/**
 * Composed shadow tokens for iOS + Android. Use as `...elevation.md`.
 */
export const elevation = {
  sm: {
    shadowColor: colors.shadowLight,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
  lg: {
    shadowColor: colors.shadowStrong,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 12,
  },
} as const;

/**
 * Reusable "glass card" preset. Composes the right surface + bright top
 * border + soft shadow so cards consistently read as glass across the app.
 *
 * Usage in StyleSheet.create:
 *
 *   const styles = StyleSheet.create({
 *     myCard: { ...glass.card, padding: 16 },
 *   });
 */
export const glass = {
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.md,
  },
  cardSoft: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
  },
  modal: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...elevation.lg,
  },
} as const;

/**
 * Motion tokens — every spring/timing in the app pulls from here so the
 * "personality" of the motion is unified.
 */
export const motion = {
  springSnappy: { damping: 18, stiffness: 240, mass: 0.8 },
  springSoft: { damping: 22, stiffness: 160, mass: 1 },
  springBounce: { damping: 12, stiffness: 220, mass: 0.7 },

  fast: 180,
  base: 280,
  slow: 420,

  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

/**
 * Gradient colour stops, used directly via interpolateColor or layered
 * Views. Centralising these keeps the colour story coherent.
 */
export const gradients = {
  // Progress 0 → 100. Goes warm → cool → success.
  progress: {
    low: colors.warm,
    mid: "#a78bfa", // violet midpoint
    high: colors.success,
  },
  // Hero / welcome screen accent ring
  hero: ["#a5b4fc", "#c4b5fd", "#fbcfe8"] as const,
  // Background blob colours used by LiquidGlassBackground
  bgBlobs: {
    indigo: "#8b5cf6",
    sky: "#60a5fa",
    pink: "#f472b6",
    mint: "#5eead4",
  },
} as const;
