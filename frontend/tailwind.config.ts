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
        "neural-green": "#00ff88",
        "neural-purple": "#a855f7",
        "neural-pink": "#ff006e",
        "neural-dark": "#0a0a0f",
        "neural-panel": "#12121a",
        "neural-border": "#1a1a2e",
        "neural-text": "#c0c0d0",
        "neural-dim": "#555570",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "SF Mono",
          "Consolas",
          "monospace",
        ],
      },
      animation: {
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "spike-flash": "spikeFlash 0.15s ease-out",
        "scan-line": "scanLine 4s linear infinite",
        "data-scroll": "dataScroll 1s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.6", filter: "brightness(1)" },
          "50%": { opacity: "1", filter: "brightness(1.4)" },
        },
        spikeFlash: {
          "0%": { opacity: "1", transform: "scale(1.3)" },
          "100%": { opacity: "0.7", transform: "scale(1)" },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        dataScroll: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      boxShadow: {
        "neural-glow": "0 0 15px rgba(0, 255, 136, 0.15)",
        "neural-glow-strong": "0 0 25px rgba(0, 255, 136, 0.3)",
        "purple-glow": "0 0 15px rgba(168, 85, 247, 0.15)",
        "pink-glow": "0 0 15px rgba(255, 0, 110, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
