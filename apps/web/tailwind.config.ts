import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          dark: "#0b0f19",
          card: "#131b2e",
          border: "#1e293b",
          accent: "#f59e0b", // Safety amber
          alert: "#ef4444",
          ok: "#10b981",
          warning: "#f59e0b",
          info: "#0ea5e9"
        }
      }
    },
  },
  plugins: [],
};
export default config;
