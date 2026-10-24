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
        display: ['ShineTypewriter', 'Georgia', 'serif'],
      },
      colors: {
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
          950: 'rgb(var(--brand-950) / <alpha-value>)',
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
