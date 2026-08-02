import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Относительный base, чтобы одна и та же сборка работала и в корне домена,
  // и в подпапке GitHub Pages (/ai-review-game/). Роутинга у игры нет,
  // так что этого достаточно.
  base: './',
  plugins: [react(), tailwindcss()],
})
