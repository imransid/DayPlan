export const colors = {
  /** Root behind {@link LiquidGlassBackground} — keep transparent */
  screen: 'transparent',
  bg: '#f5f4ee',
  /** Cards / panels on top of glass */
  surface: 'rgba(255, 253, 248, 0.72)',
  surfaceAlt: 'rgba(241, 239, 232, 0.78)',
  border: 'rgba(255, 255, 255, 0.55)',
  borderStrong: 'rgba(0,0,0,0.14)',

  textPrimary: '#2c2c2a',
  textSecondary: '#5f5e5a',
  textMuted: '#888780',
  textDisabled: '#c0bfb6',

  primary: '#2c2c2a',
  primaryText: '#ffffff',

  success: '#1d9e75',
  successBg: '#f0faf6',
  warning: '#ca8a04',
  danger: '#dc2626',

  discord: '#5865f2',
  slack: '#4a154b',
  telegram: '#229ED9',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 22, pill: 999 } as const;
export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  title: 18,
  heading: 24,
  display: 32,
} as const;
