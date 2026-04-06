import './style.css'
import { createGameApp } from './game/app'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root element.')
}

root.innerHTML = `
  <main class="app-shell">
    <canvas id="game-canvas" aria-label="Graphbound equation puzzle"></canvas>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')

if (!canvas) {
  throw new Error('Missing #game-canvas element.')
}

createGameApp(canvas)
