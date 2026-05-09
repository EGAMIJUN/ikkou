import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        horror: ["'Shippori Mincho'", "'Noto Serif JP'", "serif"],
      },
      colors: {
        ink: "#0a0709",
        bone: "#e8e6f0",
        blood: "#7a1014",
      },
    },
  },
  plugins: [],
};

export default config;
