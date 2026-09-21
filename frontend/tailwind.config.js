/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
      colors: {
        // Obsidian palette
        obsidian: {
          void:        "#050507",
          surface:     "#0c0c11",
          raised:      "#111118",
          elevated:    "#17171f",
        },
        indigo: {
          DEFAULT:     "#6C63FF",
          50:          "#f0effe",
          100:         "#c4bfff",
          200:         "#a49dff",
          300:         "#8880ff",
          400:         "#6C63FF",
          500:         "#5b52d9",
          600:         "#4a40b0",
          700:         "#352e80",
          800:         "#252060",
          900:         "#1a1640",
        },
        cyan: {
          DEFAULT:     "#22D3EE",
        },
        success:       "#10E7A0",
        warning:       "#F5B754",
        danger:        "#FF5C7A",
      },
      borderRadius: {
        DEFAULT: "6px",
        xs:      "4px",
        sm:      "8px",
        md:      "12px",
        lg:      "16px",
      },
    },
  },
  plugins: [],
};
