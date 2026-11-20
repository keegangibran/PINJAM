import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Balanced Navy Minimalist Tokens
        navy: {
          DEFAULT: '#142D4E',
          50: '#F2F6FA',
          100: '#E8EEF5',
          700: '#1B3B66',
          800: '#142D4E', // Primary Navy
          900: '#0C1B30',
        },
        brand: {
          primary: '#2563EB',   // Primary Blue
          secondary: '#60A5FA', // Secondary Blue
          soft: '#EFF6FF',      // Soft Blue
          hover: '#1D4ED8',
        },
        canvas: '#F8FAFC',      // Background
        surface: '#FFFFFF',     // Surface
        main: '#0F172A',        // Main Text
        borderline: '#E2E8F0',  // Border
        border: {
          DEFAULT: '#E2E8F0',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '1rem',      // 16px (rounded-2xl)
        element: '0.75rem', // 12px (rounded-xl)
        button: '0.625rem', // 10px
      },
    },
  },
  plugins: [],
};

export default config;
