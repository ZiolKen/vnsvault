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
        obsidian:  '#09090f',
        vault:     '#0f0f1a',
        surface:   '#13131f',
        border:    '#1e1e30',
        copper:    '#b87333',
        'copper-light': '#d4956a',
        gold:      '#c9a84c',
        muted:     '#5a5a7a',
        dim:       '#3a3a55',
        ghost:     '#e0e0f0',
        'ghost-dim': '#9090b0',
      },
      fontFamily: {
        // Mirrors the next/font CSS variables declared in layout.tsx / globals.css —
        // single source of truth, no literal family names duplicated here.
        cinzel:   ['var(--font-cinzel)', 'var(--font-cormorant)', 'var(--font-playfair)', 'Georgia', 'serif'],
        heading:  ['var(--font-cormorant)', 'var(--font-playfair)', 'Georgia', 'serif'],
        inter:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'vault-bg': "url('/bg.jpg')",
        'copper-glow': 'radial-gradient(ellipse at 50% 0%, rgba(184,115,51,0.15) 0%, transparent 60%)',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-copper': 'pulseCop 2s ease-in-out infinite',
      },
      keyframes: {
        pulseCop: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(184,115,51,0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(184,115,51,0)' },
        },
      },
      screens: {
        // Add xs breakpoint for small phones
        xs: '390px',
      },
    },
  },
  plugins: [],
};

export default config;
