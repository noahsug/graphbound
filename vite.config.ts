import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/graphbound/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        solutions: 'solutions.html',
      },
    },
  },
}))
