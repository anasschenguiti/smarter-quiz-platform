/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"], // Indique à Tailwind où chercher les classes utilisées
  purge: {
    content: [
      './public/**/*.html',
      './src/**/*.js',
    ],
    // Ajoutez les classes à conserver ici
    safelist: [
      'bg-green-500', // Classe pour les réponses correctes
      'bg-red-500',   // Classe pour les réponses incorrectes
      'text-white',   // Classe commune pour les deux
    ],
  },
  theme: {
    extend: {},
  },
  plugins: [],
};