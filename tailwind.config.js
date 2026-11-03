/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0d0f12',
        surface: '#16191f',
        'surface-hover': '#212631',
        card: '#1a1e26',
        primary: '#e63946',
        'primary-hover': '#d62828',
        accent: '#f77f00',
        border: '#2a303c',
        muted: '#8b949e',
      },
    },
  },
  plugins: [],
};
