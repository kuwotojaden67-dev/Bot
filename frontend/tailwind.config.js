/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#080a0f',
        charcoal: '#10141f',
        panel: '#151a28',
        borderSubtle: '#22293e',
        accentBlue: '#3b82f6',
        accentPurple: '#8b5cf6',
      },
    },
  },
  plugins: [],
};
