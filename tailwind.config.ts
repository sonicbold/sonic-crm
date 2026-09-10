import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem" },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Sonic CRM Specific Overrides
        copper: { DEFAULT: "hsl(21 64% 52%)", hover: "hsl(21 64% 45%)" },
        teal: { DEFAULT: "hsl(174 54% 36%)", bright: "hsl(174 54% 48%)" },
        sidebar: { DEFAULT: "hsl(204 47% 15%)", accent: "hsl(204 35% 22%)", border: "hsl(204 31% 25%)", text: "hsl(39 40% 96%)" },
        
        // Soft status tones
        aqua: { soft: "#E2F5F5", text: "#187878", border: "#BFEBEB" },
        peach: { soft: "#FCEBE5", text: "#A64A2B", border: "#F7CFC2" },
        lavender: { soft: "#EBE5F7", text: "#5D4298", border: "#D2C2EB" },
        mint: { soft: "#E2F5EA", text: "#227346", border: "#BBE8CE" },
        rose: { soft: "#FCE8E8", text: "#B32D2D", border: "#F7C2C2" },
        beige: { soft: "#F5F3E9", text: "#73684B", border: "#E6E2CE" }
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
