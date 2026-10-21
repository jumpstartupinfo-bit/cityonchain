/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        green: {
          50:  '#f0f9f0',
          100: '#d4edda',
          200: '#aad9b4',
          300: '#7ac48e',
          400: '#4fb860',
          500: '#2d7a3a',
          600: '#1e5228',
          700: '#163d1e',
          800: '#0f2914',
          900: '#08170a',
        },
        cream: {
          50:  '#fafdf8',
          100: '#f2f5ef',
          200: '#e8ede4',
          300: '#d8e2d2',
          400: '#c4d4bc',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        sans:    ['DM Sans', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
