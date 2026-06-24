/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0f0f11",
        foreground: "#f5f5f5",
        card: "#1a1a1e",
        "card-foreground": "#f5f5f5",
        primary: "#10b981",
        "primary-foreground": "#0f0f11",
        secondary: "#6366f1",
        muted: "#737373",
        "muted-foreground": "#a3a3a3",
        accent: "#10b981",
        border: "#27272a",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
