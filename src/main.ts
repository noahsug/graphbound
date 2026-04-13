import './style.css'
import { createGameApp } from './game/app'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root element.')
}

root.innerHTML = `
  <main class="app-shell app-shell--loading">
    <div class="loading-screen" aria-live="polite" aria-label="Loading Graphbound">
      <div class="loading-spinner" aria-hidden="true"></div>
    </div>
    <canvas id="game-canvas" aria-label="Graphbound equation puzzle" hidden></canvas>
  </main>
`

const shell = document.querySelector<HTMLElement>('.app-shell')
const loadingScreen = document.querySelector<HTMLElement>('.loading-screen')
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')

if (!shell) {
  throw new Error('Missing .app-shell element.')
}

if (!loadingScreen) {
  throw new Error('Missing .loading-screen element.')
}

if (!canvas) {
  throw new Error('Missing #game-canvas element.')
}

const appShell = shell
const appLoadingScreen = loadingScreen
const appCanvas = canvas

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function waitForFonts(timeoutMs = 3200): Promise<void> {
  if (!('fonts' in document)) {
    return
  }

  const fontFaceSet = document.fonts
  await Promise.race([
    Promise.all([
      fontFaceSet.load('16px "Schoolbell"'),
      fontFaceSet.load('16px "Short Stack"'),
      fontFaceSet.ready,
    ]).then(() => undefined),
    delay(timeoutMs),
  ])
}

async function bootstrap(): Promise<void> {
  await Promise.all([waitForFonts(), delay(280)])

  appCanvas.hidden = false
  appShell.classList.remove('app-shell--loading')
  createGameApp(appCanvas)

  window.requestAnimationFrame(() => {
    appLoadingScreen.classList.add('loading-screen--hidden')
    window.setTimeout(() => {
      appLoadingScreen.remove()
    }, 220)
  })
}

void bootstrap()
