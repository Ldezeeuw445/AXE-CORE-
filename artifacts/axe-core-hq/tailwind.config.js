/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // AXE Design System — Linear.app Matte Black Palette
        axe: {
          bg: {
            base: '#000000',
            surface: '#0A0A0A',
            elevated: '#111111',
            sidebar: '#000000',
            panel: '#080808',
            hover: '#1A1A1A',
            active: '#1A1A2E',
          },
          text: {
            primary: '#FFFFFF',
            secondary: '#8A8F98',
            muted: '#4A4D54',
            cyan: '#5EE7DF',
            blue: '#60A5FA',
          },
          accent: {
            cyan: '#22D3EE',
            blue: '#3B82F6',
            ice: '#A5F3FC',
            electric: '#00D4FF',
          },
          semantic: {
            success: '#10B981',
            warning: '#F59E0B',
            error: '#EF4444',
            info: '#3B82F6',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        widget: '12px',
        card: '8px',
        button: '6px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      fontSize: {
        'axe-title': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'page-title': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        'section-title': ['1.125rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'small': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '400' }],
        'xs-custom': ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.02em', fontWeight: '500' }],
        'mono-custom': ['0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
        'mono-lg': ['1.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      zIndex: {
        'content': '10',
        'sticky': '50',
        'fixed': '100',
        'overlay': '200',
        'toast': '300',
        'tooltip': '400',
        'fullscreen': '500',
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        'glow-cyan': '0 0 20px rgba(34, 211, 238, 0.1)',
        'glow-cyan-strong': '0 0 32px rgba(34, 211, 238, 0.2)',
        'glow-blue': '0 4px 16px rgba(34, 211, 238, 0.06)',
        'panel': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'modal': '0 24px 64px rgba(0, 0, 0, 0.6)',
        'edge-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.03), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.02)',
        'matte': '0 0 0 1px rgba(255, 255, 255, 0.04)',
        'active-glow': '0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 20px rgba(34, 211, 238, 0.05)',
        'inner-depth': 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "pulse-live": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.5)", opacity: "0.5" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.08" },
          "50%": { opacity: "0.12" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "ellipsis": {
          "0%": { content: "'" },
          "33%": { content: "'.'" },
          "66%": { content: "'..'" },
          "100%": { content: "'...'" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "pulse-live": "pulse-live 2s ease-in-out infinite",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        "shimmer": "shimmer 1.5s infinite",
        "float": "float 3s ease-in-out infinite",
        "spin-slow": "spin-slow 60s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
