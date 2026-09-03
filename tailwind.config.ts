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
        "brand-pink": "#FBE1E9",
        "brand-crimson": "#C41E3A",
        "brand-crimson-dark": "#8E1428",
      },
      fontFamily: {
        script: ["\"Pacifico\"", "cursive"],
        body: ["\"Nunito\"", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
