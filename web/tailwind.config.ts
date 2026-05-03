import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f5f4ee',
        surface: '#ffffff',
        'surface-alt': '#f1efe8',
        ink: {
          DEFAULT: '#2c2c2a',
          muted: '#5f5e5a',
          subtle: '#888780',
          disabled: '#c0bfb6',
        },
        success: { DEFAULT: '#1d9e75', bg: '#f0faf6' },
        warning: '#ca8a04',
        danger: '#dc2626',
        discord: '#5865f2',
        slack: '#4a154b',
        telegram: '#229ED9',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
