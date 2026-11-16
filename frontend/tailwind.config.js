/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "rgb(var(--brand) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        page: "rgb(var(--page) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
      },
    },
  },
  plugins: [],
}