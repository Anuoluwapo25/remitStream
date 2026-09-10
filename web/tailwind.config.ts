import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./pages/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary — warm honey/amber. Buttons use a light shade with ink text,
        // so the brand reads as a warm highlight, not a saturated block.
        brand: {
          50: "#fbf6ec",
          100: "#f5e7c9",
          200: "#eccd94",
          300: "#e0b061",
          400: "#d59a3f",
          500: "#c37f26",
          600: "#a2631f",
          700: "#7f4d1f",
          800: "#67401f",
          900: "#56361d",
        },
        // Positive / "saved" — a muted sage, nowhere near neon green.
        accent: {
          50: "#eef3ed",
          100: "#dbe6d8",
          200: "#bacfb4",
          300: "#95b28d",
          400: "#75986c",
          500: "#5b7e53",
          600: "#476341",
          700: "#3b5137",
          800: "#31432f",
          900: "#2b3a29",
        },
        // Errors / danger — warm brick, not a bright rose.
        flag: {
          50: "#faf0ec",
          100: "#f3dccf",
          200: "#e6b6a1",
          300: "#d68f73",
          400: "#c56b4d",
          500: "#b24d30",
          600: "#953d27",
          700: "#793324",
          800: "#642d22",
          900: "#54291f",
        },
        // Surfaces — warm charcoal. Brown-black rather than blue-black, which is
        // most of what made the old palette feel generic.
        ink: {
          950: "#100f0d",
          900: "#161512",
          850: "#1c1a16",
          800: "#232019",
          700: "#332e24",
          600: "#463f31",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "Cambria", "serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
