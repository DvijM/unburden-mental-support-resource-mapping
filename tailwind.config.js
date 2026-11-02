/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#F9F9FB',
        'surface-low': '#F4F3F5',
        'surface-mid': '#EEEDEF',
        'surface-high': '#E8E7E9',
        ink: '#1A1C1D',
        'ink-soft': '#3C3F46',
        'ink-mute': '#52565E',
        outline: '#B4B7C2',
        primary: '#0D4FB5',
        'primary-2': '#2F63C8',
        'primary-tint': '#EEF3FF',
        crisis: '#BA1A1A',
        'crisis-bg': '#FFDAD6',
        'crisis-ink': '#7A0A0A',
        gold: '#FFE083',
        olive: '#544C16',
        ok: '#0B7A53',
      },
      fontFamily: {
        serif: ['"Noto Serif"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        headline: ['Manrope', '"Noto Serif"', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,28,29,.04), 0 4px 16px rgba(26,28,29,.05)',
        lift: '0 8px 30px rgba(26,28,29,.10)',
      },
      borderRadius: {
        editorial: '6px',
      },
    },
  },
  plugins: [],
};

