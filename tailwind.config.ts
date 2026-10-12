import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: '#14213d',
        papel: '#f7f5f0',
        selo: '#1f6f50',
        alerta: '#b4441c',
        ambar: '#b7791f',
      },
      fontFamily: { sans: ['var(--fonte)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
