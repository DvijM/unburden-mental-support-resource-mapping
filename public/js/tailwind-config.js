/* Alexandria preset — design tokens shared by every page.
   Loaded after the Tailwind CDN script so `tailwind.config` is applied. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        surface: '#F9F9FB',
        'surface-low': '#F4F3F5',
        'surface-mid': '#EEEDEF',
        'surface-high': '#E8E7E9',
        ink: '#1A1C1D',
        'ink-soft': '#44474E',
        'ink-mute': '#74777F',
        outline: '#C4C6D0',
        primary: '#0D4FB5',
        'primary-2': '#2F63C8',
        'primary-tint': '#EEF3FF',
        crisis: '#BA1A1A',
        'crisis-bg': '#FFDAD6',
        'crisis-ink': '#7A0A0A',
        gold: '#FFE083',
        olive: '#665D1E',
        ok: '#0E9F6E',
      },
      fontFamily: {
        serif: ['"Noto Serif"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,28,29,.04), 0 4px 16px rgba(26,28,29,.05)',
        lift: '0 8px 30px rgba(26,28,29,.10)',
      },
      borderRadius: { editorial: '6px' },
    },
  },
};
