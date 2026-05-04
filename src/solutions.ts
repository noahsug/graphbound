import './style.css'
import './solutions.css'
import puzzlesData from '../puzzles.json'
import { createGameApp } from './game/app'
import { SECTIONS } from './game/content'
import type { Point, SectionDefinition } from './game/types'

interface PuzzleRowJson {
  id: string
  name: string
  equation: string
  intendedSolution: string
  unlocksPuzzle?: string
  unlocksTile?: string
  axes: {
    x: { min: number; max: number }
    y: { min: number; max: number }
  }
  target: Point
}

interface PuzzleJson {
  rows: PuzzleRowJson[]
}

interface SolutionCardData {
  achievedGoalIds: string[]
  expression: string | null
  goalId: string
  imageUrl: string
  index: number
  row: PuzzleRowJson
  section: SectionDefinition
  solved: boolean
  statusMessage: string
}

interface SolutionsTextState {
  generated: number
  modalOpen: boolean
  modalRowId: string | null
  mode: 'solutions'
  problems: Array<{ id: string; status: string }>
  ready: boolean
  total: number
}

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root element.')
}

document.body.classList.add('solutions-page')

const rows = (puzzlesData as PuzzleJson).rows
const sectionByGoalId = new Map<string, SectionDefinition>()

for (const section of SECTIONS) {
  for (const goal of section.goals) {
    sectionByGoalId.set(goal.id, section)
  }
}

root.innerHTML = `
  <main class="solutions-shell">
    <header class="solutions-header">
      <div>
        <h1>Intended Solutions</h1>
        <p>Generated from the real game renderer. Each preview places the authored intended tiles, evaluates the graph, and flags rows that do not solve in the live runtime.</p>
      </div>
      <div class="solutions-summary" aria-live="polite">
        <strong id="solutions-count">0/${rows.length}</strong>
        <span id="solutions-status">rendering previews</span>
      </div>
    </header>
    <div class="solutions-toolbar">
      <input id="solutions-search" class="solutions-search" type="search" placeholder="Search intended solution" />
      <label class="solutions-toggle">
        <input id="solutions-problems-only" type="checkbox" />
        problems only
      </label>
    </div>
    <section id="solutions-grid" class="solutions-grid" aria-live="polite">
      <div class="solutions-loading">Drawing intended solutions...</div>
    </section>
    <div id="solution-modal" class="solution-modal" aria-hidden="true">
      <button id="solution-modal-backdrop" class="solution-modal__backdrop" type="button" aria-label="Close preview"></button>
      <section class="solution-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="solution-modal-title">
        <button id="solution-modal-close" class="solution-modal__close" type="button">Close</button>
        <img id="solution-modal-image" class="solution-modal__image" alt="" />
        <div class="solution-modal__caption">
          <h2 id="solution-modal-title"></h2>
          <p id="solution-modal-expression"></p>
          <p id="solution-modal-meta"></p>
        </div>
      </section>
    </div>
  </main>
  <div class="solutions-renderer" aria-hidden="true">
    <canvas id="solutions-renderer-canvas"></canvas>
  </div>
`

const rendererCanvas = document.querySelector<HTMLCanvasElement>('#solutions-renderer-canvas')
const grid = document.querySelector<HTMLElement>('#solutions-grid')
const count = document.querySelector<HTMLElement>('#solutions-count')
const status = document.querySelector<HTMLElement>('#solutions-status')
const searchInput = document.querySelector<HTMLInputElement>('#solutions-search')
const problemsOnlyInput = document.querySelector<HTMLInputElement>('#solutions-problems-only')
const modal = document.querySelector<HTMLElement>('#solution-modal')
const modalBackdrop = document.querySelector<HTMLButtonElement>('#solution-modal-backdrop')
const modalClose = document.querySelector<HTMLButtonElement>('#solution-modal-close')
const modalImage = document.querySelector<HTMLImageElement>('#solution-modal-image')
const modalTitle = document.querySelector<HTMLElement>('#solution-modal-title')
const modalExpression = document.querySelector<HTMLElement>('#solution-modal-expression')
const modalMeta = document.querySelector<HTMLElement>('#solution-modal-meta')

if (
  !rendererCanvas ||
  !grid ||
  !count ||
  !status ||
  !searchInput ||
  !problemsOnlyInput ||
  !modal ||
  !modalBackdrop ||
  !modalClose ||
  !modalImage ||
  !modalTitle ||
  !modalExpression ||
  !modalMeta
) {
  throw new Error('Missing solutions page elements.')
}

const rendererCanvasElement = rendererCanvas
const gridElement = grid
const countElement = count
const statusElement = status
const searchElement = searchInput
const problemsOnlyElement = problemsOnlyInput
const modalElement = modal
const modalBackdropElement = modalBackdrop
const modalCloseElement = modalClose
const modalImageElement = modalImage
const modalTitleElement = modalTitle
const modalExpressionElement = modalExpression
const modalMetaElement = modalMeta
const app = createGameApp(rendererCanvasElement)
const cards: SolutionCardData[] = []
let activeModalRowId: string | null = null
let modalReturnFocusElement: HTMLElement | null = null
let textState: SolutionsTextState = {
  generated: 0,
  modalOpen: false,
  modalRowId: null,
  mode: 'solutions',
  problems: [],
  ready: false,
  total: rows.length,
}

window.render_game_to_text = () => JSON.stringify(textState)
window.__solutions_debug = {
  getState: () => textState,
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
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

function goalIdForRow(row: PuzzleRowJson): string {
  return `goal-${row.id}`
}

function axisLabel(min: number, max: number): string {
  return `${min}...${max}`
}

function targetLabel(target: Point): string {
  return `(${target.x}, ${target.y})`
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replaceAll('π', 'pi').replaceAll('θ', 'theta')
}

function searchTextVariants(value: string): string {
  const normalized = normalizeSearchText(value)
  const compact = normalized.replace(/\s+/g, '')
  return `${normalized} ${compact}`
}

function searchQueryTerms(value: string): string[] {
  const normalized = normalizeSearchText(value).trim()
  const compact = normalized.replace(/\s+/g, '')
  return [...new Set([normalized, compact].filter(Boolean))]
}

function cardSearchText(card: SolutionCardData): string {
  return searchTextVariants(card.row.intendedSolution)
}

function canvasImageUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.88)
}

function updateTextState(): void {
  textState = {
    generated: cards.length,
    modalOpen: activeModalRowId !== null,
    modalRowId: activeModalRowId,
    mode: 'solutions',
    problems: cards
      .filter((card) => !card.solved)
      .map((card) => ({ id: card.row.id, status: card.statusMessage })),
    ready: cards.length === rows.length,
    total: rows.length,
  }
}

function renderStatus(): void {
  const problemCount = cards.filter((card) => !card.solved).length
  countElement.textContent = `${cards.length}/${rows.length}`
  statusElement.textContent =
    cards.length < rows.length
      ? 'rendering previews'
      : problemCount === 0
        ? 'all intended rows solve'
        : `${problemCount} runtime issue${problemCount === 1 ? '' : 's'}`
}

function renderCards(): void {
  const queryTerms = searchQueryTerms(searchElement.value)
  const problemsOnly = problemsOnlyElement.checked
  const visibleCards = cards.filter((card) => {
    if (problemsOnly && card.solved) {
      return false
    }

    return queryTerms.length === 0 || queryTerms.some((term) => cardSearchText(card).includes(term))
  })

  if (visibleCards.length === 0) {
    gridElement.innerHTML = `<div class="solutions-loading">No matching solution previews.</div>`
    return
  }

  gridElement.innerHTML = visibleCards.map(solutionCardMarkup).join('')
}

function cardByRowId(rowId: string): SolutionCardData | undefined {
  return cards.find((card) => card.row.id === rowId)
}

function cardMatchesCurrentFilters(card: SolutionCardData): boolean {
  const queryTerms = searchQueryTerms(searchElement.value)
  if (problemsOnlyElement.checked && card.solved) {
    return false
  }

  return queryTerms.length === 0 || queryTerms.some((term) => cardSearchText(card).includes(term))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function solutionCardMarkup(card: SolutionCardData): string {
  const title = `${card.index + 1}. ${card.row.id} ${card.row.name}`
  const problem = card.solved
    ? ''
    : `<p class="solution-problem">Runtime status: ${escapeHtml(card.statusMessage)}. Achieved: ${escapeHtml(card.achievedGoalIds.join(', ') || 'none')}.</p>`

  return `
    <article class="solution-card${card.solved ? '' : ' solution-card--problem'}" data-row-id="${escapeHtml(card.row.id)}">
      <button class="solution-preview-button" type="button" data-row-id="${escapeHtml(card.row.id)}" aria-label="Open ${escapeHtml(title)} preview">
        <img class="solution-preview" src="${card.imageUrl}" alt="${escapeHtml(title)} intended solution preview" loading="lazy" />
      </button>
      <div class="solution-card__body">
        <h2>${escapeHtml(title)}</h2>
        <p class="solution-expression">${escapeHtml(card.row.intendedSolution)}</p>
        <p class="solution-template">${escapeHtml(card.row.equation)}</p>
        <p class="solution-meta">x ${axisLabel(card.row.axes.x.min, card.row.axes.x.max)} · y ${axisLabel(card.row.axes.y.min, card.row.axes.y.max)} · target ${targetLabel(card.row.target)}</p>
        <div class="solution-status">${card.solved ? 'solved' : 'not solved'}</div>
        ${problem}
      </div>
    </article>
  `
}

function openSolutionModal(card: SolutionCardData): void {
  const title = `${card.index + 1}. ${card.row.id} ${card.row.name}`
  activeModalRowId = card.row.id
  modalTitleElement.textContent = title
  modalExpressionElement.textContent = card.row.intendedSolution
  modalMetaElement.textContent = `${card.row.equation} · x ${axisLabel(card.row.axes.x.min, card.row.axes.x.max)} · y ${axisLabel(card.row.axes.y.min, card.row.axes.y.max)} · target ${targetLabel(card.row.target)}`
  modalImageElement.src = card.imageUrl
  modalImageElement.alt = `${title} intended solution preview`
  modalElement.classList.add('solution-modal--open')
  modalElement.setAttribute('aria-hidden', 'false')
  document.body.classList.add('solutions-modal-open')
  updateTextState()
  modalCloseElement.focus()
}

function closeSolutionModal(): void {
  if (!activeModalRowId) {
    return
  }

  activeModalRowId = null
  modalElement.classList.remove('solution-modal--open')
  modalElement.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('solutions-modal-open')
  modalImageElement.removeAttribute('src')
  updateTextState()
  if (modalReturnFocusElement?.isConnected) {
    modalReturnFocusElement.focus()
  }
  modalReturnFocusElement = null
}

async function buildCard(row: PuzzleRowJson, index: number): Promise<SolutionCardData> {
  const goalId = goalIdForRow(row)
  const section = sectionByGoalId.get(goalId)

  if (!section) {
    return {
      achievedGoalIds: [],
      expression: null,
      goalId,
      imageUrl: '',
      index,
      row,
      section: SECTIONS[0],
      solved: false,
      statusMessage: 'missing-section',
    }
  }

  const preview = app.previewIntendedSolution(section.id, goalId)
  await nextFrame()

  return {
    achievedGoalIds: preview.achievedGoalIds,
    expression: preview.expression,
    goalId,
    imageUrl: canvasImageUrl(rendererCanvasElement),
    index,
    row,
    section,
    solved: preview.solved,
    statusMessage: preview.statusMessage,
  }
}

async function renderSolutions(): Promise<void> {
  await waitForFonts()
  await nextFrame()
  await nextFrame()

  gridElement.innerHTML = ''
  for (const [index, row] of rows.entries()) {
    const card = await buildCard(row, index)
    cards.push(card)
    updateTextState()
    renderStatus()
    if (cardMatchesCurrentFilters(card)) {
      gridElement.insertAdjacentHTML('beforeend', solutionCardMarkup(card))
    }
  }

  updateTextState()
  renderStatus()
  renderCards()
}

searchElement.addEventListener('input', renderCards)
searchElement.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    event.stopPropagation()
    searchElement.select()
  }
})
problemsOnlyElement.addEventListener('change', renderCards)
gridElement.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const previewButton = target.closest<HTMLButtonElement>('.solution-preview-button')
  const rowId = previewButton?.dataset.rowId
  if (!rowId) {
    return
  }

  const card = cardByRowId(rowId)
  if (card) {
    modalReturnFocusElement = previewButton
    openSolutionModal(card)
  }
})
modalBackdropElement.addEventListener('click', closeSolutionModal)
modalCloseElement.addEventListener('click', closeSolutionModal)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSolutionModal()
  }
})

void renderSolutions()

declare global {
  interface Window {
    __solutions_debug: {
      getState: () => SolutionsTextState
    }
  }
}
