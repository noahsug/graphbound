import rough from 'roughjs'

import { AXIS_MAX, GAME_TITLE, PLOT_DURATION_MS, TILE_DEFINITIONS, V1_SECTIONS } from './content'
import { evaluateSectionPlot } from './math'
import type {
  DragState,
  GoalDefinition,
  Layout,
  PlotPoint,
  Point,
  Rect,
  SectionDefinition,
  SectionRuntime,
  TileDefinition,
  TileId,
  TokenLayout,
} from './types'

const INK = '#48382a'
const PAPER = '#fffaf0'
const BOARD_FILL = '#fff5dd'
const GRID = '#d9c7a1'
const AXIS = '#8f7352'
const SLOT_GLOW = '#6bb9b2'
const PLOT = '#238b84'
const GOAL = '#eb6f5a'
const SUCCESS = '#7bb05f'
const NOTE = '#f8e2a2'
const SHADOW = 'rgba(88, 59, 25, 0.16)'

type RoughCanvas = ReturnType<typeof rough.canvas>

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function roundRectPath(context: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const corner = Math.min(radius, rect.width / 2, rect.height / 2)

  context.beginPath()
  context.moveTo(rect.x + corner, rect.y)
  context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, corner)
  context.arcTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x,
    rect.y + rect.height,
    corner,
  )
  context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, corner)
  context.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, corner)
  context.closePath()
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  fillStyle: string,
): void {
  context.save()
  roundRectPath(context, rect, radius)
  context.fillStyle = fillStyle
  context.fill()
  context.restore()
}

function hashSeed(key: string): number {
  let hash = 2166136261

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash % 2147483646) + 1
}

function seeded(key: string, options: Record<string, unknown>): Record<string, unknown> {
  return {
    ...options,
    seed: hashSeed(key),
  }
}

function createLayout(width: number, height: number): Layout {
  const inset = clamp(width * 0.03, 14, 26)
  const progressionHeight = clamp(height * 0.12, 84, 108)
  const boardWidth = Math.min(width - inset * 2, 760)
  const graphSize = Math.min(boardWidth * 0.58, height * 0.42, 410)
  const equationHeight = clamp(graphSize * 0.18, 56, 72)
  const trayHeight = clamp(graphSize * 0.26, 94, 122)
  const boardHeight =
    clamp(graphSize * 0.14, 44, 60) +
    equationHeight +
    clamp(graphSize * 0.1, 18, 28) +
    graphSize +
    clamp(graphSize * 0.1, 18, 28) +
    trayHeight +
    76
  const board = {
    x: (width - boardWidth) / 2,
    y: progressionHeight + 56,
    width: boardWidth,
    height: Math.min(boardHeight, height - progressionHeight - 80),
  }
  const equation = {
    x: board.x + 24,
    y: board.y + 40,
    width: board.width - 48,
    height: equationHeight,
  }
  const graph = {
    x: board.x + 28,
    y: equation.y + equation.height + 24,
    width: graphSize,
    height: graphSize,
  }
  const note = {
    x: graph.x + graph.width + 26,
    y: graph.y + 8,
    width: board.x + board.width - (graph.x + graph.width + 54),
    height: Math.max(130, graph.height * 0.52),
  }
  const tray = {
    x: board.x + 24,
    y: graph.y + graph.height + 24,
    width: board.width - 48,
    height: trayHeight,
  }

  return {
    width,
    height,
    titleY: 36,
    progression: {
      x: inset,
      y: 62,
      width: width - inset * 2,
      height: progressionHeight,
    },
    board,
    equation,
    graph,
    note,
    tray,
    footerY: board.y + board.height - 18,
  }
}

class GraphboundApp {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly roughCanvas: RoughCanvas
  private readonly resizeObserver: ResizeObserver
  private readonly sections = V1_SECTIONS
  private readonly sectionById = new Map(this.sections.map((section) => [section.id, section]))
  private readonly sectionRuntimes = new Map<string, SectionRuntime>()
  private readonly completedGoals = new Set<string>()
  private readonly completedSections = new Set<string>()
  private readonly unlockedSections = new Set<string>()
  private readonly unlockedTiles = new Set<TileId>(['x'])

  private layout: Layout
  private drag: DragState | null = null
  private selectedTileId: TileId | null = null
  private activeSectionId = this.sections[0].id
  private statusMessage = 'Drag x into the slot to begin the chain.'
  private animationFrame: number | null = null
  private lastFrameTime: number | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to acquire 2D drawing context.')
    }

    this.context = context
    this.roughCanvas = rough.canvas(canvas)
    this.layout = createLayout(960, 720)

    for (const section of this.sections) {
      const placements: Record<string, TileId | null> = {}
      for (const slot of section.slots) {
        placements[slot.id] = null
      }
      this.sectionRuntimes.set(section.id, {
        placements,
        plotResult: null,
        plotProgress: 0,
        animating: false,
        statusMessage: section.blurb,
        pendingGoalIds: [],
        solvedGoalIds: [],
      })

      if (section.initialUnlocked) {
        this.unlockedSections.add(section.id)
      }
    }

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    window.addEventListener('keydown', this.handleKeyDown)

    this.attachDebugHooks()
    this.resize()
  }

  private attachDebugHooks(): void {
    window.render_game_to_text = () => this.renderGameToText()
    window.advanceTime = (ms: number) => this.advanceTime(ms)
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect()
    const width = Math.max(380, Math.round(bounds.width))
    const height = Math.max(640, Math.round(bounds.height))

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    this.layout = createLayout(width, height)
    this.render()
  }

  private get activeSection(): SectionDefinition {
    return this.sectionById.get(this.activeSectionId) ?? this.sections[0]
  }

  private get activeRuntime(): SectionRuntime {
    const runtime = this.sectionRuntimes.get(this.activeSectionId)

    if (!runtime) {
      throw new Error(`Missing runtime for section ${this.activeSectionId}`)
    }

    return runtime
  }

  private activeTileIds(): TileId[] {
    return [...this.unlockedTiles]
  }

  private getPointerPoint(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect()

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * this.canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * this.canvas.height,
    }
  }

  private progressionCardRect(index: number, count: number): Rect {
    const gap = 14
    const width = Math.min(156, (this.layout.progression.width - gap * (count - 1)) / count)
    return {
      x: this.layout.progression.x + index * (width + gap),
      y: this.layout.progression.y + 28,
      width,
      height: this.layout.progression.height - 36,
    }
  }

  private trayTileRects(): Array<{ tileId: TileId; rect: Rect }> {
    const used = new Set(Object.values(this.activeRuntime.placements).filter(Boolean) as TileId[])
    const available = this.activeTileIds().filter((tileId) => !used.has(tileId))
    const size = clamp(this.layout.tray.height * 0.54, 54, 68)
    const gap = 14
    const startX = this.layout.tray.x + 22
    const centerY = this.layout.tray.y + this.layout.tray.height / 2 + 10

    return available.map((tileId, index) => ({
      tileId,
      rect: {
        x: startX + index * (size + gap),
        y: centerY - size / 2,
        width: size,
        height: size,
      },
    }))
  }

  private tokenLayouts(): TokenLayout[] {
    const section = this.activeSection
    const width = clamp(this.layout.equation.height - 12, 42, 58)
    const gap = 12
    const prefixWidth = 54
    const totalWidth =
      prefixWidth + section.equation.length * width + (section.equation.length - 1) * gap
    let cursor = this.layout.equation.x + (this.layout.equation.width - totalWidth) / 2 + prefixWidth

    return section.equation.map((part) => {
      const rect = {
        x: cursor,
        y: this.layout.equation.y + (this.layout.equation.height - width) / 2,
        width,
        height: width,
      }
      cursor += width + gap
      return { rect, part }
    })
  }

  private slotRect(slotId: string): Rect | null {
    const token = this.tokenLayouts().find(
      (layout) => layout.part.type === 'slot' && layout.part.slotId === slotId,
    )

    return token?.rect ?? null
  }

  private slottedTileRect(slotId: string): Rect | null {
    const rect = this.slotRect(slotId)
    if (!rect) {
      return null
    }

    return {
      x: rect.x + 2,
      y: rect.y + 2,
      width: rect.width - 4,
      height: rect.height - 4,
    }
  }

  private compatibleSlots(tileId: TileId): string[] {
    return this.activeSection.slots
      .filter((slot) => slot.allowedTiles.includes(tileId))
      .map((slot) => slot.id)
  }

  private placementExpression(sectionId: string): string {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return 'y = _'
    }

    const tokens = section.equation.map((part) => {
      if (part.type === 'fixed') {
        return part.value
      }
      const tileId = runtime.placements[part.slotId]
      return tileId ? TILE_DEFINITIONS[tileId].label : '_'
    })

    return `y = ${tokens.join(' ')}`
  }

  private updateSectionPlot(sectionId: string, animated: boolean): void {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return
    }

    const result = evaluateSectionPlot(section, runtime.placements)
    runtime.plotResult = result
    runtime.pendingGoalIds = result?.achievedGoalIds ?? []

    if (!result) {
      runtime.plotProgress = 0
      runtime.animating = false
      runtime.statusMessage = section.blurb
      if (this.activeSectionId === sectionId) {
        this.statusMessage = 'Fill every slot to draw the line.'
      }
      return
    }

    const newGoals = result.achievedGoalIds.filter(
      (goalId) => !this.completedGoals.has(`${sectionId}:${goalId}`),
    )
    runtime.statusMessage =
      newGoals.length > 0
        ? `A route is lined up: ${newGoals.map((goalId) => this.goalLabel(section, goalId)).join(', ')}`
        : 'That line is already known. Try another route.'

    if (!result.hasVisiblePath) {
      runtime.plotProgress = 0
      runtime.animating = false
      runtime.statusMessage = 'The line never enters the graph bounds.'
      if (this.activeSectionId === sectionId) {
        this.statusMessage = runtime.statusMessage
      }
      return
    }

    runtime.plotProgress = animated ? 0 : 1
    runtime.animating = animated

    if (!animated && newGoals.length > 0) {
      this.finalizeGoals(sectionId)
    }

    if (this.activeSectionId === sectionId) {
      this.statusMessage = animated ? `Plotting ${result.screenLabel}...` : runtime.statusMessage
    }
  }

  private finalizeGoals(sectionId: string): void {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime || !runtime.plotResult) {
      return
    }

    const newGoals = runtime.plotResult.achievedGoalIds.filter(
      (goalId) => !this.completedGoals.has(`${sectionId}:${goalId}`),
    )

    if (newGoals.length === 0) {
      this.statusMessage = runtime.statusMessage
      return
    }

    for (const goalId of newGoals) {
      this.completedGoals.add(`${sectionId}:${goalId}`)
      const goal = section.goals.find((candidate) => candidate.id === goalId)
      for (const unlockId of goal?.unlocks ?? []) {
        this.unlockedSections.add(unlockId)
      }
    }

    runtime.solvedGoalIds = section.goals
      .filter((goal) => this.completedGoals.has(`${sectionId}:${goal.id}`))
      .map((goal) => goal.id)

    if (runtime.solvedGoalIds.length === section.goals.length) {
      if (!this.completedSections.has(sectionId)) {
        this.completedSections.add(sectionId)
        if (section.rewardTileId) {
          this.unlockedTiles.add(section.rewardTileId)
          this.statusMessage = `Section complete. New tile unlocked: ${TILE_DEFINITIONS[section.rewardTileId].label}`
        } else {
          this.statusMessage = `${section.title} is fully solved.`
        }
      }
    } else {
      this.statusMessage = `New path unlocked from ${section.title}.`
    }
  }

  private goalLabel(section: SectionDefinition, goalId: string): string {
    return section.goals.find((goal) => goal.id === goalId)?.label ?? goalId
  }

  private setSelectedTile(tileId: TileId | null): void {
    this.selectedTileId = tileId
    this.render()
  }

  private pickUpSlotTile(slotId: string): void {
    const tileId = this.activeRuntime.placements[slotId]
    if (!tileId) {
      return
    }

    this.activeRuntime.placements[slotId] = null
    this.setSelectedTile(tileId)
    this.updateSectionPlot(this.activeSectionId, false)
    this.statusMessage = `Picked up ${TILE_DEFINITIONS[tileId].label}.`
  }

  private placeTileInSlot(tileId: TileId, slotId: string, animated: boolean): void {
    const slot = this.activeSection.slots.find((candidate) => candidate.id === slotId)

    if (!slot || !slot.allowedTiles.includes(tileId)) {
      return
    }

    for (const currentSlot of this.activeSection.slots) {
      if (this.activeRuntime.placements[currentSlot.id] === tileId) {
        this.activeRuntime.placements[currentSlot.id] = null
      }
    }

    this.activeRuntime.placements[slotId] = tileId
    this.setSelectedTile(null)
    this.updateSectionPlot(this.activeSectionId, animated)
    this.ensureAnimation()
    this.render()
  }

  private beginAnimationIfNeeded(): void {
    if (this.activeRuntime.animating) {
      this.ensureAnimation()
    }
  }

  private ensureAnimation(): void {
    if (this.animationFrame !== null) {
      return
    }

    this.lastFrameTime = null
    this.animationFrame = window.requestAnimationFrame(this.animate)
  }

  private animate = (timestamp: number): void => {
    if (this.lastFrameTime === null) {
      this.lastFrameTime = timestamp
    }

    const deltaMs = clamp(timestamp - this.lastFrameTime, 0, 32)
    this.lastFrameTime = timestamp
    const keepGoing = this.step(deltaMs)
    this.render()

    if (keepGoing) {
      this.animationFrame = window.requestAnimationFrame(this.animate)
      return
    }

    this.animationFrame = null
    this.lastFrameTime = null
  }

  private step(deltaMs: number): boolean {
    let keepGoing = false

    for (const section of this.sections) {
      const runtime = this.sectionRuntimes.get(section.id)
      if (!runtime || !runtime.animating) {
        continue
      }

      runtime.plotProgress = clamp(runtime.plotProgress + deltaMs / PLOT_DURATION_MS, 0, 1)
      if (runtime.plotProgress >= 1) {
        runtime.animating = false
        this.finalizeGoals(section.id)
      } else {
        keepGoing = true
      }
    }

    return keepGoing
  }

  private advanceTime(ms: number): void {
    const steps = Math.max(1, Math.ceil(ms / (1000 / 60)))
    const sliceMs = ms / steps

    for (let index = 0; index < steps; index += 1) {
      this.step(sliceMs)
    }

    this.render()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const point = this.getPointerPoint(event)
    const activeCards = this.sections.filter((section) => this.unlockedSections.has(section.id))

    activeCards.forEach((section, index) => {
      const rect = this.progressionCardRect(index, activeCards.length)
      if (!pointInRect(point, rect)) {
        return
      }

      this.activeSectionId = section.id
      this.statusMessage = this.activeRuntime.statusMessage
      this.render()
      this.drag = null
    })

    for (const { tileId, rect } of this.trayTileRects()) {
      if (!pointInRect(point, rect)) {
        continue
      }

      this.drag = {
        kind: 'tile',
        pointerId: event.pointerId,
        tileId,
        current: point,
        offset: {
          x: point.x - rect.x,
          y: point.y - rect.y,
        },
        sourceSlotId: null,
        dragging: false,
        start: point,
      }
      this.canvas.setPointerCapture(event.pointerId)
      this.render()
      return
    }

    for (const slot of this.activeSection.slots) {
      const rect = this.slottedTileRect(slot.id)
      const tileId = this.activeRuntime.placements[slot.id]
      if (!rect || !tileId || !pointInRect(point, rect)) {
        continue
      }

      this.drag = {
        kind: 'tile',
        pointerId: event.pointerId,
        tileId,
        current: point,
        offset: {
          x: point.x - rect.x,
          y: point.y - rect.y,
        },
        sourceSlotId: slot.id,
        dragging: false,
        start: point,
      }
      this.canvas.setPointerCapture(event.pointerId)
      this.render()
      return
    }

    if (this.selectedTileId) {
      const target = this.compatibleSlots(this.selectedTileId).find((slotId) => {
        const rect = this.slotRect(slotId)
        return rect ? pointInRect(point, rect) : false
      })

      if (target) {
        this.placeTileInSlot(this.selectedTileId, target, true)
        return
      }

      this.setSelectedTile(null)
      this.statusMessage = 'Tile set back in the tray.'
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return
    }

    this.drag.current = this.getPointerPoint(event)

    if (!this.drag.dragging && distance(this.drag.start, this.drag.current) > 10) {
      this.drag.dragging = true

      if (this.drag.kind === 'tile' && this.drag.sourceSlotId) {
        this.activeRuntime.placements[this.drag.sourceSlotId] = null
        this.updateSectionPlot(this.activeSectionId, false)
      }
    }

    this.render()
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return
    }

    const point = this.getPointerPoint(event)

    try {
      this.canvas.releasePointerCapture(event.pointerId)
    } catch {
      // No-op.
    }

    if (this.drag.kind === 'tile') {
      const targetSlot = this.compatibleSlots(this.drag.tileId).find((slotId) => {
        const rect = this.slotRect(slotId)
        return rect ? pointInRect(point, rect) : false
      })

      if (this.drag.dragging) {
        if (targetSlot) {
          this.placeTileInSlot(this.drag.tileId, targetSlot, true)
        } else if (this.drag.sourceSlotId) {
          this.activeRuntime.placements[this.drag.sourceSlotId] = this.drag.tileId
          this.updateSectionPlot(this.activeSectionId, false)
          this.statusMessage = 'The tile snapped back to its slot.'
          this.render()
        } else {
          this.statusMessage = 'The tile returned to the tray.'
          this.render()
        }
      } else if (this.drag.sourceSlotId) {
        this.pickUpSlotTile(this.drag.sourceSlotId)
      } else {
        this.setSelectedTile(this.drag.tileId === this.selectedTileId ? null : this.drag.tileId)
        this.statusMessage = this.selectedTileId
          ? `Picked up ${TILE_DEFINITIONS[this.selectedTileId].label}. Tap a matching slot.`
          : 'Tile deselected.'
      }
    }

    this.drag = null
    this.beginAnimationIfNeeded()
    this.render()
  }

  private handlePointerCancel = (): void => {
    this.drag = null
    this.render()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'f') {
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      } else {
        void this.canvas.requestFullscreen()
      }
      return
    }

    if (!this.selectedTileId) {
      return
    }

    const quickPlace = this.compatibleSlots(this.selectedTileId).find(
      (slotId) => !this.activeRuntime.placements[slotId],
    )

    if (event.key === 'Enter' && quickPlace) {
      this.placeTileInSlot(this.selectedTileId, quickPlace, true)
    }
  }

  private graphPointToScreen(point: PlotPoint): Point {
    return {
      x: this.layout.graph.x + (point.x / AXIS_MAX) * this.layout.graph.width,
      y: this.layout.graph.y + this.layout.graph.height - (point.y / AXIS_MAX) * this.layout.graph.height,
    }
  }

  private drawBackground(): void {
    const context = this.context
    const { width, height } = this.canvas

    context.clearRect(0, 0, width, height)

    const sky = context.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#fdf7eb')
    sky.addColorStop(1, '#ead2a0')
    context.fillStyle = sky
    context.fillRect(0, 0, width, height)

    context.fillStyle = 'rgba(255, 255, 255, 0.38)'
    context.beginPath()
    context.ellipse(width * 0.22, height * 0.14, width * 0.2, height * 0.1, -0.2, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.ellipse(width * 0.78, height * 0.13, width * 0.18, height * 0.08, 0.12, 0, Math.PI * 2)
    context.fill()

    this.roughCanvas.circle(
      width * 0.1,
      height * 0.78,
      84,
      seeded('bg-circle', {
        stroke: 'rgba(120, 93, 58, 0.18)',
        strokeWidth: 1.5,
        fillStyle: 'zigzag',
        fill: 'rgba(244, 214, 164, 0.16)',
        roughness: 1.5,
      }),
    )
    this.roughCanvas.rectangle(
      width * 0.84,
      height * 0.72,
      86,
      62,
      seeded('bg-rect', {
        stroke: 'rgba(120, 93, 58, 0.18)',
        strokeWidth: 1.2,
        roughness: 1.7,
      }),
    )
  }

  private drawTitle(): void {
    const context = this.context
    const centerX = this.layout.width / 2

    context.save()
    context.fillStyle = INK
    context.font = "30px 'Short Stack', cursive"
    context.textAlign = 'center'
    context.fillText(GAME_TITLE, centerX, this.layout.titleY)
    context.font = "18px 'Patrick Hand', cursive"
    context.fillStyle = '#7b6246'
    context.fillText('v1 - linear chain', centerX, this.layout.titleY + 26)
    context.restore()
  }

  private drawProgression(): void {
    const context = this.context
    const visibleSections = this.sections.filter((section) => this.unlockedSections.has(section.id))

    this.roughCanvas.rectangle(
      this.layout.progression.x,
      this.layout.progression.y,
      this.layout.progression.width,
      this.layout.progression.height,
      seeded('progression-shell', {
        stroke: INK,
        strokeWidth: 2.2,
        fill: '#fff4d5',
        fillStyle: 'solid',
        roughness: 1.2,
      }),
    )

    context.save()
    context.fillStyle = AXIS
    context.font = "18px 'Short Stack', cursive"
    context.fillText('unlocked graph strip', this.layout.progression.x + 18, this.layout.progression.y + 20)

    visibleSections.forEach((section, index) => {
      const rect = this.progressionCardRect(index, visibleSections.length)
      const active = section.id === this.activeSectionId
      const solved = this.completedSections.has(section.id)
      const runtime = this.sectionRuntimes.get(section.id)

      this.roughCanvas.rectangle(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        seeded(`progression:${section.id}`, {
          stroke: active ? SLOT_GLOW : INK,
          strokeWidth: active ? 3 : 1.8,
          fill: solved ? '#e3f2d3' : '#fffaf0',
          fillStyle: 'solid',
          roughness: 1.4,
        }),
      )

      context.fillStyle = active ? '#22655d' : INK
      context.font = "17px 'Short Stack', cursive"
      context.fillText(section.title, rect.x + 14, rect.y + 24)
      context.font = "16px 'Patrick Hand', cursive"
      context.fillStyle = AXIS
      context.fillText(`reward ${section.rewardTileId ?? '-'}`, rect.x + 14, rect.y + 48)
      context.fillText(
        `${runtime?.solvedGoalIds.length ?? 0}/${section.goals.length} goals`,
        rect.x + 14,
        rect.y + rect.height - 18,
      )
    })

    context.restore()
  }

  private drawBoard(): void {
    const context = this.context
    const { board } = this.layout

    context.save()
    context.shadowColor = SHADOW
    context.shadowBlur = 18
    context.shadowOffsetY = 10
    fillRoundedRect(context, board, 24, PAPER)
    context.restore()

    this.roughCanvas.rectangle(
      board.x,
      board.y,
      board.width,
      board.height,
      seeded('detail-board', {
        stroke: INK,
        strokeWidth: 2.4,
        fill: BOARD_FILL,
        fillStyle: 'solid',
        roughness: 1.4,
        bowing: 1.1,
      }),
    )
  }

  private drawEquationBar(): void {
    const context = this.context
    const runtime = this.activeRuntime

    this.roughCanvas.rectangle(
      this.layout.equation.x,
      this.layout.equation.y,
      this.layout.equation.width,
      this.layout.equation.height,
      seeded(`equation-shell:${this.activeSectionId}`, {
        stroke: INK,
        strokeWidth: 2,
        fill: '#fff0c9',
        fillStyle: 'solid',
        roughness: 1.3,
      }),
    )

    context.save()
    context.fillStyle = INK
    context.font = "30px 'Short Stack', cursive"
    context.textBaseline = 'middle'
    context.fillText('y =', this.layout.equation.x + 18, this.layout.equation.y + this.layout.equation.height / 2 + 1)

    for (const token of this.tokenLayouts()) {
      if (token.part.type === 'fixed') {
        context.fillText(
          token.part.value,
          token.rect.x + token.rect.width / 2 - 10,
          token.rect.y + token.rect.height / 2 + 1,
        )
        continue
      }

      const tileId = runtime.placements[token.part.slotId]
      const activeTileId = this.drag?.kind === 'tile' ? this.drag.tileId : this.selectedTileId
      const compatible = activeTileId
        ? this.compatibleSlots(activeTileId).includes(token.part.slotId)
        : false

      context.save()
      roundRectPath(context, token.rect, 12)
      context.lineWidth = compatible ? 3 : 2
      context.strokeStyle = compatible ? SLOT_GLOW : AXIS
      context.setLineDash([7, 7])
      context.stroke()
      context.setLineDash([])
      context.restore()

      if (tileId) {
        this.drawTile(
          this.slottedTileRect(token.part.slotId) ?? token.rect,
          TILE_DEFINITIONS[tileId],
          false,
          `slot:${this.activeSectionId}:${token.part.slotId}`,
        )
      }
    }

    context.restore()
  }

  private drawGraph(): void {
    const context = this.context
    const runtime = this.activeRuntime
    const graph = this.layout.graph

    fillRoundedRect(context, graph, 18, '#fffef8')
    this.roughCanvas.rectangle(
      graph.x,
      graph.y,
      graph.width,
      graph.height,
      seeded(`graph-shell:${this.activeSectionId}`, {
        stroke: INK,
        strokeWidth: 2,
        fill: 'rgba(255, 255, 255, 0.2)',
        fillStyle: 'solid',
        roughness: 1.1,
      }),
    )

    context.save()
    context.strokeStyle = GRID
    context.lineWidth = 1

    for (let index = 0; index <= AXIS_MAX; index += 1) {
      const x = graph.x + (graph.width / AXIS_MAX) * index
      const y = graph.y + (graph.height / AXIS_MAX) * index
      context.beginPath()
      context.moveTo(x, graph.y)
      context.lineTo(x, graph.y + graph.height)
      context.stroke()
      context.beginPath()
      context.moveTo(graph.x, y)
      context.lineTo(graph.x + graph.width, y)
      context.stroke()
    }

    context.strokeStyle = AXIS
    context.lineWidth = 2.2
    context.beginPath()
    context.moveTo(graph.x, graph.y + graph.height)
    context.lineTo(graph.x + graph.width, graph.y + graph.height)
    context.moveTo(graph.x, graph.y + graph.height)
    context.lineTo(graph.x, graph.y)
    context.stroke()

    context.fillStyle = AXIS
    context.font = "15px 'Patrick Hand', cursive"
    context.textAlign = 'center'
    context.textBaseline = 'top'
    for (let index = 0; index <= AXIS_MAX; index += 1) {
      const x = graph.x + (graph.width / AXIS_MAX) * index
      context.fillText(String(index), x, graph.y + graph.height + 8)
    }

    context.textAlign = 'right'
    context.textBaseline = 'middle'
    for (let index = 0; index <= AXIS_MAX; index += 1) {
      const y = graph.y + graph.height - (graph.height / AXIS_MAX) * index
      context.fillText(String(index), graph.x - 10, y)
    }

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.font = "18px 'Short Stack', cursive"
    context.fillText('y', graph.x - 2, graph.y - 12)
    context.fillText('x', graph.x + graph.width + 12, graph.y + graph.height + 22)

    for (const goal of this.activeSection.goals) {
      this.drawGoal(goal)
    }

    if (runtime.plotResult && runtime.plotResult.points.length > 1) {
      const visibleCount = Math.max(
        2,
        Math.round(runtime.plotResult.points.length * clamp(runtime.plotProgress, 0, 1)),
      )
      const visiblePoints = runtime.plotResult.points.slice(0, visibleCount).map((point) => this.graphPointToScreen(point))

      context.strokeStyle = 'rgba(23, 72, 69, 0.18)'
      context.lineWidth = 8
      context.lineCap = 'round'
      context.beginPath()
      visiblePoints.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y)
        } else {
          context.lineTo(point.x, point.y)
        }
      })
      context.stroke()

      context.strokeStyle = PLOT
      context.lineWidth = 5
      context.beginPath()
      visiblePoints.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y)
        } else {
          context.lineTo(point.x, point.y)
        }
      })
      context.stroke()
    }

    context.restore()
  }

  private drawGoal(goal: GoalDefinition): void {
    const context = this.context
    const solved = this.completedGoals.has(`${this.activeSectionId}:${goal.id}`)
    const graph = this.layout.graph

    context.save()
    context.strokeStyle = solved ? SUCCESS : GOAL
    context.lineWidth = 6
    context.lineCap = 'round'
    context.beginPath()

    if (goal.edge === 'top') {
      const startX = graph.x + (goal.min / AXIS_MAX) * graph.width
      const endX = graph.x + (goal.max / AXIS_MAX) * graph.width
      context.moveTo(startX, graph.y)
      context.lineTo(endX, graph.y)
    }
    if (goal.edge === 'right') {
      const startY = graph.y + graph.height - (goal.min / AXIS_MAX) * graph.height
      const endY = graph.y + graph.height - (goal.max / AXIS_MAX) * graph.height
      context.moveTo(graph.x + graph.width, startY)
      context.lineTo(graph.x + graph.width, endY)
    }
    if (goal.edge === 'left') {
      const startY = graph.y + graph.height - (goal.min / AXIS_MAX) * graph.height
      const endY = graph.y + graph.height - (goal.max / AXIS_MAX) * graph.height
      context.moveTo(graph.x, startY)
      context.lineTo(graph.x, endY)
    }
    if (goal.edge === 'bottom') {
      const startX = graph.x + (goal.min / AXIS_MAX) * graph.width
      const endX = graph.x + (goal.max / AXIS_MAX) * graph.width
      context.moveTo(startX, graph.y + graph.height)
      context.lineTo(endX, graph.y + graph.height)
    }

    context.stroke()
    context.restore()
  }

  private drawTile(
    rect: Rect,
    tile: TileDefinition,
    active: boolean,
    seedKey: string,
  ): void {
    const context = this.context

    context.save()
    context.shadowColor = SHADOW
    context.shadowBlur = active ? 18 : 8
    context.shadowOffsetY = active ? 8 : 4
    fillRoundedRect(context, rect, 14, tile.fill)
    context.restore()

    this.roughCanvas.rectangle(
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      seeded(`tile:${seedKey}`, {
        stroke: INK,
        strokeWidth: 2.3,
        fill: tile.fill,
        fillStyle: 'solid',
        roughness: 1.45,
        bowing: 1.2,
      }),
    )

    context.save()
    context.fillStyle = tile.text
    context.font = "28px 'Short Stack', cursive"
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(tile.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 2)
    context.restore()
  }

  private drawTray(): void {
    const context = this.context

    this.roughCanvas.rectangle(
      this.layout.tray.x,
      this.layout.tray.y,
      this.layout.tray.width,
      this.layout.tray.height,
      seeded(`tray:${this.activeSectionId}`, {
        stroke: INK,
        strokeWidth: 2,
        fill: '#f7e9bf',
        fillStyle: 'solid',
        roughness: 1.2,
      }),
    )

    context.save()
    context.fillStyle = AXIS
    context.font = "19px 'Short Stack', cursive"
    context.fillText('tile tray', this.layout.tray.x + 18, this.layout.tray.y + 24)
    context.font = "16px 'Patrick Hand', cursive"
    context.fillText('Unlocked tiles stay reusable between graphs.', this.layout.tray.x + 18, this.layout.tray.y + 46)
    context.restore()

    for (const { tileId, rect } of this.trayTileRects()) {
      this.drawTile(rect, TILE_DEFINITIONS[tileId], tileId === this.selectedTileId, `tray:${tileId}`)
    }

    if (this.drag?.kind === 'tile' && this.drag.dragging) {
      const rect = {
        x: this.drag.current.x - this.drag.offset.x,
        y: this.drag.current.y - this.drag.offset.y,
        width: clamp(this.layout.tray.height * 0.54, 54, 68),
        height: clamp(this.layout.tray.height * 0.54, 54, 68),
      }
      this.drawTile(rect, TILE_DEFINITIONS[this.drag.tileId], true, `drag:${this.drag.tileId}`)
    }
  }

  private drawNote(): void {
    const context = this.context
    const section = this.activeSection
    const runtime = this.activeRuntime

    this.roughCanvas.rectangle(
      this.layout.note.x,
      this.layout.note.y,
      this.layout.note.width,
      this.layout.note.height,
      seeded(`note:${section.id}`, {
        stroke: INK,
        strokeWidth: 2,
        fill: NOTE,
        fillStyle: 'solid',
        roughness: 1.6,
      }),
    )

    context.save()
    context.fillStyle = INK
    context.font = "20px 'Short Stack', cursive"
    context.fillText(section.title, this.layout.note.x + 18, this.layout.note.y + 28)
    context.font = "17px 'Patrick Hand', cursive"
    context.fillText(section.blurb, this.layout.note.x + 18, this.layout.note.y + 56, this.layout.note.width - 32)
    context.fillText(`Current: ${this.placementExpression(section.id)}`, this.layout.note.x + 18, this.layout.note.y + 92, this.layout.note.width - 32)
    context.fillText(
      `Goals hit: ${runtime.solvedGoalIds.length}/${section.goals.length}`,
      this.layout.note.x + 18,
      this.layout.note.y + 118,
    )
    if (section.rewardTileId) {
      context.fillText(
        `Reward tile: ${TILE_DEFINITIONS[section.rewardTileId].label}`,
        this.layout.note.x + 18,
        this.layout.note.y + 142,
      )
    }
    context.restore()
  }

  private drawFooter(): void {
    const context = this.context

    context.save()
    context.fillStyle = this.completedSections.has(this.activeSectionId) ? SUCCESS : AXIS
    context.font = "20px 'Patrick Hand', cursive"
    context.textAlign = 'center'
    context.fillText(this.statusMessage, this.layout.width / 2, this.layout.footerY)
    context.restore()
  }

  private render(): void {
    this.drawBackground()
    this.drawTitle()
    this.drawProgression()
    this.drawBoard()
    this.drawEquationBar()
    this.drawGraph()
    this.drawTray()
    this.drawNote()
    this.drawFooter()
  }

  private renderGameToText(): string {
    const activeSection = this.activeSection
    const runtime = this.activeRuntime

    return JSON.stringify({
      mode: runtime.animating ? 'plotting' : 'progression',
      controls:
        'drag a tile, or tap a tray tile then tap a matching slot; click an unlocked section card to switch boards',
      coordinateSystem:
        'graph origin bottom-left, x grows right from 0 to 10, y grows up from 0 to 10',
      activeSection: activeSection.id,
      unlockedSections: [...this.unlockedSections],
      unlockedTiles: [...this.unlockedTiles],
      equation: this.placementExpression(this.activeSectionId),
      goalsSolved: runtime.solvedGoalIds,
      plot: {
        expression: runtime.plotResult?.screenLabel ?? null,
        progress: Number(runtime.plotProgress.toFixed(2)),
        pendingGoals: runtime.pendingGoalIds,
      },
      statusMessage: this.statusMessage,
    })
  }
}

export function createGameApp(canvas: HTMLCanvasElement): GraphboundApp {
  return new GraphboundApp(canvas)
}

declare global {
  interface Window {
    advanceTime: (ms: number) => void
    render_game_to_text: () => string
  }
}
