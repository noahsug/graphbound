import rough from 'roughjs'

import {
  DEFAULT_AXES,
  DEFAULT_SECTION_VISUAL,
  PLOT_DURATION_MS,
  SECTIONS,
  TILE_DEFINITIONS,
} from './content'
import { evaluateSectionPlot } from './math'
import type {
  AxisDefinition,
  BoundaryHit,
  DragState,
  GoalDefinition,
  GraphAxes,
  Layout,
  PlotPoint,
  Point,
  Rect,
  SectionDefinition,
  SectionRuntime,
  SectionVisualDefinition,
  TileDefinition,
  TileId,
  TokenLayout,
} from './types'

const INK = '#11211d'
const PAPER = '#fff9ef'
const PAPER_ALT = '#f2ecde'
const GRAPH_FILL = '#fffdf7'
const GRID = 'rgba(63, 86, 82, 0.3)'
const AXIS = '#274841'
const SLOT = 'rgba(31, 53, 49, 0.5)'
const SLOT_GLOW = '#c3ffe3'
const PLOT = '#8ce8db'
const PLOT_GLOW = 'rgba(140, 232, 219, 0.24)'
const GOAL = '#ffba7b'
const FUSE = '#ffe37b'
const SUCCESS = '#abefaa'
const LOCKED = '#efe4cf'
const GRASS_TOP = '#97e4a6'
const GRASS_MID = '#73d3bf'
const GRASS_DARK = '#4fa58a'
const DIRT = '#efc99d'
const DIRT_DARK = '#c99a63'
const RIVER = '#8fdcff'
const RIVER_DARK = '#5db7e3'
const CHALKBOARD_DARK = '#071a18'
const CHALKBOARD_MID = '#0d2e29'
const CHALKBOARD_LIGHT = '#164740'
const CHALK_DUST = 'rgba(228, 245, 236, 0.08)'
const SHADOW = 'rgba(0, 0, 0, 0.2)'
const CAMERA_DURATION_MS = 880
const CAMERA_DELAY_MS = 180
const FUSE_DURATION_MS = 560
const SECTION_DROP_DURATION_MS = 1160
const DROP_HEIGHT_WORLD = 320
const DOG_PET_MS = 1200
const PAN_DRAG_THRESHOLD = 7
const TILE_DRAG_THRESHOLD = 10
const GOAL_EPSILON = 0.12
const KEYBOARD_PAN_SPEED = 700
const KEYBOARD_PAN_RESPONSE = 15
const KEYBOARD_PAN_TURN_DAMPING = 24
const KEYBOARD_PAN_DAMPING = 28
const MIN_CAMERA_VELOCITY = 4
const WHEEL_LINE_PX = 16

type RoughCanvas = ReturnType<typeof rough.canvas>

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2
}

function smoothApproach(current: number, target: number, rate: number, deltaMs: number): number {
  if (deltaMs <= 0) {
    return current
  }

  const blend = 1 - Math.exp((-rate * deltaMs) / 1000)
  return lerp(current, target, blend)
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

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function resolveAxis(axis: AxisDefinition | undefined, fallback: AxisDefinition): AxisDefinition {
  return {
    min: axis?.min ?? fallback.min,
    max: axis?.max ?? fallback.max,
    tickStep: axis?.tickStep ?? fallback.tickStep,
  }
}

function resolveAxes(axes: GraphAxes | undefined): GraphAxes {
  return {
    x: resolveAxis(axes?.x, DEFAULT_AXES.x),
    y: resolveAxis(axes?.y, DEFAULT_AXES.y),
  }
}

function resolveVisual(
  visual: SectionVisualDefinition | undefined,
): Required<SectionVisualDefinition> {
  return {
    terrainWidth: visual?.terrainWidth ?? DEFAULT_SECTION_VISUAL.terrainWidth,
    terrainHeight: visual?.terrainHeight ?? DEFAULT_SECTION_VISUAL.terrainHeight,
    boardX: visual?.boardX ?? DEFAULT_SECTION_VISUAL.boardX,
    boardY: visual?.boardY ?? DEFAULT_SECTION_VISUAL.boardY,
    boardWidth: visual?.boardWidth ?? DEFAULT_SECTION_VISUAL.boardWidth,
    boardHeight: visual?.boardHeight ?? DEFAULT_SECTION_VISUAL.boardHeight,
    graphX: visual?.graphX ?? DEFAULT_SECTION_VISUAL.graphX,
    graphY: visual?.graphY ?? DEFAULT_SECTION_VISUAL.graphY,
    graphWidth: visual?.graphWidth ?? DEFAULT_SECTION_VISUAL.graphWidth,
    graphHeight: visual?.graphHeight ?? DEFAULT_SECTION_VISUAL.graphHeight,
    equationY: visual?.equationY ?? DEFAULT_SECTION_VISUAL.equationY,
    slotSize: visual?.slotSize ?? DEFAULT_SECTION_VISUAL.slotSize,
    tokenGap: visual?.tokenGap ?? DEFAULT_SECTION_VISUAL.tokenGap,
  }
}

function axisRange(axis: AxisDefinition): number {
  return Math.max(0.001, axis.max - axis.min)
}

function axisTicks(axis: AxisDefinition): number[] {
  const step = Math.max(0.1, axis.tickStep ?? 1)
  const ticks: number[] = []

  for (let value = axis.min; value <= axis.max + step * 0.25; value += step) {
    ticks.push(Number(value.toFixed(3)))
  }

  if (ticks.length === 0 || Math.abs(ticks[ticks.length - 1] - axis.max) > 0.001) {
    ticks.push(axis.max)
  }

  return ticks
}

function formatAxisValue(value: number): string {
  if (Math.abs(value - Math.round(value)) <= 0.001) {
    return String(Math.round(value))
  }

  return value.toFixed(1).replace(/\.0$/, '')
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

function roundedRectPathData(rect: Rect, radius: number): string {
  const corner = Math.min(radius, rect.width / 2, rect.height / 2)
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  return [
    `M ${rect.x + corner} ${rect.y}`,
    `L ${right - corner} ${rect.y}`,
    `Q ${right} ${rect.y} ${right} ${rect.y + corner}`,
    `L ${right} ${bottom - corner}`,
    `Q ${right} ${bottom} ${right - corner} ${bottom}`,
    `L ${rect.x + corner} ${bottom}`,
    `Q ${rect.x} ${bottom} ${rect.x} ${bottom - corner}`,
    `L ${rect.x} ${rect.y + corner}`,
    `Q ${rect.x} ${rect.y} ${rect.x + corner} ${rect.y}`,
    'Z',
  ].join(' ')
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

function polylineLength(points: Point[]): number {
  let total = 0

  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetween(points[index - 1], points[index])
  }

  return total
}

function partialPolyline(points: Point[], progress: number): Point[] {
  if (points.length === 0 || progress <= 0) {
    return points.length > 0 ? [points[0]] : []
  }

  if (progress >= 1 || points.length === 1) {
    return [...points]
  }

  const total = polylineLength(points)
  if (total <= 0) {
    return [points[0]]
  }

  const target = total * clamp(progress, 0, 1)
  const partial: Point[] = [points[0]]
  let covered = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const segment = distanceBetween(start, end)

    if (covered + segment <= target) {
      partial.push(end)
      covered += segment
      continue
    }

    const remaining = target - covered
    const t = segment === 0 ? 0 : remaining / segment
    partial.push({
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
    })
    break
  }

  return partial
}

function tracePolyline(context: CanvasRenderingContext2D, points: Point[]): void {
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y)
    } else {
      context.lineTo(point.x, point.y)
    }
  })
}

function createLayout(width: number, height: number): Layout {
  const tileSize = clamp(Math.min(width, height) * 0.11, 58, 84)
  const trayY = height - tileSize - clamp(height * 0.04, 18, 30)
  const worldScale = clamp(Math.min(width / 1420, height / 920) * 1.62, 0.5, 1.82)
  const worldCenterY = Math.min(height * 0.42, trayY - 180)

  return {
    width,
    height,
    worldCenter: {
      x: width / 2,
      y: worldCenterY,
    },
    worldScale,
    tileSize,
    trayY,
    trayGap: clamp(tileSize * 0.28, 14, 22),
  }
}

class GraphboundApp {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly roughCanvas: RoughCanvas
  private readonly resizeObserver: ResizeObserver
  private readonly sections = SECTIONS
  private readonly sectionById = new Map(this.sections.map((section) => [section.id, section]))
  private readonly sectionIndexById = new Map(this.sections.map((section, index) => [section.id, index]))
  private readonly sectionRuntimes = new Map<string, SectionRuntime>()
  private readonly completedGoals = new Set<string>()
  private readonly completedSections = new Set<string>()
  private readonly unlockedSections = new Set<string>()
  private readonly unlockedTiles = new Set<TileId>(['x'])
  private readonly sectionRevealProgress = new Map<string, number>()

  private layout: Layout
  private drag: DragState | null = null
  private selectedTileId: TileId | null = null
  private activeSectionId = this.sections[0].id
  private camera: Point = { ...this.sections[0].world }
  private statusMessage = 'world-ready'
  private startLevelOverride: number | null = null
  private petDogTimer = 0
  private petDogSectionId: string | null = null
  private animationFrame: number | null = null
  private lastFrameTime: number | null = null
  private readonly movementKeys = new Set<string>()
  private keyboardVelocity: Point = { x: 0, y: 0 }
  private cameraTween:
    | {
        from: Point
        to: Point
        progress: number
        durationMs: number
        delayMs: number
      }
    | null = null

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
        fuseProgress: 0,
        animating: false,
        animatingGoalId: null,
        statusMessage: section.blurb,
        pendingGoalIds: [],
        solvedGoalIds: [],
      })

      if (section.initialUnlocked) {
        this.unlockedSections.add(section.id)
        this.sectionRevealProgress.set(section.id, 1)
      }
    }

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)

    this.applyLevelOverrideFromUrl()

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleWindowBlur)

    this.attachDebugHooks()
    this.resize()
  }

  private attachDebugHooks(): void {
    window.render_game_to_text = () => this.renderGameToText()
    window.advanceTime = (ms: number) => this.advanceTime(ms)
    window.__graphbound_debug = {
      focusSection: (sectionId: string) => this.focusSection(sectionId, true, false),
      placeTile: (tileId: TileId, slotId: string) => this.debugPlaceTile(tileId, slotId),
      startAtLevel: (levelNumber: number) => this.debugStartAtLevel(levelNumber),
      getState: () => JSON.parse(this.renderGameToText()),
    }
  }

  private createEmptyPlacements(section: SectionDefinition): Record<string, TileId | null> {
    const placements: Record<string, TileId | null> = {}

    for (const slot of section.slots) {
      placements[slot.id] = null
    }

    return placements
  }

  private resetRuntime(sectionId: string): void {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return
    }

    runtime.placements = this.createEmptyPlacements(section)
    runtime.plotResult = null
    runtime.plotProgress = 0
    runtime.fuseProgress = 0
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.statusMessage = section.blurb
    runtime.pendingGoalIds = []
    runtime.solvedGoalIds = []
  }

  private resetProgressionState(): void {
    this.completedGoals.clear()
    this.completedSections.clear()
    this.unlockedSections.clear()
    this.unlockedTiles.clear()
    this.unlockedTiles.add('x')
    this.sectionRevealProgress.clear()
    this.selectedTileId = null
    this.drag = null
    this.cameraTween = null
    this.keyboardVelocity = { x: 0, y: 0 }
    this.movementKeys.clear()
    this.petDogTimer = 0
    this.petDogSectionId = null
    this.startLevelOverride = null

    for (const section of this.sections) {
      this.resetRuntime(section.id)

      if (section.initialUnlocked) {
        this.unlockedSections.add(section.id)
        this.sectionRevealProgress.set(section.id, 1)
      }
    }

    this.activeSectionId = this.sections[0].id
    this.camera = { ...this.sections[0].world }
    this.statusMessage = 'world-ready'
  }

  private requestedLevelIndexFromUrl(): number | null {
    const params = new URLSearchParams(window.location.search)
    const rawLevel = params.get('level')?.trim()

    if (!rawLevel) {
      return null
    }

    const normalized = rawLevel.toLowerCase()
    const numericMatch = normalized.match(/^(?:level-?)?(\d+)$/)
    if (numericMatch) {
      return clamp(Number.parseInt(numericMatch[1], 10), 1, this.sections.length) - 1
    }

    const byId = this.sectionIndexById.get(normalized)
    return typeof byId === 'number' ? byId : null
  }

  private bootstrapGoalIds(sectionId: string, targetIndex: number): string[] {
    const section = this.sectionById.get(sectionId)
    const sectionIndex = this.sectionIndexById.get(sectionId)

    if (!section || typeof sectionIndex !== 'number') {
      return []
    }

    return sectionIndex < targetIndex ? section.goals.map((goal) => goal.id) : []
  }

  private findBootstrapPlacement(
    sectionId: string,
    preferredGoalIds: string[],
  ): Record<string, TileId | null> | null {
    const section = this.sectionById.get(sectionId)
    if (!section || section.slots.length === 0) {
      return null
    }

    const slotIds = section.slots.map((slot) => slot.id)
    const availableTiles = [...this.unlockedTiles]
    if (availableTiles.length < slotIds.length) {
      return null
    }

    let bestPlacements: Record<string, TileId | null> | null = null
    let bestScore = -1

    const search = (slotIndex: number, remainingTiles: TileId[], placements: Record<string, TileId | null>) => {
      if (slotIndex >= slotIds.length) {
        const result = evaluateSectionPlot(section, placements)
        if (!result || !result.hasVisiblePath) {
          return
        }

        const preferredHits = preferredGoalIds.filter((goalId) =>
          result.achievedGoalIds.includes(goalId),
        ).length
        const score = preferredHits * 10000 + result.achievedGoalIds.length * 100 + result.points.length

        if (score > bestScore) {
          bestScore = score
          bestPlacements = { ...placements }
        }
        return
      }

      const slotId = slotIds[slotIndex]

      for (let index = 0; index < remainingTiles.length; index += 1) {
        const tileId = remainingTiles[index]
        placements[slotId] = tileId
        const nextTiles = remainingTiles.filter((_, tileIndex) => tileIndex !== index)
        search(slotIndex + 1, nextTiles, placements)
        placements[slotId] = null
      }
    }

    search(0, availableTiles, this.createEmptyPlacements(section))
    return bestPlacements
  }

  private applyBootstrappedSectionState(sectionId: string, targetIndex: number): void {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return
    }

    const goalIds = this.bootstrapGoalIds(sectionId, targetIndex)
    this.unlockedSections.add(sectionId)
    this.sectionRevealProgress.set(sectionId, 1)

    for (const goalId of goalIds) {
      this.completedGoals.add(`${sectionId}:${goalId}`)
      const goal = section.goals.find((candidate) => candidate.id === goalId)

      for (const unlockId of goal?.unlocks ?? []) {
        this.unlockedSections.add(unlockId)
        this.sectionRevealProgress.set(unlockId, 1)
      }
    }

    const showcase = this.findBootstrapPlacement(sectionId, goalIds)
    runtime.placements = showcase ?? this.createEmptyPlacements(section)
    runtime.plotResult = showcase ? evaluateSectionPlot(section, runtime.placements) : null
    runtime.plotProgress = runtime.plotResult?.hasVisiblePath ? 1 : 0
    runtime.fuseProgress = runtime.plotResult?.achievedGoalIds.length ? 1 : 0
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.pendingGoalIds = []
    runtime.solvedGoalIds = section.goals
      .filter((goal) => this.completedGoals.has(`${sectionId}:${goal.id}`))
      .map((goal) => goal.id)

    if (runtime.solvedGoalIds.length === section.goals.length) {
      this.completedSections.add(sectionId)
      if (section.rewardTileId) {
        this.unlockedTiles.add(section.rewardTileId)
        runtime.statusMessage = `tile-${section.rewardTileId}-unlocked`
      } else {
        runtime.statusMessage = `${sectionId}-completed`
      }
      return
    }

    runtime.statusMessage =
      runtime.solvedGoalIds.length > 0 ? `revisit-${sectionId}` : section.blurb
  }

  private startAtLevel(levelIndex: number): void {
    const targetIndex = clamp(levelIndex, 0, this.sections.length - 1)
    const targetSection = this.sections[targetIndex]

    this.resetProgressionState()
    this.startLevelOverride = targetIndex + 1

    for (let index = 0; index < targetIndex; index += 1) {
      this.applyBootstrappedSectionState(this.sections[index].id, targetIndex)
    }

    this.unlockedSections.add(targetSection.id)
    this.sectionRevealProgress.set(targetSection.id, 1)
    this.activeSectionId = targetSection.id
    this.camera = { ...targetSection.world }
    this.statusMessage = `level-${targetIndex + 1}-ready`
  }

  private applyLevelOverrideFromUrl(): void {
    const targetIndex = this.requestedLevelIndexFromUrl()
    if (targetIndex === null) {
      return
    }

    this.startAtLevel(targetIndex)
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect()
    const width = Math.max(360, Math.round(bounds.width))
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

  private sectionAxes(sectionId: string): GraphAxes {
    return resolveAxes(this.sectionById.get(sectionId)?.axes)
  }

  private sectionVisual(sectionId: string): Required<SectionVisualDefinition> {
    return resolveVisual(this.sectionById.get(sectionId)?.visual)
  }

  private worldToScreen(point: Point): Point {
    return {
      x: this.layout.worldCenter.x + (point.x - this.camera.x) * this.layout.worldScale,
      y: this.layout.worldCenter.y + (point.y - this.camera.y) * this.layout.worldScale,
    }
  }

  private moveCameraTo(point: Point, animated: boolean, delayMs = 0): void {
    if (!animated) {
      this.camera = { ...point }
      this.cameraTween = null
      this.render()
      return
    }

    this.cameraTween = {
      from: { ...this.camera },
      to: { ...point },
      progress: 0,
      durationMs: CAMERA_DURATION_MS,
      delayMs,
    }
    this.ensureAnimation()
  }

  private centerCameraOn(sectionId: string, animated: boolean, delayMs = 0): void {
    const section = this.sectionById.get(sectionId)
    if (!section) {
      return
    }

    this.moveCameraTo(section.world, animated, delayMs)
  }

  private focusSection(sectionId: string, centerCamera: boolean, animated = true): void {
    if (!this.unlockedSections.has(sectionId)) {
      return
    }

    this.activeSectionId = sectionId
    if (centerCamera) {
      this.centerCameraOn(sectionId, animated, animated ? 0 : 0)
    } else {
      this.render()
    }
  }

  private debugPlaceTile(tileId: TileId, slotId: string): void {
    this.placeTileInSlot(tileId, slotId, false)
    this.render()
  }

  private debugStartAtLevel(levelNumber: number): void {
    if (!Number.isFinite(levelNumber)) {
      return
    }

    this.startAtLevel(Math.round(levelNumber) - 1)
    this.render()
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

  private normalizedWheelDelta(event: WheelEvent): Point {
    const scale =
      event.deltaMode === 1
        ? WHEEL_LINE_PX
        : event.deltaMode === 2
          ? Math.max(this.canvas.width, this.canvas.height)
          : 1

    return {
      x: event.deltaX * scale,
      y: event.deltaY * scale,
    }
  }

  private isMovementKey(key: string): boolean {
    return (
      key === 'a' ||
      key === 'd' ||
      key === 'w' ||
      key === 's' ||
      key === 'arrowleft' ||
      key === 'arrowright' ||
      key === 'arrowup' ||
      key === 'arrowdown'
    )
  }

  private movementAxis(negativeKeys: string[], positiveKeys: string[]): number {
    const negative = negativeKeys.some((key) => this.movementKeys.has(key))
    const positive = positiveKeys.some((key) => this.movementKeys.has(key))

    if (negative === positive) {
      return 0
    }

    return positive ? 1 : -1
  }

  private movementVector(): Point {
    return {
      x: this.movementAxis(['a', 'arrowleft'], ['d', 'arrowright']),
      y: this.movementAxis(['w', 'arrowup'], ['s', 'arrowdown']),
    }
  }

  private drawRoughRoundedRect(
    rect: Rect,
    radius: number,
    seedKey: string,
    options: Record<string, unknown>,
  ): void {
    this.roughCanvas.path(
      roundedRectPathData(rect, radius),
      seeded(seedKey, options),
    )
  }

  private drawRoughPolyline(points: Point[], seedKey: string, options: Record<string, unknown>): void {
    if (points.length < 2) {
      return
    }

    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]
      const end = points[index]
      this.roughCanvas.line(
        start.x,
        start.y,
        end.x,
        end.y,
        seeded(`${seedKey}:${index}`, options),
      )
    }
  }

  private drawPaperCard(rect: Rect, radius: number, seedKey: string, fillStyle = PAPER): void {
    const scale = Math.min(rect.width, rect.height) / 220

    this.context.save()
    this.context.shadowColor = SHADOW
    this.context.shadowBlur = 18 * scale
    this.context.shadowOffsetY = 10 * scale
    fillRoundedRect(this.context, rect, radius, fillStyle)
    this.context.restore()

    this.drawRoughRoundedRect(rect, radius, `${seedKey}:paper`, {
      stroke: INK,
      strokeWidth: Math.max(1.8, 2.2 * scale),
      fill: 'rgba(126, 111, 88, 0.14)',
      fillStyle: 'cross-hatch',
      hachureGap: Math.max(8, 9 * scale),
      fillWeight: Math.max(0.9, 1.05 * scale),
      roughness: 1.2,
      bowing: 1.1,
    })
  }

  private sectionReveal(sectionId: string): number {
    if (!this.unlockedSections.has(sectionId)) {
      return 0
    }

    return this.sectionRevealProgress.get(sectionId) ?? 1
  }

  private boardScale(sectionId: string): number {
    void sectionId
    return this.layout.worldScale
  }

  private boardDropOffset(sectionId: string): number {
    const reveal = this.sectionReveal(sectionId)
    if (reveal >= 1) {
      return 0
    }

    return -DROP_HEIGHT_WORLD * (1 - easeOutCubic(reveal))
  }

  private terrainRect(sectionId: string): Rect {
    const section = this.sectionById.get(sectionId)

    if (!section) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    const visual = this.sectionVisual(sectionId)
    const scale = this.boardScale(sectionId)
    const width = visual.terrainWidth * scale
    const height = visual.terrainHeight * scale
    const center = this.worldToScreen({
      x: section.world.x,
      y: section.world.y + this.boardDropOffset(sectionId),
    })

    return {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    }
  }

  private boardRect(sectionId: string): Rect {
    const terrain = this.terrainRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const scaleX = terrain.width / visual.terrainWidth
    const scaleY = terrain.height / visual.terrainHeight

    return {
      x: terrain.x + visual.boardX * scaleX,
      y: terrain.y + visual.boardY * scaleY,
      width: visual.boardWidth * scaleX,
      height: visual.boardHeight * scaleY,
    }
  }

  private sectionAtPoint(point: Point): string | null {
    const ordered = [...this.unlockedSections].sort((left, right) => {
      if (left === this.activeSectionId) {
        return 1
      }
      if (right === this.activeSectionId) {
        return -1
      }
      return 0
    })

    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const sectionId = ordered[index]
      if (pointInRect(point, this.terrainRect(sectionId))) {
        return sectionId
      }
    }

    return null
  }

  private terrainLocalToScreen(sectionId: string, localPoint: Point): Point {
    const rect = this.terrainRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const scaleX = rect.width / visual.terrainWidth
    const scaleY = rect.height / visual.terrainHeight

    return {
      x: rect.x + localPoint.x * scaleX,
      y: rect.y + localPoint.y * scaleY,
    }
  }

  private graphRect(sectionId: string): Rect {
    const rect = this.boardRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const scaleX = rect.width / visual.boardWidth
    const scaleY = rect.height / visual.boardHeight

    return {
      x: rect.x + visual.graphX * scaleX,
      y: rect.y + visual.graphY * scaleY,
      width: visual.graphWidth * scaleX,
      height: visual.graphHeight * scaleY,
    }
  }

  private graphPointToScreen(sectionId: string, point: PlotPoint): Point {
    const graph = this.graphRect(sectionId)
    const axes = this.sectionAxes(sectionId)
    const xProgress = (point.x - axes.x.min) / axisRange(axes.x)
    const yProgress = (point.y - axes.y.min) / axisRange(axes.y)

    return {
      x: graph.x + xProgress * graph.width,
      y: graph.y + graph.height - yProgress * graph.height,
    }
  }

  private graphValueToScreenX(sectionId: string, value: number): number {
    const graph = this.graphRect(sectionId)
    const axes = this.sectionAxes(sectionId)
    return graph.x + ((value - axes.x.min) / axisRange(axes.x)) * graph.width
  }

  private graphValueToScreenY(sectionId: string, value: number): number {
    const graph = this.graphRect(sectionId)
    const axes = this.sectionAxes(sectionId)
    return graph.y + graph.height - ((value - axes.y.min) / axisRange(axes.y)) * graph.height
  }

  private trayTileRects(): Array<{ tileId: TileId; rect: Rect }> {
    const used = new Set(Object.values(this.activeRuntime.placements).filter(Boolean) as TileId[])
    const available = this.activeTileIds().filter((tileId) => !used.has(tileId))
    const size = this.layout.tileSize
    const gap = this.layout.trayGap
    const totalWidth = available.length * size + Math.max(0, available.length - 1) * gap
    const startX = (this.layout.width - totalWidth) / 2

    return available.map((tileId, index) => ({
      tileId,
      rect: {
        x: startX + index * (size + gap),
        y: this.layout.trayY,
        width: size,
        height: size,
      },
    }))
  }

  private tokenLayouts(sectionId: string): TokenLayout[] {
    const section = this.sectionById.get(sectionId)

    if (!section) {
      return []
    }

    const rect = this.boardRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const scaleX = rect.width / visual.boardWidth
    const scaleY = rect.height / visual.boardHeight
    const scale = Math.min(scaleX, scaleY)
    const tokenSize = visual.slotSize * scale
    const gap = visual.tokenGap * scale
    const prefixWidth = 56 * scale
    const totalWidth =
      prefixWidth + section.equation.length * tokenSize + (section.equation.length - 1) * gap
    let cursor = rect.x + rect.width / 2 - totalWidth / 2 + prefixWidth

    return section.equation.map((part) => {
      const rectForToken = {
        x: cursor,
        y: rect.y + visual.equationY * scaleY - tokenSize / 2,
        width: tokenSize,
        height: tokenSize,
      }
      cursor += tokenSize + gap
      return { rect: rectForToken, part }
    })
  }

  private slotRect(slotId: string): Rect | null {
    const token = this.tokenLayouts(this.activeSectionId).find(
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
    void tileId

    return this.activeSection.slots.map((slot) => slot.id)
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

  private goalMatchesHit(goal: GoalDefinition, hit: BoundaryHit): boolean {
    if (!hit.edges.includes(goal.edge)) {
      return false
    }

    const coordinate = goal.edge === 'top' || goal.edge === 'bottom' ? hit.point.x : hit.point.y
    return coordinate >= goal.min - GOAL_EPSILON && coordinate <= goal.max + GOAL_EPSILON
  }

  private goalHit(sectionId: string, goal: GoalDefinition): PlotPoint | null {
    const runtime = this.sectionRuntimes.get(sectionId)
    const hit = runtime?.plotResult?.hits.find((candidate) => this.goalMatchesHit(goal, candidate))
    return hit?.point ?? null
  }

  private defaultGoalAnchor(sectionId: string, goal: GoalDefinition): Point {
    const axes = this.sectionAxes(sectionId)
    const axis = goal.edge === 'top' || goal.edge === 'bottom' ? axes.x : axes.y
    const coordinate =
      Math.abs(goal.max - axis.max) <= GOAL_EPSILON
        ? goal.max
        : Math.abs(goal.min - axis.min) <= GOAL_EPSILON
          ? goal.min
          : (goal.min + goal.max) / 2

    if (goal.edge === 'top') {
      return {
        x: this.graphValueToScreenX(sectionId, coordinate),
        y: this.graphRect(sectionId).y,
      }
    }
    if (goal.edge === 'right') {
      return {
        x: this.graphRect(sectionId).x + this.graphRect(sectionId).width,
        y: this.graphValueToScreenY(sectionId, coordinate),
      }
    }
    if (goal.edge === 'left') {
      return {
        x: this.graphRect(sectionId).x,
        y: this.graphValueToScreenY(sectionId, coordinate),
      }
    }

    return {
      x: this.graphValueToScreenX(sectionId, coordinate),
      y: this.graphRect(sectionId).y + this.graphRect(sectionId).height,
    }
  }

  private goalAnchor(sectionId: string, goal: GoalDefinition): Point {
    const hit = this.goalHit(sectionId, goal)
    if (hit) {
      return this.graphPointToScreen(sectionId, hit)
    }

    return this.defaultGoalAnchor(sectionId, goal)
  }

  private goalRouteWaypoints(sectionId: string, goal: GoalDefinition): Point[] {
    return goal.route?.map((point) => this.terrainLocalToScreen(sectionId, point)) ?? []
  }

  private goalLockPoint(sectionId: string, goal: GoalDefinition): Point | null {
    const targetId = goal.unlocks[0]
    const waypoints = this.goalRouteWaypoints(sectionId, goal)

    if (!targetId) {
      return waypoints[waypoints.length - 1] ?? null
    }

    const source = this.terrainRect(sectionId)
    const target = this.terrainRect(targetId)
    const sourceCenter = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    }
    const targetCenter = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    }
    const dx = targetCenter.x - sourceCenter.x
    const dy = targetCenter.y - sourceCenter.y
    const inset = 18 * this.layout.worldScale
    const preferred = waypoints[waypoints.length - 1] ?? this.goalAnchor(sectionId, goal)

    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        x: dx >= 0 ? source.x + source.width - inset : source.x + inset,
        y: clamp(preferred.y, source.y + inset * 1.4, source.y + source.height - inset * 1.4),
      }
    }

    return {
      x: clamp(preferred.x, source.x + inset * 1.4, source.x + source.width - inset * 1.4),
      y: dy >= 0 ? source.y + source.height - inset : source.y + inset,
    }
  }

  private goalRoutePoints(sectionId: string, goal: GoalDefinition): Point[] {
    const anchor = this.goalAnchor(sectionId, goal)
    const route = this.goalRouteWaypoints(sectionId, goal)
    const lockPoint = this.goalLockPoint(sectionId, goal)

    if (!lockPoint) {
      return [anchor, ...route]
    }

    if (route.length > 0 && distanceBetween(route[route.length - 1], lockPoint) <= 0.5) {
      return [anchor, ...route]
    }

    return [anchor, ...route, lockPoint]
  }

  private terrainConnectorPoints(sectionId: string, targetId: string): Point[] {
    const source = this.terrainRect(sectionId)
    const target = this.terrainRect(targetId)
    const sourceCenter = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    }
    const targetCenter = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    }
    const dx = targetCenter.x - sourceCenter.x
    const dy = targetCenter.y - sourceCenter.y

    if (Math.abs(dx) >= Math.abs(dy)) {
      const sourceY = clamp(targetCenter.y, source.y + source.height * 0.32, source.y + source.height * 0.68)
      const targetY = clamp(sourceCenter.y, target.y + target.height * 0.32, target.y + target.height * 0.68)
      const sourceX = dx >= 0 ? source.x + source.width : source.x
      const targetX = dx >= 0 ? target.x : target.x + target.width
      const midX = (sourceX + targetX) / 2

      return [
        { x: sourceX, y: sourceY },
        { x: midX, y: sourceY },
        { x: midX, y: targetY },
        { x: targetX, y: targetY },
      ]
    }

    const sourceX = clamp(targetCenter.x, source.x + source.width * 0.28, source.x + source.width * 0.72)
    const targetX = clamp(sourceCenter.x, target.x + target.width * 0.28, target.x + target.width * 0.72)
    const sourceY = dy >= 0 ? source.y + source.height : source.y
    const targetY = dy >= 0 ? target.y : target.y + target.height
    const midY = (sourceY + targetY) / 2

    return [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: midY },
      { x: targetX, y: midY },
      { x: targetX, y: targetY },
    ]
  }

  private dogRect(sectionId: string): Rect | null {
    if (sectionId !== 'orchard') {
      return null
    }

    const terrain = this.terrainRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const scaleX = terrain.width / visual.terrainWidth
    const scaleY = terrain.height / visual.terrainHeight

    return {
      x: terrain.x + 454 * scaleX,
      y: terrain.y + 228 * scaleY,
      width: 46 * scaleX,
      height: 34 * scaleY,
    }
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
    runtime.animatingGoalId =
      result?.achievedGoalIds.find((goalId) => !this.completedGoals.has(`${sectionId}:${goalId}`)) ??
      null
    runtime.fuseProgress = 0

    if (!result) {
      runtime.plotProgress = 0
      runtime.animating = false
      runtime.statusMessage = section.blurb
      this.statusMessage = 'awaiting-tiles'
      return
    }

    if (!result.hasVisiblePath) {
      runtime.plotProgress = 0
      runtime.animating = false
      runtime.statusMessage = 'no-visible-line'
      this.statusMessage = runtime.statusMessage
      return
    }

    runtime.plotProgress = animated ? 0 : 1
    runtime.fuseProgress = !animated && runtime.animatingGoalId ? 1 : 0
    runtime.animating = animated
    runtime.statusMessage =
      runtime.animatingGoalId || result.achievedGoalIds.length > 0 ? 'goal-lined-up' : 'line-drawn'

    if (!animated) {
      this.finalizeGoals(sectionId)
    } else {
      this.statusMessage = `plotting-${sectionId}`
      this.ensureAnimation()
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

    const newlyUnlockedSections: string[] = []

    for (const goalId of newGoals) {
      this.completedGoals.add(`${sectionId}:${goalId}`)
      const goal = section.goals.find((candidate) => candidate.id === goalId)

      for (const unlockId of goal?.unlocks ?? []) {
        if (this.unlockedSections.has(unlockId)) {
          continue
        }

        this.unlockedSections.add(unlockId)
        this.sectionRevealProgress.set(unlockId, 0)
        newlyUnlockedSections.push(unlockId)
      }
    }

    runtime.solvedGoalIds = section.goals
      .filter((goal) => this.completedGoals.has(`${sectionId}:${goal.id}`))
      .map((goal) => goal.id)
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.plotProgress = runtime.plotResult.hasVisiblePath ? 1 : 0
    runtime.fuseProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.fuseProgress

    if (runtime.solvedGoalIds.length === section.goals.length && !this.completedSections.has(sectionId)) {
      this.completedSections.add(sectionId)

      if (section.rewardTileId) {
        this.unlockedTiles.add(section.rewardTileId)
        runtime.statusMessage = `tile-${section.rewardTileId}-unlocked`
      } else {
        runtime.statusMessage = `${sectionId}-completed`
      }
    }

    if (newlyUnlockedSections.length > 0) {
      const nextSectionId = newlyUnlockedSections[0]
      this.activeSectionId = nextSectionId
      this.centerCameraOn(nextSectionId, true, CAMERA_DELAY_MS)
      runtime.statusMessage = `unlock-${nextSectionId}`
      this.statusMessage = runtime.statusMessage
      this.ensureAnimation()
      return
    }

    this.statusMessage = runtime.statusMessage
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
    this.updateSectionPlot(this.activeSectionId, false)
    this.setSelectedTile(tileId)
    this.statusMessage = `picked-${tileId}`
  }

  private placeTileInSlot(tileId: TileId, slotId: string, animated: boolean): void {
    const slot = this.activeSection.slots.find((candidate) => candidate.id === slotId)

    if (!slot) {
      return
    }

    for (const currentSlot of this.activeSection.slots) {
      if (this.activeRuntime.placements[currentSlot.id] === tileId) {
        this.activeRuntime.placements[currentSlot.id] = null
      }
    }

    this.activeRuntime.placements[slotId] = tileId
    this.selectedTileId = null
    this.updateSectionPlot(this.activeSectionId, animated)
    this.render()
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

    if (this.cameraTween) {
      if (this.cameraTween.delayMs > 0) {
        this.cameraTween.delayMs = Math.max(0, this.cameraTween.delayMs - deltaMs)
        keepGoing = true
      } else {
        this.cameraTween.progress = clamp(
          this.cameraTween.progress + deltaMs / this.cameraTween.durationMs,
          0,
          1,
        )
        const eased = easeInOutCubic(this.cameraTween.progress)
        this.camera = {
          x: lerp(this.cameraTween.from.x, this.cameraTween.to.x, eased),
          y: lerp(this.cameraTween.from.y, this.cameraTween.to.y, eased),
        }

        if (this.cameraTween.progress >= 1) {
          this.camera = { ...this.cameraTween.to }
          this.cameraTween = null
        } else {
          keepGoing = true
        }
      }
    }

    const input = this.movementVector()
    const inputMagnitude = Math.hypot(input.x, input.y)
    const targetVelocity =
      inputMagnitude > 0
        ? {
            x: (input.x / inputMagnitude) * KEYBOARD_PAN_SPEED,
            y: (input.y / inputMagnitude) * KEYBOARD_PAN_SPEED,
          }
        : { x: 0, y: 0 }

    this.keyboardVelocity = {
      x: smoothApproach(
        this.keyboardVelocity.x,
        targetVelocity.x,
        targetVelocity.x !== 0
          ? KEYBOARD_PAN_RESPONSE
          : inputMagnitude > 0
            ? KEYBOARD_PAN_TURN_DAMPING
            : KEYBOARD_PAN_DAMPING,
        deltaMs,
      ),
      y: smoothApproach(
        this.keyboardVelocity.y,
        targetVelocity.y,
        targetVelocity.y !== 0
          ? KEYBOARD_PAN_RESPONSE
          : inputMagnitude > 0
            ? KEYBOARD_PAN_TURN_DAMPING
            : KEYBOARD_PAN_DAMPING,
        deltaMs,
      ),
    }

    if (Math.abs(this.keyboardVelocity.x) < MIN_CAMERA_VELOCITY) {
      this.keyboardVelocity.x = 0
    }
    if (Math.abs(this.keyboardVelocity.y) < MIN_CAMERA_VELOCITY) {
      this.keyboardVelocity.y = 0
    }

    if (this.keyboardVelocity.x !== 0 || this.keyboardVelocity.y !== 0) {
      this.camera = {
        x: this.camera.x + (this.keyboardVelocity.x * deltaMs) / 1000,
        y: this.camera.y + (this.keyboardVelocity.y * deltaMs) / 1000,
      }
      keepGoing = true
    } else if (inputMagnitude > 0) {
      keepGoing = true
    }

    for (const sectionId of this.unlockedSections) {
      const reveal = this.sectionReveal(sectionId)
      if (reveal >= 1) {
        continue
      }

      this.sectionRevealProgress.set(
        sectionId,
        clamp(reveal + deltaMs / SECTION_DROP_DURATION_MS, 0, 1),
      )
      keepGoing = true
    }

    for (const section of this.sections) {
      const runtime = this.sectionRuntimes.get(section.id)
      if (!runtime || !runtime.animating) {
        continue
      }

      if (runtime.plotProgress < 1) {
        runtime.plotProgress = clamp(runtime.plotProgress + deltaMs / PLOT_DURATION_MS, 0, 1)
        keepGoing = true

        if (runtime.plotProgress < 1) {
          continue
        }
      }

      if (runtime.animatingGoalId && runtime.fuseProgress < 1) {
        runtime.fuseProgress = clamp(runtime.fuseProgress + deltaMs / FUSE_DURATION_MS, 0, 1)
        keepGoing = true

        if (runtime.fuseProgress < 1) {
          continue
        }
      }

      runtime.animating = false
      this.finalizeGoals(section.id)
      keepGoing = keepGoing || this.cameraTween !== null
    }

    if (this.petDogTimer > 0) {
      this.petDogTimer = Math.max(0, this.petDogTimer - deltaMs)
      if (this.petDogTimer === 0) {
        this.petDogSectionId = null
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
    }

    for (const section of [...this.unlockedSections].reverse()) {
      const rect = this.dogRect(section)
      if (!rect || !pointInRect(point, rect)) {
        continue
      }

      this.petDogSectionId = section
      this.petDogTimer = DOG_PET_MS
      this.statusMessage = `pet-${section}`
      this.ensureAnimation()
      this.render()
      return
    }

    this.cameraTween = null
    this.drag = {
      kind: 'pan',
      pointerId: event.pointerId,
      current: point,
      start: point,
      cameraStart: { ...this.camera },
      dragging: false,
      startedSectionId: this.sectionAtPoint(point),
    }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return
    }

    this.drag.current = this.getPointerPoint(event)

    if (this.drag.kind === 'pan') {
      if (!this.drag.dragging && distance(this.drag.start, this.drag.current) > PAN_DRAG_THRESHOLD) {
        this.drag.dragging = true
      }

      if (this.drag.dragging) {
        this.camera = {
          x: this.drag.cameraStart.x - (this.drag.current.x - this.drag.start.x) / this.layout.worldScale,
          y: this.drag.cameraStart.y - (this.drag.current.y - this.drag.start.y) / this.layout.worldScale,
        }
      }

      this.render()
      return
    }

    if (!this.drag.dragging && distance(this.drag.start, this.drag.current) > TILE_DRAG_THRESHOLD) {
      this.drag.dragging = true

      if (this.drag.sourceSlotId) {
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

    if (this.drag.kind === 'pan') {
      const startedSectionId = this.drag.startedSectionId
      const wasDragging = this.drag.dragging
      this.drag = null

      if (!wasDragging && startedSectionId) {
        this.focusSection(startedSectionId, true, true)
      } else {
        this.render()
      }
      return
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
          this.render()
        } else {
          this.render()
        }
      } else if (this.drag.sourceSlotId) {
        this.pickUpSlotTile(this.drag.sourceSlotId)
      } else {
        this.setSelectedTile(this.drag.tileId === this.selectedTileId ? null : this.drag.tileId)
      }
    }

    this.drag = null
    this.render()
  }

  private handlePointerCancel = (): void => {
    if (this.drag?.kind === 'tile' && this.drag.sourceSlotId) {
      this.activeRuntime.placements[this.drag.sourceSlotId] = this.drag.tileId
      this.updateSectionPlot(this.activeSectionId, false)
    }

    this.drag = null
    this.render()
  }

  private handleWheel = (event: WheelEvent): void => {
    if (event.ctrlKey) {
      return
    }

    const delta = this.normalizedWheelDelta(event)
    if (Math.abs(delta.x) < 0.01 && Math.abs(delta.y) < 0.01) {
      return
    }

    event.preventDefault()
    this.cameraTween = null
    this.camera = {
      x: this.camera.x + delta.x / this.layout.worldScale,
      y: this.camera.y + delta.y / this.layout.worldScale,
    }
    this.render()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()

    if (key === 'f') {
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      } else {
        void this.canvas.requestFullscreen()
      }
      return
    }

    if (this.isMovementKey(key)) {
      event.preventDefault()
      this.cameraTween = null
      this.movementKeys.add(key)
      this.ensureAnimation()
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

  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    if (!this.isMovementKey(key)) {
      return
    }

    event.preventDefault()
    this.movementKeys.delete(key)

    if (this.keyboardVelocity.x !== 0 || this.keyboardVelocity.y !== 0) {
      this.ensureAnimation()
    }
  }

  private handleWindowBlur = (): void => {
    this.movementKeys.clear()
    this.keyboardVelocity = { x: 0, y: 0 }
  }

  private drawBackground(): void {
    const context = this.context
    const { width, height } = this.canvas

    context.clearRect(0, 0, width, height)

    const board = context.createLinearGradient(0, 0, width, height)
    board.addColorStop(0, CHALKBOARD_LIGHT)
    board.addColorStop(0.42, CHALKBOARD_MID)
    board.addColorStop(1, CHALKBOARD_DARK)
    context.fillStyle = board
    context.fillRect(0, 0, width, height)

    for (let index = 0; index < 16; index += 1) {
      const centerX = ((hashSeed(`chalk-smudge-x:${index}`) % 1000) / 1000) * width
      const centerY = ((hashSeed(`chalk-smudge-y:${index}`) % 1000) / 1000) * height
      const radius = Math.max(width, height) * (0.12 + (hashSeed(`chalk-smudge-r:${index}`) % 11) / 90)
      const chalkGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      chalkGlow.addColorStop(0, CHALK_DUST)
      chalkGlow.addColorStop(1, 'rgba(228, 245, 236, 0)')
      context.fillStyle = chalkGlow
      context.beginPath()
      context.arc(centerX, centerY, radius, 0, Math.PI * 2)
      context.fill()
    }

    for (let index = 0; index < 6; index += 1) {
      const startX = ((hashSeed(`chalk-line-x1:${index}`) % 1000) / 1000) * width
      const startY = ((hashSeed(`chalk-line-y1:${index}`) % 1000) / 1000) * height
      const endX = ((hashSeed(`chalk-line-x2:${index}`) % 1000) / 1000) * width
      const endY = ((hashSeed(`chalk-line-y2:${index}`) % 1000) / 1000) * height
      this.roughCanvas.line(
        startX,
        startY,
        endX,
        endY,
        seeded(`chalk-line:${index}`, {
          stroke: 'rgba(236, 248, 241, 0.025)',
          strokeWidth: Math.max(0.9, width / 1400),
          roughness: 1.8,
          bowing: 2,
        }),
      )
    }
  }

  private drawTerrainTexture(rect: Rect, seedKey: string): void {
    const scale = Math.min(
      rect.width / DEFAULT_SECTION_VISUAL.terrainWidth,
      rect.height / DEFAULT_SECTION_VISUAL.terrainHeight,
    )
    const radius = Math.max(6, 10 * scale)

    this.drawRoughRoundedRect(rect, radius, `${seedKey}:land-under`, {
      stroke: 'rgba(0,0,0,0)',
      fill: GRASS_TOP,
      fillStyle: 'cross-hatch',
      hachureGap: Math.max(11, 12 * scale),
      fillWeight: Math.max(0.9, 1.05 * scale),
      roughness: 1.85,
      bowing: 1.5,
    })

    this.drawRoughRoundedRect(rect, radius, `${seedKey}:land-over`, {
      stroke: 'rgba(0,0,0,0)',
      fill: GRASS_MID,
      fillStyle: 'hachure',
      hachureGap: Math.max(17, 18 * scale),
      hachureAngle: 22,
      fillWeight: Math.max(0.7, 0.85 * scale),
      roughness: 1.7,
      bowing: 1.35,
    })
  }

  private drawTerrainBridge(points: Point[], progress: number): void {
    const visible = partialPolyline(points, progress)
    if (visible.length < 2) {
      return
    }

    const width = 178 * this.layout.worldScale

    this.drawRoughPolyline(visible, 'terrain-bridge:shadow', {
      stroke: GRASS_DARK,
      strokeWidth: width,
      roughness: 2,
      bowing: 1.9,
    })
    this.drawRoughPolyline(visible, 'terrain-bridge:mid', {
      stroke: GRASS_MID,
      strokeWidth: width - 16 * this.layout.worldScale,
      roughness: 1.9,
      bowing: 1.7,
    })
    this.drawRoughPolyline(visible, 'terrain-bridge:top', {
      stroke: GRASS_TOP,
      strokeWidth: width - 44 * this.layout.worldScale,
      roughness: 1.7,
      bowing: 1.5,
    })
  }

  private drawDirtRoad(points: Point[], widthScale = 1, solved = false, progress = 1): void {
    const visible = progress >= 1 ? points : partialPolyline(points, progress)
    if (visible.length < 2) {
      return
    }

    const width = 28 * this.layout.worldScale * widthScale

    this.drawRoughPolyline(visible, 'road:shadow', {
      stroke: solved ? '#efd8b6' : DIRT_DARK,
      strokeWidth: width + 5 * this.layout.worldScale,
      roughness: 1.85,
      bowing: 1.6,
    })
    this.drawRoughPolyline(visible, 'road:surface', {
      stroke: solved ? '#fff1cf' : DIRT,
      strokeWidth: width,
      roughness: 1.65,
      bowing: 1.35,
    })
  }

  private drawTree(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x, y: center.y + size * 0.5 },
        { x: center.x, y: center.y + size * 0.06 },
      ],
      `${seedKey}:trunk`,
      {
        stroke: '#d0a57b',
        strokeWidth: Math.max(5, size * 0.18),
        roughness: 1.6,
        bowing: 1.4,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x, y: center.y + size * 0.18 },
        { x: center.x - size * 0.14, y: center.y - size * 0.06 },
      ],
      `${seedKey}:branch-left`,
      {
        stroke: '#d0a57b',
        strokeWidth: Math.max(2.2, size * 0.05),
        roughness: 1.55,
        bowing: 1.7,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x, y: center.y + size * 0.16 },
        { x: center.x + size * 0.16, y: center.y - size * 0.02 },
      ],
      `${seedKey}:branch-right`,
      {
        stroke: '#d0a57b',
        strokeWidth: Math.max(2.2, size * 0.05),
        roughness: 1.55,
        bowing: 1.6,
      },
    )

    const bumps = [
      { x: 0, y: -size * 0.2, r: size * 0.42, fill: GRASS_TOP },
      { x: -size * 0.26, y: -size * 0.02, r: size * 0.28, fill: '#ffcf7d' },
      { x: size * 0.28, y: -size * 0.02, r: size * 0.27, fill: '#9adcf2' },
      { x: 0, y: size * 0.08, r: size * 0.3, fill: '#ffa2a2' },
    ]
    bumps.forEach((bump, index) => {
      this.roughCanvas.circle(
        center.x + bump.x,
        center.y + bump.y,
        bump.r * 2,
        seeded(`${seedKey}:crown:${index}`, {
          stroke: INK,
          strokeWidth: Math.max(1.4, size * 0.03),
          fill: bump.fill,
          fillStyle: 'cross-hatch',
          hachureGap: Math.max(6, size * 0.1),
          fillWeight: Math.max(0.8, size * 0.015),
          roughness: 1.5,
          bowing: 1.2,
        }),
      )
    })
  }

  private drawRiver(sectionId: string): void {
    if (sectionId !== 'cove') {
      return
    }

    const points = [
      this.terrainLocalToScreen(sectionId, { x: 392, y: 8 }),
      this.terrainLocalToScreen(sectionId, { x: 420, y: 96 }),
      this.terrainLocalToScreen(sectionId, { x: 398, y: 186 }),
      this.terrainLocalToScreen(sectionId, { x: 440, y: 310 }),
    ]
    const width = 48 * this.layout.worldScale

    this.drawRoughPolyline(points, `${sectionId}:river:shadow`, {
      stroke: RIVER_DARK,
      strokeWidth: width + 8 * this.layout.worldScale,
      roughness: 1.85,
      bowing: 1.55,
    })
    this.drawRoughPolyline(points, `${sectionId}:river:surface`, {
      stroke: RIVER,
      strokeWidth: width,
      roughness: 1.75,
      bowing: 1.4,
    })

    const bridgeCenter = this.terrainLocalToScreen(sectionId, { x: 406, y: 160 })
    const plankWidth = 32 * this.layout.worldScale
    const plankHeight = 6 * this.layout.worldScale
    const angle = -0.24
    for (let index = -2; index <= 2; index += 1) {
      const offset = index * plankHeight * 1.2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const left = {
        x: bridgeCenter.x - (plankWidth / 2) * cos - offset * sin,
        y: bridgeCenter.y - (plankWidth / 2) * sin + offset * cos,
      }
      const right = {
        x: bridgeCenter.x + (plankWidth / 2) * cos - offset * sin,
        y: bridgeCenter.y + (plankWidth / 2) * sin + offset * cos,
      }
      this.drawRoughPolyline([left, right], `${sectionId}:bridge:${index}`, {
        stroke: '#f0d8b5',
        strokeWidth: Math.max(2.5, plankHeight),
        roughness: 1.4,
        bowing: 1.2,
      })
    }
  }

  private drawDog(sectionId: string): void {
    const rect = this.dogRect(sectionId)
    if (!rect) {
      return
    }

    const context = this.context
    const petting = this.petDogSectionId === sectionId && this.petDogTimer > 0
    const waggle = petting ? Math.sin((this.petDogTimer / DOG_PET_MS) * Math.PI * 6) * 0.16 : 0

    this.roughCanvas.ellipse(
      rect.x + rect.width * 0.56,
      rect.y + rect.height * 0.58,
      rect.width * 0.62,
      rect.height * 0.42,
      seeded(`${sectionId}:dog:body`, {
        stroke: INK,
        strokeWidth: Math.max(1.6, this.layout.worldScale * 1.8),
        fill: '#ffd3a0',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(4, this.layout.worldScale * 5),
        fillWeight: Math.max(0.8, this.layout.worldScale),
        roughness: 1.45,
      }),
    )
    this.roughCanvas.circle(
      rect.x + rect.width * 0.28,
      rect.y + rect.height * 0.48,
      rect.height * 0.42,
      seeded(`${sectionId}:dog:head`, {
        stroke: INK,
        strokeWidth: Math.max(1.6, this.layout.worldScale * 1.8),
        fill: '#f5c08a',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(4, this.layout.worldScale * 5),
        fillWeight: Math.max(0.8, this.layout.worldScale),
        roughness: 1.45,
      }),
    )
    this.drawRoughPolyline(
      [
        { x: rect.x + rect.width * 0.72, y: rect.y + rect.height * 0.48 },
        { x: rect.x + rect.width * 0.96, y: rect.y + rect.height * (0.28 + waggle) },
      ],
      `${sectionId}:dog:tail`,
      {
        stroke: '#ffd3a0',
        strokeWidth: Math.max(2.2, this.layout.worldScale * 3.4),
        roughness: 1.7,
        bowing: 1.6,
      },
    )
    ;[
      [0.18, 0.74],
      [0.4, 0.78],
      [0.62, 0.78],
      [0.8, 0.74],
    ].forEach(([xProgress, yProgress], index) => {
      this.drawRoughPolyline(
        [
          { x: rect.x + rect.width * xProgress, y: rect.y + rect.height * yProgress },
          { x: rect.x + rect.width * xProgress, y: rect.y + rect.height },
        ],
        `${sectionId}:dog:leg:${index}`,
        {
          stroke: INK,
          strokeWidth: Math.max(1.2, this.layout.worldScale * 1.7),
          roughness: 1.35,
          bowing: 1.15,
        },
      )
    })

    context.save()
    context.fillStyle = INK
    context.beginPath()
    context.arc(rect.x + rect.width * 0.22, rect.y + rect.height * 0.46, rect.height * 0.025, 0, Math.PI * 2)
    context.arc(rect.x + rect.width * 0.31, rect.y + rect.height * 0.46, rect.height * 0.025, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.arc(rect.x + rect.width * 0.27, rect.y + rect.height * 0.54, rect.height * 0.024, 0, Math.PI * 2)
    context.fill()

    if (petting) {
      context.fillStyle = '#ff91ad'
      context.font = `${Math.round(rect.height * 0.72)}px 'Short Stack', cursive`
      context.fillText('❤', rect.x + rect.width * 0.8, rect.y - rect.height * 0.18)
    }

    context.restore()
  }

  private drawFlowerDoodle(center: Point, size: number, seedKey: string): void {
    const petals = [
      { x: 0, y: -size * 0.22, color: '#ffa6b6' },
      { x: size * 0.2, y: -size * 0.02, color: '#ffd276' },
      { x: size * 0.12, y: size * 0.22, color: '#9fe8ff' },
      { x: -size * 0.12, y: size * 0.22, color: '#c1f1a7' },
      { x: -size * 0.2, y: -size * 0.02, color: '#ffcf8a' },
    ]

    this.drawRoughPolyline(
      [
        { x: center.x, y: center.y + size * 0.14 },
        { x: center.x, y: center.y + size * 0.66 },
      ],
      `${seedKey}:stem`,
      {
        stroke: '#bdeba6',
        strokeWidth: Math.max(2, size * 0.09),
        roughness: 1.45,
        bowing: 1.5,
      },
    )

    petals.forEach((petal, index) => {
      this.roughCanvas.circle(
        center.x + petal.x,
        center.y + petal.y,
        size * 0.42,
        seeded(`${seedKey}:petal:${index}`, {
          stroke: INK,
          strokeWidth: Math.max(1.2, size * 0.04),
          fill: petal.color,
          fillStyle: 'cross-hatch',
          hachureGap: Math.max(4, size * 0.1),
          fillWeight: Math.max(0.8, size * 0.02),
          roughness: 1.4,
        }),
      )
    })

    this.roughCanvas.circle(
      center.x,
      center.y,
      size * 0.38,
      seeded(`${seedKey}:center`, {
        stroke: INK,
        strokeWidth: Math.max(1.2, size * 0.04),
        fill: '#ffe578',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(4, size * 0.08),
        fillWeight: Math.max(0.8, size * 0.02),
        roughness: 1.3,
      }),
    )
  }

  private drawStarDoodle(center: Point, size: number, seedKey: string): void {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5
      const radius = index % 2 === 0 ? size * 0.48 : size * 0.22
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      }
    })

    this.roughCanvas.polygon(
      points.map((point) => [point.x, point.y]),
      seeded(`${seedKey}:star`, {
        stroke: INK,
        strokeWidth: Math.max(1.2, size * 0.045),
        fill: '#ffe58f',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(5, size * 0.1),
        fillWeight: Math.max(0.8, size * 0.02),
        roughness: 1.45,
      }),
    )
  }

  private drawHeartDoodle(center: Point, size: number, seedKey: string): void {
    const heartPoints = Array.from({ length: 28 }, (_, index) => {
      const t = (index / 27) * Math.PI * 2
      const x = 16 * Math.sin(t) ** 3
      const y =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      return {
        x: center.x + (x / 18) * size,
        y: center.y - (y / 18) * size,
      }
    })

    this.roughCanvas.polygon(
      heartPoints.map((point) => [point.x, point.y]),
      seeded(`${seedKey}:heart`, {
        stroke: INK,
        strokeWidth: Math.max(1.2, size * 0.05),
        fill: '#ff8f9e',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(5, size * 0.08),
        fillWeight: Math.max(0.8, size * 0.02),
        roughness: 1.35,
      }),
    )
  }

  private drawSmileyDoodle(center: Point, size: number, seedKey: string): void {
    this.roughCanvas.circle(
      center.x,
      center.y,
      size,
      seeded(`${seedKey}:face`, {
        stroke: INK,
        strokeWidth: Math.max(1.3, size * 0.05),
        fill: '#ffe48f',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(5, size * 0.08),
        fillWeight: Math.max(0.8, size * 0.02),
        roughness: 1.35,
      }),
    )

    this.context.save()
    this.context.fillStyle = INK
    this.context.beginPath()
    this.context.arc(center.x - size * 0.16, center.y - size * 0.1, size * 0.04, 0, Math.PI * 2)
    this.context.arc(center.x + size * 0.16, center.y - size * 0.1, size * 0.04, 0, Math.PI * 2)
    this.context.fill()
    this.context.strokeStyle = INK
    this.context.lineWidth = Math.max(1.2, size * 0.05)
    this.context.lineCap = 'round'
    this.context.beginPath()
    this.context.arc(center.x, center.y + size * 0.02, size * 0.24, 0.15, Math.PI - 0.15)
    this.context.stroke()
    this.context.restore()
  }

  private drawWormDoodle(center: Point, size: number, seedKey: string): void {
    const points = Array.from({ length: 9 }, (_, index) => ({
      x: center.x + (index - 4) * (size * 0.12),
      y: center.y + Math.sin(index * 0.8) * size * 0.18,
    }))
    this.drawRoughPolyline(points, `${seedKey}:worm`, {
      stroke: '#ffb2c7',
      strokeWidth: Math.max(2.5, size * 0.12),
      roughness: 1.65,
      bowing: 1.8,
    })
    this.context.save()
    this.context.fillStyle = INK
    this.context.beginPath()
    this.context.arc(points[0].x - size * 0.04, points[0].y - size * 0.04, size * 0.02, 0, Math.PI * 2)
    this.context.arc(points[0].x + size * 0.04, points[0].y - size * 0.04, size * 0.02, 0, Math.PI * 2)
    this.context.fill()
    this.context.restore()
  }

  private drawSunDoodle(center: Point, size: number, seedKey: string): void {
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2
      const inner = {
        x: center.x + Math.cos(angle) * size * 0.36,
        y: center.y + Math.sin(angle) * size * 0.36,
      }
      const outer = {
        x: center.x + Math.cos(angle) * size * 0.62,
        y: center.y + Math.sin(angle) * size * 0.62,
      }
      this.drawRoughPolyline([inner, outer], `${seedKey}:ray:${index}`, {
        stroke: '#ffe18b',
        strokeWidth: Math.max(1.8, size * 0.08),
        roughness: 1.5,
        bowing: 1.4,
      })
    }

    this.roughCanvas.circle(
      center.x,
      center.y,
      size * 0.68,
      seeded(`${seedKey}:core`, {
        stroke: INK,
        strokeWidth: Math.max(1.2, size * 0.05),
        fill: '#ffe18b',
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(4, size * 0.08),
        fillWeight: Math.max(0.8, size * 0.02),
        roughness: 1.3,
      }),
    )
  }

  private drawSectionDecorations(sectionId: string): void {
    const treeSets: Record<string, Array<{ x: number; y: number; size: number }>> = {
      ridge: [
        { x: 462, y: 76, size: 62 },
      ],
      orchard: [
        { x: 454, y: 68, size: 70 },
        { x: 510, y: 150, size: 74 },
        { x: 486, y: 248, size: 72 },
      ],
      canopy: [
        { x: 462, y: 76, size: 68 },
        { x: 506, y: 214, size: 66 },
      ],
      summit: [
        { x: 484, y: 92, size: 54 },
      ],
    }

    for (const tree of treeSets[sectionId] ?? []) {
      this.drawTree(
        this.terrainLocalToScreen(sectionId, { x: tree.x, y: tree.y }),
        tree.size * this.layout.worldScale,
        `${sectionId}:${tree.x}:${tree.y}`,
      )
    }

    const doodleSets: Record<
      string,
      Array<{ x: number; y: number; size: number; kind: 'flower' | 'star' | 'heart' | 'smiley' | 'worm' | 'sun' }>
    > = {
      sprout: [
        { x: 92, y: 78, size: 42, kind: 'sun' },
        { x: 452, y: 244, size: 34, kind: 'flower' },
      ],
      ridge: [
        { x: 84, y: 230, size: 36, kind: 'star' },
        { x: 516, y: 244, size: 32, kind: 'heart' },
      ],
      orchard: [
        { x: 86, y: 92, size: 34, kind: 'flower' },
        { x: 560, y: 256, size: 34, kind: 'smiley' },
      ],
      cove: [
        { x: 96, y: 90, size: 36, kind: 'star' },
        { x: 84, y: 276, size: 34, kind: 'worm' },
      ],
      canopy: [
        { x: 100, y: 70, size: 32, kind: 'sun' },
        { x: 564, y: 264, size: 30, kind: 'heart' },
      ],
      summit: [
        { x: 92, y: 92, size: 34, kind: 'star' },
        { x: 548, y: 248, size: 34, kind: 'flower' },
      ],
    }

    for (const doodle of doodleSets[sectionId] ?? []) {
      const center = this.terrainLocalToScreen(sectionId, { x: doodle.x, y: doodle.y })
      const size = doodle.size * this.layout.worldScale
      const seedKey = `${sectionId}:doodle:${doodle.kind}:${doodle.x}:${doodle.y}`

      if (doodle.kind === 'flower') {
        this.drawFlowerDoodle(center, size, seedKey)
      } else if (doodle.kind === 'star') {
        this.drawStarDoodle(center, size, seedKey)
      } else if (doodle.kind === 'heart') {
        this.drawHeartDoodle(center, size, seedKey)
      } else if (doodle.kind === 'smiley') {
        this.drawSmileyDoodle(center, size, seedKey)
      } else if (doodle.kind === 'worm') {
        this.drawWormDoodle(center, size, seedKey)
      } else if (doodle.kind === 'sun') {
        this.drawSunDoodle(center, size, seedKey)
      }
    }

    this.drawRiver(sectionId)
    this.drawDog(sectionId)
  }

  private drawLitPath(points: Point[], progress: number, color: string): void {
    const partial = partialPolyline(points, progress)
    if (partial.length < 2) {
      return
    }

    const context = this.context

    context.save()
    context.strokeStyle = PLOT_GLOW
    context.lineWidth = 10 * this.layout.worldScale
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    tracePolyline(context, partial)
    context.stroke()

    context.strokeStyle = color
    context.lineWidth = 4.2 * this.layout.worldScale
    context.beginPath()
    tracePolyline(context, partial)
    context.stroke()
    context.restore()
  }

  private drawSpark(points: Point[], progress: number): void {
    const partial = partialPolyline(points, progress)
    const spark = partial[partial.length - 1]

    if (!spark) {
      return
    }

    const context = this.context
    const radius = 6.4 * this.layout.worldScale

    context.save()
    context.fillStyle = 'rgba(255, 211, 111, 0.28)'
    context.beginPath()
    context.arc(spark.x, spark.y, radius * 1.9, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = FUSE
    context.beginPath()
    context.arc(spark.x, spark.y, radius, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  private drawLockIcon(center: Point, solved: boolean): void {
    const size = 14 * this.layout.worldScale
    const shackleColor = solved ? SUCCESS : LOCKED

    this.roughCanvas.arc(
      center.x,
      center.y - size * 0.12,
      size * 1.2,
      size * 1.05,
      Math.PI,
      Math.PI * 2,
      false,
      seeded(`lock:${center.x}:${center.y}:shackle`, {
        stroke: shackleColor,
        strokeWidth: Math.max(1.4, this.layout.worldScale * 2),
        roughness: 1.2,
        bowing: 1,
      }),
    )
    this.drawRoughRoundedRect(
      {
        x: center.x - size * 0.76,
        y: center.y,
        width: size * 1.52,
        height: size * 1.18,
      },
      size * 0.22,
      `lock:${center.x}:${center.y}:body`,
      {
        stroke: shackleColor,
        strokeWidth: Math.max(1.4, this.layout.worldScale * 2),
        fill: solved ? SUCCESS : LOCKED,
        fillStyle: 'cross-hatch',
        hachureGap: Math.max(4, this.layout.worldScale * 5),
        fillWeight: Math.max(0.8, this.layout.worldScale),
        roughness: 1.3,
        bowing: 1.1,
      },
    )
  }

  private drawWorldLinksBase(): void {
    for (const section of this.sections) {
      if (!this.unlockedSections.has(section.id)) {
        continue
      }

      for (const goal of section.goals) {
        const route = this.goalRoutePoints(section.id, goal)
        this.drawDirtRoad(route, 1, this.completedGoals.has(`${section.id}:${goal.id}`))

        for (const unlockId of goal.unlocks) {
          if (!this.unlockedSections.has(unlockId)) {
            continue
          }

          const terrainBridge = this.terrainConnectorPoints(section.id, unlockId)
          const reveal = this.sectionReveal(unlockId)
          this.drawTerrainBridge(terrainBridge, reveal)
          this.drawDirtRoad(terrainBridge, 0.9, this.completedGoals.has(`${section.id}:${goal.id}`), reveal)
        }
      }
    }
  }

  private drawGoalLine(sectionId: string, goal: GoalDefinition, solved: boolean): void {
    const graph = this.graphRect(sectionId)
    const color = solved ? SUCCESS : GOAL
    let start: Point
    let end: Point

    if (goal.edge === 'top') {
      start = { x: this.graphValueToScreenX(sectionId, goal.min), y: graph.y }
      end = { x: this.graphValueToScreenX(sectionId, goal.max), y: graph.y }
    } else if (goal.edge === 'right') {
      start = { x: graph.x + graph.width, y: this.graphValueToScreenY(sectionId, goal.min) }
      end = { x: graph.x + graph.width, y: this.graphValueToScreenY(sectionId, goal.max) }
    } else if (goal.edge === 'left') {
      start = { x: graph.x, y: this.graphValueToScreenY(sectionId, goal.min) }
      end = { x: graph.x, y: this.graphValueToScreenY(sectionId, goal.max) }
    } else {
      start = { x: this.graphValueToScreenX(sectionId, goal.min), y: graph.y + graph.height }
      end = { x: this.graphValueToScreenX(sectionId, goal.max), y: graph.y + graph.height }
    }

    this.roughCanvas.line(
      start.x,
      start.y,
      end.x,
      end.y,
      seeded(`goal:${sectionId}:${goal.id}`, {
        stroke: color,
        strokeWidth: 4 * this.layout.worldScale,
        roughness: 1.2,
        bowing: 0.8,
      }),
    )
  }

  private drawTile(rect: Rect, tile: TileDefinition, active: boolean, seedKey: string): void {
    const context = this.context
    const radius = rect.width * 0.22
    const pattern = tile.role === 'operator' ? 'zigzag-line' : 'cross-hatch'

    context.save()
    context.shadowColor = SHADOW
    context.shadowBlur = active ? 18 : 10
    context.shadowOffsetY = active ? 8 : 4
    fillRoundedRect(context, rect, radius, 'rgba(255,255,255,0.05)')
    context.restore()

    this.drawRoughRoundedRect(rect, radius, `tile:${seedKey}`, {
      stroke: active ? GOAL : INK,
      strokeWidth: 2.2,
      fill: tile.fill,
      fillStyle: pattern,
      hachureGap: Math.max(5, rect.width * 0.12),
      fillWeight: Math.max(0.8, rect.width * 0.025),
      roughness: 1.4,
      bowing: 1.15,
    })

    if (active) {
      this.drawRoughRoundedRect(
        {
          x: rect.x - 4,
          y: rect.y - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        },
        radius,
        `tile:${seedKey}:highlight`,
        {
          stroke: SLOT_GLOW,
          strokeWidth: 1.8,
          roughness: 1.25,
          bowing: 1,
        },
      )
    }

    context.save()
    context.fillStyle = tile.text
    context.font = `${Math.round(rect.height * 0.48)}px 'Short Stack', cursive`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(tile.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1)
    context.restore()
  }

  private drawSection(sectionId: string): void {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return
    }

    const terrain = this.terrainRect(sectionId)
    const board = this.boardRect(sectionId)
    const graph = this.graphRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const axes = this.sectionAxes(sectionId)
    const scaleX = board.width / visual.boardWidth
    const scaleY = board.height / visual.boardHeight
    const scale = Math.min(scaleX, scaleY)
    const active = sectionId === this.activeSectionId
    const solvedSection = this.completedSections.has(sectionId)
    const tokenLayouts = this.tokenLayouts(sectionId)
    const prefixX =
      tokenLayouts.length > 0 ? tokenLayouts[0].rect.x - 52 * scale : board.x + board.width * 0.22
    const equationY = board.y + visual.equationY * scaleY + 1
    const equationLeft =
      tokenLayouts.length > 0
        ? Math.min(prefixX - 10 * scale, tokenLayouts[0].rect.x - 20 * scale)
        : board.x + 22 * scale
    const equationRight =
      tokenLayouts.length > 0
        ? tokenLayouts[tokenLayouts.length - 1].rect.x +
          tokenLayouts[tokenLayouts.length - 1].rect.width +
          20 * scale
        : board.x + board.width - 22 * scale
    const equationRect = {
      x: equationLeft - 8 * scale,
      y: equationY - 28 * scale,
      width: Math.max(160 * scale, equationRight - equationLeft + 16 * scale),
      height: 56 * scale,
    }

    this.drawTerrainTexture(terrain, `terrain:${sectionId}`)
    this.drawSectionDecorations(sectionId)
    this.drawPaperCard(board, 18 * scale, `board:${sectionId}`, PAPER_ALT)
    this.drawPaperCard(graph, 16 * scale, `graph:${sectionId}`, GRAPH_FILL)
    this.drawPaperCard(equationRect, 14 * scale, `equation:${sectionId}`, PAPER)

    this.drawRoughRoundedRect(graph, 16 * scale, `graph-outline:${sectionId}`, {
      stroke: INK,
      strokeWidth: 2,
      fill: 'rgba(110, 96, 74, 0.08)',
      fillStyle: 'cross-hatch',
      hachureGap: Math.max(7, 7 * scale),
      fillWeight: Math.max(0.7, 0.9 * scale),
      roughness: 1.1,
      bowing: 0.95,
    })

    if (active) {
      this.drawRoughRoundedRect(
        {
          x: graph.x - 5 * scale,
          y: graph.y - 5 * scale,
          width: graph.width + 10 * scale,
          height: graph.height + 10 * scale,
        },
        18 * scale,
        `graph-focus:${sectionId}`,
        {
          stroke: GOAL,
          strokeWidth: 2.4 * scale,
          roughness: 1.3,
          bowing: 1,
        },
      )
    }

    for (const tick of axisTicks(axes.x)) {
      const x = this.graphValueToScreenX(sectionId, tick)
      this.roughCanvas.line(
        x,
        graph.y,
        x,
        graph.y + graph.height,
        seeded(`grid:${sectionId}:x:${tick}`, {
          stroke: GRID,
          strokeWidth: Math.max(0.9, 0.95 * scale),
          roughness: 1.15,
          bowing: 1.2,
        }),
      )
    }

    for (const tick of axisTicks(axes.y)) {
      const y = this.graphValueToScreenY(sectionId, tick)
      this.roughCanvas.line(
        graph.x,
        y,
        graph.x + graph.width,
        y,
        seeded(`grid:${sectionId}:y:${tick}`, {
          stroke: GRID,
          strokeWidth: Math.max(0.9, 0.95 * scale),
          roughness: 1.15,
          bowing: 1.2,
        }),
      )
    }

    const yAxisX =
      axes.x.min <= 0 && axes.x.max >= 0 ? this.graphValueToScreenX(sectionId, 0) : graph.x
    const xAxisY =
      axes.y.min <= 0 && axes.y.max >= 0
        ? this.graphValueToScreenY(sectionId, 0)
        : graph.y + graph.height

    this.roughCanvas.line(
      graph.x,
      xAxisY,
      graph.x + graph.width,
      xAxisY,
      seeded(`axis:${sectionId}:x`, {
        stroke: AXIS,
        strokeWidth: 2.1 * scale,
        roughness: 1.05,
        bowing: 0.7,
      }),
    )
    this.roughCanvas.line(
      yAxisX,
      graph.y + graph.height,
      yAxisX,
      graph.y,
      seeded(`axis:${sectionId}:y`, {
        stroke: AXIS,
        strokeWidth: 2.1 * scale,
        roughness: 1.05,
        bowing: 0.7,
      }),
    )

    this.context.fillStyle = INK
    this.context.font = `${Math.round(16 * scale)}px 'Schoolbell', cursive`
    this.context.textAlign = 'center'
    this.context.textBaseline = 'top'
    for (const tick of axisTicks(axes.x)) {
      const x = this.graphValueToScreenX(sectionId, tick)
      this.context.fillText(formatAxisValue(tick), x, graph.y + graph.height + 8 * scale)
    }

    this.context.textAlign = 'right'
    this.context.textBaseline = 'middle'
    for (const tick of axisTicks(axes.y)) {
      const y = this.graphValueToScreenY(sectionId, tick)
      this.context.fillText(formatAxisValue(tick), graph.x - 9 * scale, y)
    }

    this.context.textAlign = 'left'
    this.context.textBaseline = 'alphabetic'
    this.context.font = `${Math.round(22 * scale)}px 'Short Stack', cursive`
    this.context.fillText('y', yAxisX - 2 * scale, graph.y - 9 * scale)
    this.context.fillText('x', graph.x + graph.width + 10 * scale, xAxisY + 19 * scale)
    this.context.restore()

    for (const goal of section.goals) {
      this.drawGoalLine(sectionId, goal, this.completedGoals.has(`${sectionId}:${goal.id}`))
    }

    if (runtime.plotResult && runtime.plotResult.points.length > 1) {
      const progress = runtime.animating ? runtime.plotProgress : 1
      const plotPoints = runtime.plotResult.points.map((point) => this.graphPointToScreen(sectionId, point))
      const visiblePoints = partialPolyline(plotPoints, progress)

      if (visiblePoints.length > 1) {
        this.context.save()
        this.context.strokeStyle = PLOT_GLOW
        this.context.lineWidth = 8 * scale
        this.context.lineCap = 'round'
        this.context.lineJoin = 'round'
        this.context.beginPath()
        tracePolyline(this.context, visiblePoints)
        this.context.stroke()

        this.context.strokeStyle = solvedSection ? SUCCESS : PLOT
        this.context.lineWidth = 4.2 * scale
        this.context.beginPath()
        tracePolyline(this.context, visiblePoints)
        this.context.stroke()
        this.context.restore()
      }
    }

    const activeTileId = this.drag?.kind === 'tile' ? this.drag.tileId : this.selectedTileId

    this.context.save()
    this.context.fillStyle = INK
    this.context.font = `${Math.round(20 * scale)}px 'Short Stack', cursive`
    this.context.textBaseline = 'middle'
    this.context.fillText('y =', prefixX, equationY)

    for (const token of tokenLayouts) {
      if (token.part.type === 'fixed') {
        this.context.fillText(
          token.part.value,
          token.rect.x + token.rect.width / 2 - token.rect.width * 0.18,
          token.rect.y + token.rect.height / 2,
        )
        continue
      }

      const placedTileId = runtime.placements[token.part.slotId]
      const compatible =
        active &&
        Boolean(activeTileId) &&
        this.compatibleSlots(activeTileId as TileId).includes(token.part.slotId)

      if (compatible) {
        fillRoundedRect(this.context, token.rect, 12 * scale, 'rgba(195, 255, 227, 0.14)')
      }
      this.drawRoughRoundedRect(token.rect, 12 * scale, `slot:${sectionId}:${token.part.slotId}`, {
        stroke: compatible ? SLOT_GLOW : SLOT,
        strokeWidth: compatible ? 2.6 * scale : 1.7 * scale,
        roughness: 1.15,
        bowing: 1,
      })

      if (placedTileId) {
        this.drawTile(
          {
            x: token.rect.x + 2,
            y: token.rect.y + 2,
            width: token.rect.width - 4,
            height: token.rect.height - 4,
          },
          TILE_DEFINITIONS[placedTileId],
          false,
          `slot:${sectionId}:${token.part.slotId}`,
        )
      }
    }
    this.context.restore()
  }

  private drawWorldLinksOverlay(): void {
    for (const section of this.sections) {
      if (!this.unlockedSections.has(section.id)) {
        continue
      }

      const runtime = this.sectionRuntimes.get(section.id)
      if (!runtime) {
        continue
      }

      for (const goal of section.goals) {
        const solved = this.completedGoals.has(`${section.id}:${goal.id}`)
        const route = this.goalRoutePoints(section.id, goal)
        const isAnimatingGoal = runtime.animatingGoalId === goal.id
        const fuseProgress = solved ? 1 : isAnimatingGoal ? runtime.fuseProgress : 0

        if (route.length > 1 && fuseProgress > 0) {
          this.drawLitPath(route, fuseProgress, solved ? SUCCESS : FUSE)
          if (!solved && runtime.animating) {
            this.drawSpark(route, fuseProgress)
          }
        }

        const lockPoint = this.goalLockPoint(section.id, goal)
        if (lockPoint && goal.unlocks.length > 0 && !solved) {
          this.drawLockIcon(lockPoint, false)
        }
      }
    }
  }

  private drawTray(): void {
    const activeTileId = this.drag?.kind === 'tile' ? this.drag.tileId : this.selectedTileId

    for (const { tileId, rect } of this.trayTileRects()) {
      const lifted = tileId === activeTileId && this.drag?.kind !== 'tile'
      this.drawTile(
        {
          x: rect.x,
          y: lifted ? rect.y - 8 : rect.y,
          width: rect.width,
          height: rect.height,
        },
        TILE_DEFINITIONS[tileId],
        tileId === activeTileId,
        `tray:${tileId}`,
      )
    }

    if (this.drag?.kind === 'tile' && this.drag.dragging) {
      this.drawTile(
        {
          x: this.drag.current.x - this.drag.offset.x,
          y: this.drag.current.y - this.drag.offset.y,
          width: this.layout.tileSize,
          height: this.layout.tileSize,
        },
        TILE_DEFINITIONS[this.drag.tileId],
        true,
        `drag:${this.drag.tileId}`,
      )
    }
  }

  private render(): void {
    this.drawBackground()
    this.drawWorldLinksBase()

    const orderedSections = this.sections
      .filter((section) => this.unlockedSections.has(section.id))
      .sort((left, right) => {
        if (left.id === this.activeSectionId) {
          return 1
        }
        if (right.id === this.activeSectionId) {
          return -1
        }
        return 0
      })

    orderedSections.forEach((section) => this.drawSection(section.id))
    this.drawWorldLinksOverlay()
    this.drawTray()
  }

  private renderGameToText(): string {
    const activeLevel = (this.sectionIndexById.get(this.activeSectionId) ?? 0) + 1
    const sections = this.sections
      .filter((section) => this.unlockedSections.has(section.id))
      .map((section) => {
        const runtime = this.sectionRuntimes.get(section.id)
        const axes = this.sectionAxes(section.id)
        const visual = this.sectionVisual(section.id)
        const levelNumber = (this.sectionIndexById.get(section.id) ?? 0) + 1

        return {
          id: section.id,
          level: levelNumber,
          active: section.id === this.activeSectionId,
          reveal: Number(this.sectionReveal(section.id).toFixed(2)),
          world: {
            x: section.world.x,
            y: section.world.y + Number(this.boardDropOffset(section.id).toFixed(1)),
          },
          axes,
          terrain: {
            width: visual.terrainWidth,
            height: visual.terrainHeight,
          },
          graphFrame: {
            width: visual.graphWidth,
            height: visual.graphHeight,
          },
          expression: this.placementExpression(section.id),
          goalsSolved: runtime?.solvedGoalIds ?? [],
          pendingGoals: runtime?.pendingGoalIds ?? [],
          plot: runtime?.plotResult?.screenLabel ?? null,
        }
      })

    return JSON.stringify({
      mode:
        this.cameraTween ||
        sections.some((section) => section.reveal < 1) ||
        this.keyboardVelocity.x !== 0 ||
        this.keyboardVelocity.y !== 0
          ? 'animating'
          : 'explore',
      controls:
        'drag or two-finger scroll to pan, use WASD or arrow keys to glide the camera, tap a board to center it, drag or tap tiles into slots',
      coordinateSystem:
        'world uses screen-centered camera space; each graph uses its own axis bounds, with x increasing right and y increasing upward',
      activeSection: this.activeSectionId,
      activeLevel,
      camera: {
        x: Number(this.camera.x.toFixed(1)),
        y: Number(this.camera.y.toFixed(1)),
      },
      unlockedTiles: [...this.unlockedTiles],
      trayTiles: this.trayTileRects().map(({ tileId }) => tileId),
      selectedTile: this.selectedTileId,
      startLevelOverride: this.startLevelOverride,
      sections,
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
    __graphbound_debug: {
      focusSection: (sectionId: string) => void
      placeTile: (tileId: TileId, slotId: string) => void
      startAtLevel: (levelNumber: number) => void
      getState: () => unknown
    }
  }
}
