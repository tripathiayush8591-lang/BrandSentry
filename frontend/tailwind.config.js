/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['DynaPuff', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f6f2ff', 100: '#E8DEFF', 200: '#d6c5ff',
          300: '#c3abff', 400: '#b49aff', 500: '#795cf8',
          600: '#5B3DF5', 700: '#4c2cdb', 800: '#3e25ae',
          900: '#342475', 950: '#241b42',
        },
        slate: {
          50: '#faf9fc', 100: '#f0edf5', 200: '#dfdbe7',
          300: '#cbc6d5', 400: '#aaa4b8', 500: '#726b80',
          600: '#5b5468', 700: '#46404f', 800: '#34313c',
          900: '#232128', 950: '#16151a',
        },
        neu: {
          canvas: { light: 'var(--color-canvas)', dark: 'var(--color-canvas)' },
          surface: { light: 'var(--color-surface)', dark: 'var(--color-surface)' },
          border: { light: 'var(--color-border)', dark: 'var(--color-border)' },
          inset: { light: 'var(--color-canvas)', dark: 'var(--color-canvas)' },
        },
      },
      boxShadow: {
        'neu-raised': 'var(--neu-shadow-raised)',
        'neu-raised-sm': 'var(--neu-shadow-raised-sm)',
        'neu-raised-hover': 'var(--neu-shadow-hover)',
        'neu-inset': 'var(--neu-shadow-inset)',
        'neu-inset-sm': 'var(--neu-shadow-inset-sm)',
        'neu-dark-raised': 'var(--neu-shadow-raised)',
        'neu-dark-raised-sm': 'var(--neu-shadow-raised-sm)',
        'neu-dark-raised-hover': 'var(--neu-shadow-hover)',
        'neu-dark-inset': 'var(--neu-shadow-inset)',
        'neu-dark-inset-sm': 'var(--neu-shadow-inset-sm)',
      },
    },
  },
  plugins: [],
};
