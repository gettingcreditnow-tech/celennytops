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
      keyframes: {
        "fade-cycle": {
          "0%, 45%": { opacity: "1" },
          "50%, 95%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-cycle": "fade-cycle 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
