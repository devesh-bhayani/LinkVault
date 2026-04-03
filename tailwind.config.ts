import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAF8F5',
        foreground: '#1A1714',
        accent: {
          DEFAULT: '#C45D3E',
          hover: '#B04E32',
          light: '#F5DDD6',
        },
        tag: {
          coding: '#3B82F6',
          design: '#8B5CF6',
          finance: '#10B981',
          career: '#F59E0B',
          pdf: '#EF4444',
          course: '#EC4899',
          tool: '#6366F1',
          other: '#6B7280',
        },
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        input: '8px',
        pill: '20px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(26, 23, 20, 0.06), 0 1px 2px rgba(26, 23, 20, 0.04)',
        'card-hover': '0 4px 12px rgba(26, 23, 20, 0.08), 0 2px 4px rgba(26, 23, 20, 0.04)',
      },
    },
  },
  plugins: [],
}
export default config
