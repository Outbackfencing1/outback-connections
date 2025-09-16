/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#0D6638",    // Outback green (primary)
          rust: "#B3541E",     // Accent
          charcoal: "#1A1A1A", // Text
          light: "#F5F5F5",    // Light bg
        },
      },
      fontFamily: {
        heading: ["Poppins", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 6px 18px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
