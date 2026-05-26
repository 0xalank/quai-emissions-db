import type { Config } from "tailwindcss";

// Theme aligned with quai-website-nextjs: true black dark mode, Quai red,
// and the website's local Yapari / Bai Jamjuree / Monorama font stack.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Quai website red.
        quai: {
          50: "#fff1f1",
          100: "#ffdada",
          200: "#ffb3b3",
          300: "#ff8080",
          400: "#ff4747",
          500: "#e20101",
          600: "#c40000",
          700: "#990000",
          800: "#710000",
          900: "#4c0000",
          950: "#260000",
        },
        // Warm amber accent — used around CTAs, eyebrow ticks, secondary signal.
        amber: {
          50:  "#fff6ee",
          100: "#feeadb",
          200: "#fdd1ad",
          300: "#f0a16d", // brand accent
          400: "#d77a40",
          500: "#a84f26", // accent deep
          600: "#823a18",
        },
        // Qi (the second token in the Quai dual-token system) keeps a green
        // identity but shifted slightly to harmonize with the warm palette.
        qi: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
        // Surface palette — neutral black / near-black for dashboard dark mode.
        ink: {
          DEFAULT: "#000000",
          50: "#ffffff",
          100: "#dcdcdc",
          200: "#a1a1a1",
          300: "#878787",
          400: "#646464",
          500: "#393939",
          600: "#161616",
          700: "#0d0d0d",
          800: "#080808",
          900: "#000000",
        },
      },
      fontFamily: {
        sans: ["Bai Jamjuree", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["YapariSemBd", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Monorama", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
      },
      boxShadow: {
        glow: "0 0 8px rgba(226, 1, 1, 0.45)",
        "glow-strong": "0 0 16px rgba(226, 1, 1, 0.55)",
        // Soft ambient panel shadow.
        panel: "0 30px 80px -30px rgba(0, 0, 0, 0.55)",
      },
    },
  },
  plugins: [],
};
export default config;
