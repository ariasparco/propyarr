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
        // Near-black backgrounds (base #111315) with a faint teal cast on surfaces
        ink: {
          950: '#0B0D0E',
          900: '#111315',
          850: '#161A1B',
          800: '#1B2122',
          750: '#212829',
          700: '#293233',
          600: '#354143',
          500: '#475355',
        },
        // Primary brand accent — gold (#C9A227)
        brand: {
          50: '#FBF4DD',
          100: '#F5E7B6',
          200: '#EACF82',
          300: '#DEB84F',
          400: '#D2A833',
          500: '#C9A227',
          600: '#A6841E',
          700: '#806515',
          800: '#574611',
          900: '#3A2F0C',
        },
        // Deep teal-green — brand surfaces & panels (#0F3D3E)
        teal: {
          950: '#07201F',
          900: '#0B2D2C',
          800: '#0F3D3E',
          700: '#134D4D',
          600: '#18615F',
          500: '#207A76',
          400: '#379792',
        },
        // Gold alias (kept for existing gold-* utilities)
        gold: {
          300: '#EACF82',
          400: '#DEB84F',
          500: '#C9A227',
          600: '#A6841E',
        },
        line: 'rgba(255,255,255,0.08)',
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
        glow: '0 0 0 1px rgba(201,162,39,0.25), 0 0 40px -8px rgba(201,162,39,0.42)',
        'glow-gold': '0 0 40px -10px rgba(201,162,39,0.5)',
        'glow-teal': '0 0 40px -12px rgba(15,61,62,0.7)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)',
        'card-hover': '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 30px 60px -24px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, transparent, #111315 80%), radial-gradient(circle at 50% -20%, rgba(201,162,39,0.10), transparent 55%)',
        'brand-gradient':
          'linear-gradient(135deg, #C9A227 0%, #DEB84F 50%, #EACF82 100%)',
        'gold-gradient': 'linear-gradient(135deg, #C9A227 0%, #EACF82 100%)',
        'teal-gradient': 'linear-gradient(135deg, #0F3D3E 0%, #18615F 100%)',
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
