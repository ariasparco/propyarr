import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Full 0–100 opacity scale so any /NN color-opacity modifier is valid
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [i, (i / 100).toFixed(2)]),
      ),
      colors: {
        // Every theme colour is a CSS variable (see globals.css), so the whole
        // app switches palette in one place. Propyar runs the light palette.
        //
        // `white` is the *foreground* token, not literal white: in the light
        // theme it is the dark text colour, which is what lets every existing
        // `text-white/60` and `border-white/10` read correctly on a light page.
        // Use `paper` where real white is meant.
        white: 'rgb(var(--fg) / <alpha-value>)',
        paper: '#FFFFFF',
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          750: 'rgb(var(--ink-750) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        teal: {
          950: 'rgb(var(--teal-950) / <alpha-value>)',
          900: 'rgb(var(--teal-900) / <alpha-value>)',
          800: 'rgb(var(--teal-800) / <alpha-value>)',
          700: 'rgb(var(--teal-700) / <alpha-value>)',
          600: 'rgb(var(--teal-600) / <alpha-value>)',
          500: 'rgb(var(--teal-500) / <alpha-value>)',
          400: 'rgb(var(--teal-400) / <alpha-value>)',
        },
        gold: {
          300: 'rgb(var(--gold-300) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)',
        },
        // Status hues used as text on the page: pale on a dark background,
        // they need their deeper shades on a light one.
        red: { ...colors.red, 100: colors.red[700], 200: colors.red[700], 300: colors.red[600] },
        amber: { ...colors.amber, 100: colors.amber[800], 200: colors.amber[700], 300: colors.amber[600] },
        emerald: { ...colors.emerald, 100: colors.emerald[800], 200: colors.emerald[700], 300: colors.emerald[600] },
        sky: { ...colors.sky, 100: colors.sky[800], 200: colors.sky[700], 300: colors.sky[600] },
        orange: { ...colors.orange, 200: colors.orange[700], 300: colors.orange[600] },
        rose: { ...colors.rose, 200: colors.rose[700], 300: colors.rose[600] },
        violet: { ...colors.violet, 200: colors.violet[700], 300: colors.violet[600] },
        line: 'rgb(var(--fg) / 0.09)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        fa: ['var(--font-fa)', 'Tahoma', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        glow: '0 8px 24px -10px rgb(var(--brand-500) / 0.55)',
        'glow-gold': '0 8px 24px -10px rgb(var(--gold-400) / 0.6)',
        'glow-teal': '0 8px 30px -12px rgb(var(--brand-500) / 0.35)',
        card: '0 1px 2px rgb(var(--fg) / 0.04), 0 10px 30px -14px rgb(var(--fg) / 0.16)',
        'card-hover': '0 2px 4px rgb(var(--fg) / 0.05), 0 18px 40px -16px rgb(var(--fg) / 0.22)',
      },
      backgroundImage: {
        'grid-fade': 'linear-gradient(to bottom, transparent, rgb(var(--ink-900)) 80%)',
        'brand-gradient': 'linear-gradient(90deg, rgb(var(--brand-500)) 0%, rgb(var(--brand-600)) 100%)',
        'gold-gradient': 'linear-gradient(90deg, rgb(var(--gold-400)) 0%, rgb(var(--gold-300)) 100%)',
        'teal-gradient': 'linear-gradient(135deg, #0B3D27 0%, #0F6B42 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-glow': {
          '0%,100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(4%,-5%,0) scale(1.1)' },
          '66%': { transform: 'translate3d(-4%,4%,0) scale(0.94)' },
        },
        draw: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        'ticker-flash': {
          '0%': { backgroundColor: 'rgba(15,212,140,0.18)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'rail-shimmer': {
          '0%': { backgroundPosition: '-30% 0' },
          '100%': { backgroundPosition: '130% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both',
        float: 'float 6s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
        drift: 'drift 18s ease-in-out infinite',
        draw: 'draw 2.2s ease-out forwards',
        'rail-shimmer': 'rail-shimmer 3.5s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
