import type { Config } from 'tailwindcss';

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
        // Near-black backgrounds with a deep green cast
        ink: {
          950: '#020806',
          900: '#03100B',
          850: '#06160F',
          800: '#091C14',
          750: '#0C2219',
          700: '#122C21',
          600: '#1A392B',
          500: '#264A39',
        },
        // Primary brand accent — neon mint green
        brand: {
          50: '#E8FFF5',
          100: '#C4FFE6',
          200: '#8FFCCD',
          300: '#5CF5B5',
          400: '#2EEB9E',
          500: '#14D98A',
          600: '#0DB271',
          700: '#0A8957',
          800: '#086442',
          900: '#06432D',
        },
        // Deep green — brand surfaces & panels
        teal: {
          950: '#02140D',
          900: '#041D13',
          800: '#06291B',
          700: '#093624',
          600: '#0D4630',
          500: '#135C3F',
          400: '#1B7B54',
        },
        // Warm accent for stars and the "most popular" badge
        gold: {
          300: '#FDE68A',
          400: '#FACC15',
          500: '#EAB308',
          600: '#CA8A04',
        },
        line: 'rgba(46,235,158,0.14)',
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
        glow: '0 0 0 1px rgba(46,235,158,0.25), 0 0 40px -8px rgba(46,235,158,0.45)',
        'glow-gold': '0 0 40px -10px rgba(46,235,158,0.5)',
        'glow-teal': '0 0 40px -12px rgba(9,54,36,0.8)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)',
        'card-hover': '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 30px 60px -24px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, transparent, #03100B 80%), radial-gradient(circle at 50% -20%, rgba(46,235,158,0.10), transparent 55%)',
        'brand-gradient':
          'linear-gradient(90deg, #12D486 0%, #2EEB9E 55%, #6AF7C4 100%)',
        'gold-gradient': 'linear-gradient(90deg, #12D486 0%, #6AF7C4 100%)',
        'teal-gradient': 'linear-gradient(135deg, #06291B 0%, #0D4630 100%)',
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
