import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: '#0E2238',
        papel: '#F2F4F6',
        linha: '#DDE3EA',
        selo: '#0F9D6E',
        alerta: '#D14343',
        ambar: '#E8A317',
        nevoa: '#5B6B7D',
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
} satisfies Config;
