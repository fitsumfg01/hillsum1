/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        apple: {
          white:    '#FFFFFF',
          offwhite: '#F5F5F7',
          silver:   '#E8E8ED',
          gray:     '#6E6E73',
          darkgray: '#3A3A3C',
          black:    '#1D1D1F',
          blue:     '#0071E3',
          bluehover:'#0077ED',
        },
      },
      borderRadius: {
        card: '18px',
        pill: '980px',
      },
    },
  },
  plugins: [],
}
