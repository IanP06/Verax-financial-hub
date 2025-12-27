/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#355071',
                accent: '#d13737',
                secondary: '#1d2e3f',
                background: '#FFFFFF',
            },
        },
    },
    plugins: [],
}
