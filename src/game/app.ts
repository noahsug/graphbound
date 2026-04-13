import rough from 'roughjs'

import {
  DEFAULT_AXES,
  DEFAULT_SECTION_VISUAL,
  PLOT_DURATION_MS,
  SECTIONS,
  TILE_DEFINITIONS,
} from './content'
import { evaluateSectionPlot, formatEquationLabel } from './math'
import type {
  AxisDefinition,
  BoundaryHit,
  DragState,
  EquationPart,
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

const INK = '#2d2620'
const AXIS = '#27211c'
const PLOT_GLOW = 'rgba(45, 38, 32, 0.08)'
const GOAL = '#c79d45'
const GRASS_TOP = '#97e4a6'
const CHALKBOARD_MID = '#f6eddf'
const CHALK_DUST = 'rgba(120, 101, 79, 0.055)'
const SHADOW = 'rgba(75, 60, 44, 0.12)'
const CAMERA_DURATION_MS = 880
const FUSE_DURATION_MS = 560
const TARGET_FILL_DURATION_MS = 220
const UNLOCK_CAMERA_DURATION_MULTIPLIER = 1.7
const SECTION_REVEAL_DURATION_MS = 1160
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
const MIN_ZOOM_LEVEL = 0.18
const START_ZOOM_LEVEL = 1
const MAX_ZOOM_LEVEL = START_ZOOM_LEVEL
const KEY_ZOOM_FACTOR = 1.14
const WHEEL_ZOOM_SENSITIVITY = 0.0014
const MIN_PINCH_DISTANCE = 12
const GOAL_GLOW_ZOOM_THRESHOLD = 0.42
const GOAL_GLOW_MIN_ALPHA = 0.12
const GOAL_GLOW_MAX_ALPHA = 0.32
const LOCKED_GOAL_ZOOM_THRESHOLD = 0.5
const LOCKED_GOAL_MIN_ALPHA = 0.08
const LOCKED_GOAL_MAX_ALPHA = 0.38
const SOLVED_GOAL_ALPHA = 0.52
const SOLVED_GOAL_LIGHTEN = 0.64
const EQUATION_FONT_SIZE = 23
const EQUATION_TOKEN_SIZE = 38
const EQUATION_PREFIX_WIDTH_Y = 34
const EQUATION_PREFIX_WIDTH_R = 28
const EQUATION_GAP = 10
const EQUATION_PAREN_GAP = 4
const EQUATION_SUPERSCRIPT_OVERLAP = -4
const MAJOR_TICK_SIZE = 12
const MINOR_TICK_SIZE = 6
const TICK_STROKE_WIDTH = 1.55
const GOAL_GUIDE_MAJOR_TICK_SIZE = 16
const GOAL_GUIDE_MINOR_TICK_SIZE = 10
const GOAL_GUIDE_LABEL_SIZE = 14
const CAMERA_VISIBILITY_MARGIN_PX = 50

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

const GRAPH_UNIT_WORLD_X = DEFAULT_SECTION_VISUAL.graphWidth / axisRange(DEFAULT_AXES.x)
const GRAPH_UNIT_WORLD_Y = DEFAULT_SECTION_VISUAL.graphHeight / axisRange(DEFAULT_AXES.y)

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

function isMajorTick(value: number, axis: AxisDefinition): boolean {
  const step = Math.max(0.1, axis.tickStep ?? 1)
  const everyFive = value / (step * 5)
  return Math.abs(everyFive - Math.round(everyFive)) <= 0.001
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

function traceSmoothPath(context: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) {
    return
  }

  context.moveTo(points[0].x, points[0].y)

  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y)
    return
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    const mid = {
      x: (point.x + next.x) / 2,
      y: (point.y + next.y) / 2,
    }
    context.quadraticCurveTo(point.x, point.y, mid.x, mid.y)
  }

  const penultimate = points[points.length - 2]
  const last = points[points.length - 1]
  context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y)
}

function tracePolylinePath(context: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) {
    return
  }

  context.moveTo(points[0].x, points[0].y)

  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y)
  }
}

function dashedPolylineSegments(
  points: Point[],
  dashLength: number,
  gapLength: number,
): Point[][] {
  if (points.length < 2 || dashLength <= 0) {
    return []
  }

  const segments: Point[][] = []
  let drawing = true
  let remaining = dashLength
  let current: Point[] = [{ ...points[0] }]

  for (let index = 1; index < points.length; index += 1) {
    let start = points[index - 1]
    const end = points[index]
    let segmentLength = distanceBetween(start, end)

    if (segmentLength <= 0.001) {
      continue
    }

    while (segmentLength > 0.001) {
      if (segmentLength <= remaining + 0.001) {
        if (drawing) {
          current.push(end)
        }
        remaining -= segmentLength

        if (remaining <= 0.001) {
          if (drawing && current.length > 1) {
            segments.push(current)
          }
          drawing = !drawing
          remaining = drawing ? dashLength : gapLength
          current = drawing ? [{ ...end }] : []
        }
        break
      }

      const t = remaining / segmentLength
      const split = {
        x: lerp(start.x, end.x, t),
        y: lerp(start.y, end.y, t),
      }

      if (drawing) {
        current.push(split)
        if (current.length > 1) {
          segments.push(current)
        }
      }

      drawing = !drawing
      remaining = drawing ? dashLength : gapLength
      current = drawing ? [{ ...split }] : []
      start = split
      segmentLength = distanceBetween(start, end)
    }
  }

  if (drawing && current.length > 1) {
    segments.push(current)
  }

  return segments
}

function pointInExpandedRect(point: Point, rect: Rect, inset = 0): boolean {
  return (
    point.x >= rect.x - inset &&
    point.x <= rect.x + rect.width + inset &&
    point.y >= rect.y - inset &&
    point.y <= rect.y + rect.height + inset
  )
}

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared <= 0.000001) {
    return distanceBetween(point, start)
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1,
  )

  return distanceBetween(point, {
    x: start.x + dx * t,
    y: start.y + dy * t,
  })
}

function pointToPolylineDistance(point: Point, points: Point[]): number {
  if (points.length < 2) {
    return Number.POSITIVE_INFINITY
  }

  let best = Number.POSITIVE_INFINITY

  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, pointToSegmentDistance(point, points[index - 1], points[index]))
  }

  return best
}

function rectsIntersect(a: Rect, b: Rect, inset = 0): boolean {
  return !(
    a.x + a.width < b.x - inset ||
    b.x + b.width < a.x - inset ||
    a.y + a.height < b.y - inset ||
    b.y + b.height < a.y - inset
  )
}

function ccw(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = ccw(a, b, c)
  const abD = ccw(a, b, d)
  const cdA = ccw(c, d, a)
  const cdB = ccw(c, d, b)

  if (abC === 0 && abD === 0 && cdA === 0 && cdB === 0) {
    const overlapX =
      Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
    const overlapY =
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
    return overlapX && overlapY
  }

  return (abC === 0 || abD === 0 || Math.sign(abC) !== Math.sign(abD)) &&
    (cdA === 0 || cdB === 0 || Math.sign(cdA) !== Math.sign(cdB))
}

function segmentIntersectsRect(start: Point, end: Point, rect: Rect, inset = 0): boolean {
  const expanded = {
    x: rect.x - inset,
    y: rect.y - inset,
    width: rect.width + inset * 2,
    height: rect.height + inset * 2,
  }

  if (pointInExpandedRect(start, rect, inset) || pointInExpandedRect(end, rect, inset)) {
    return true
  }

  const corners = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    { x: expanded.x, y: expanded.y + expanded.height },
  ]

  for (let index = 0; index < corners.length; index += 1) {
    const edgeStart = corners[index]
    const edgeEnd = corners[(index + 1) % corners.length]
    if (segmentsIntersect(start, end, edgeStart, edgeEnd)) {
      return true
    }
  }

  return false
}

function dedupePoints(points: Point[], epsilon = 0.5): Point[] {
  const deduped: Point[] = []

  for (const point of points) {
    const last = deduped[deduped.length - 1]
    if (!last || distanceBetween(last, point) > epsilon) {
      deduped.push(point)
    }
  }

  return deduped
}

function simplifyConnectorPoints(points: Point[]): Point[] {
  const deduped = dedupePoints(points)

  if (deduped.length <= 2) {
    return deduped
  }

  const simplified: Point[] = [deduped[0]]

  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]
    const current = deduped[index]
    const next = deduped[index + 1]
    const triangleArea = Math.abs(ccw(previous, current, next))
    const directDistance = distanceBetween(previous, next)
    const detourDistance =
      distanceBetween(previous, current) + distanceBetween(current, next)

    if (triangleArea < 12 && detourDistance - directDistance < 10) {
      continue
    }

    simplified.push(current)
  }

  simplified.push(deduped[deduped.length - 1])
  return simplified
}

function colorChannels(color: string): [number, number, number] | null {
  const normalized = color.trim()

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return [
      Number.parseInt(normalized.slice(1, 3), 16),
      Number.parseInt(normalized.slice(3, 5), 16),
      Number.parseInt(normalized.slice(5, 7), 16),
    ]
  }

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return [
      Number.parseInt(`${normalized[1]}${normalized[1]}`, 16),
      Number.parseInt(`${normalized[2]}${normalized[2]}`, 16),
      Number.parseInt(`${normalized[3]}${normalized[3]}`, 16),
    ]
  }

  return null
}

function mixColors(start: string, end: string, progress: number, alpha = 1): string {
  const from = colorChannels(start)
  const to = colorChannels(end)

  if (!from || !to) {
    return start
  }

  const t = clamp(progress, 0, 1)
  const r = Math.round(lerp(from[0], to[0], t))
  const g = Math.round(lerp(from[1], to[1], t))
  const b = Math.round(lerp(from[2], to[2], t))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function createLayout(width: number, height: number, zoomLevel = 1): Layout {
  const tileSize = clamp(Math.min(width, height) * 0.099, 52, 76)
  const trayY = height - tileSize - clamp(height * 0.04, 18, 30)
  const minimumScale = width < 720 ? 1.04 : 0.9
  const baseWorldScale = clamp(Math.min(width / 1280, height / 900) * 1.55, minimumScale, 1.82)
  const worldScale = baseWorldScale * clamp(zoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL)
  const worldCenterY = Math.min(height * 0.42, trayY - 180)

  return {
    width,
    height,
    worldCenter: {
      x: width / 2,
      y: worldCenterY,
    },
    baseWorldScale,
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
  private readonly activeTouchPoints = new Map<number, Point>()
  private paperPattern: CanvasPattern | null = null

  private layout: Layout
  private drag: DragState | null = null
  private pinchState:
    | {
        pointerIds: [number, number]
        startDistance: number
        startScale: number
        anchorWorld: Point
      }
    | null = null
  private selectedTileId: TileId | null = null
  private hoveredGoalKey: string | null = null
  private pinnedGoalKey: string | null = null
  private activeSectionId = this.sections[0].id
  private camera: Point = { ...this.sections[0].world }
  private zoomLevel = START_ZOOM_LEVEL
  private statusMessage = 'world-ready'
  private startLevelOverride: number | null = null
  private petDogTimer = 0
  private animationFrame: number | null = null
  private lastFrameTime: number | null = null
  private readonly movementKeys = new Set<string>()
  private keyboardVelocity: Point = { x: 0, y: 0 }
  private cameraTween:
    | {
        from: Point
        to: Point
        fromScale: number
        toScale: number
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
    this.layout = createLayout(960, 720, this.zoomLevel)

    for (const section of this.sections) {
      const placements: Record<string, TileId | null> = {}
      for (const slot of section.slots) {
        placements[slot.id] = null
      }

      this.sectionRuntimes.set(section.id, {
        placements,
        plotResult: null,
        plotProgress: 0,
        targetFillProgress: 0,
        fuseProgress: 0,
        fuseCameraProgress: 0,
        fuseCameraFrom: null,
        fuseCameraTo: null,
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
    this.camera = this.constrainedCamera(this.sectionFocusPoint(this.activeSectionId))

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
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
      selectTile: (tileId: TileId | null) => this.setSelectedTile(tileId),
      placeTile: (tileId: TileId, slotId: string) => this.debugPlaceTile(tileId, slotId),
      animatePlaceTile: (tileId: TileId, slotId: string) => this.debugAnimatePlaceTile(tileId, slotId),
      startAtLevel: (levelNumber: number) => this.debugStartAtLevel(levelNumber),
      getState: () => JSON.parse(this.renderGameToText()),
      getLayoutIssues: () => this.layoutOverlapIssues(),
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
    runtime.targetFillProgress = 0
    runtime.fuseProgress = 0
    runtime.fuseCameraProgress = 0
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null
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
    this.startLevelOverride = null

    for (const section of this.sections) {
      this.resetRuntime(section.id)

      if (section.initialUnlocked) {
        this.unlockedSections.add(section.id)
        this.sectionRevealProgress.set(section.id, 1)
      }
    }

    this.activeSectionId = this.sections[0].id
    this.camera = this.sectionFocusPoint(this.sections[0].id)
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
    if (availableTiles.length === 0) {
      return null
    }

    let bestPlacements: Record<string, TileId | null> | null = null
    let bestScore = -1

    const search = (slotIndex: number, placements: Record<string, TileId | null>) => {
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

      for (const tileId of availableTiles) {
        if (!this.tileAllowedForSection(sectionId, tileId)) {
          continue
        }
        if (Object.values(placements).some((placedTileId) => placedTileId === tileId)) {
          continue
        }
        placements[slotId] = tileId
        search(slotIndex + 1, placements)
        placements[slotId] = null
      }
    }

    search(0, this.createEmptyPlacements(section))
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
    runtime.targetFillProgress = runtime.plotResult?.achievedGoalIds.length ? 1 : 0
    runtime.fuseProgress = runtime.plotResult?.achievedGoalIds.length ? 1 : 0
    runtime.fuseCameraProgress = runtime.plotResult?.achievedGoalIds.length ? 1 : 0
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
    this.setActiveSection(targetSection.id)
    this.camera = this.constrainedCamera(this.sectionFocusPoint(targetSection.id))
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

    this.layout = createLayout(width, height, this.zoomLevel)
    this.camera = this.constrainedCamera(this.camera)
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

  private screenToWorld(point: Point): Point {
    return {
      x: this.camera.x + (point.x - this.layout.worldCenter.x) / this.layout.worldScale,
      y: this.camera.y + (point.y - this.layout.worldCenter.y) / this.layout.worldScale,
    }
  }

  private sectionFocusPoint(sectionId: string): Point {
    const graph = this.graphWorldRect(sectionId)
    return {
      x: graph.x + graph.width / 2,
      y: graph.y + graph.height / 2,
    }
  }

  private graphWorldSize(sectionId: string): { width: number; height: number } {
    const axes = this.sectionAxes(sectionId)
    return {
      width: axisRange(axes.x) * GRAPH_UNIT_WORLD_X,
      height: axisRange(axes.y) * GRAPH_UNIT_WORLD_Y,
    }
  }

  private graphBoardMargins(sectionId: string): {
    left: number
    right: number
    top: number
    bottom: number
  } {
    const visual = this.sectionVisual(sectionId)
    return {
      left: visual.graphX,
      right: Math.max(0, visual.boardWidth - visual.graphX - visual.graphWidth),
      top: visual.graphY,
      bottom: Math.max(0, visual.boardHeight - visual.graphY - visual.graphHeight),
    }
  }

  private boardTerrainMargins(sectionId: string): {
    left: number
    right: number
    top: number
    bottom: number
  } {
    const visual = this.sectionVisual(sectionId)
    return {
      left: visual.boardX,
      right: Math.max(0, visual.terrainWidth - visual.boardX - visual.boardWidth),
      top: visual.boardY,
      bottom: Math.max(0, visual.terrainHeight - visual.boardY - visual.boardHeight),
    }
  }

  private graphCenterOffset(sectionId: string): Point {
    const visual = this.sectionVisual(sectionId)
    return {
      x: -visual.terrainWidth / 2 + visual.boardX + visual.graphX + visual.graphWidth / 2,
      y: -visual.terrainHeight / 2 + visual.boardY + visual.graphY + visual.graphHeight / 2,
    }
  }

  private worldRectToScreen(rect: Rect): Rect {
    const topLeft = this.worldToScreen({ x: rect.x, y: rect.y })
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: rect.width * this.layout.worldScale,
      height: rect.height * this.layout.worldScale,
    }
  }

  private boardWorldRect(sectionId: string): Rect {
    const graph = this.graphWorldRect(sectionId)
    const margins = this.graphBoardMargins(sectionId)

    return {
      x: graph.x - margins.left,
      y: graph.y - margins.top,
      width: graph.width + margins.left + margins.right,
      height: graph.height + margins.top + margins.bottom,
    }
  }

  private graphWorldRect(sectionId: string): Rect {
    const section = this.sectionById.get(sectionId)

    if (!section) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    const graphSize = this.graphWorldSize(sectionId)
    const offset = this.graphCenterOffset(sectionId)
    const center = {
      x: section.world.x + offset.x,
      y: section.world.y + offset.y,
    }

    return {
      x: center.x - graphSize.width / 2,
      y: center.y - graphSize.height / 2,
      width: graphSize.width,
      height: graphSize.height,
    }
  }

  private terrainWorldRect(sectionId: string): Rect {
    const board = this.boardWorldRect(sectionId)
    const margins = this.boardTerrainMargins(sectionId)

    return {
      x: board.x - margins.left,
      y: board.y - margins.top,
      width: board.width + margins.left + margins.right,
      height: board.height + margins.top + margins.bottom,
    }
  }

  private visibleWorldRect(): Rect {
    const topLeft = this.screenToWorld({ x: 0, y: 0 })
    const bottomRight = this.screenToWorld({ x: this.layout.width, y: this.layout.height })

    return {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    }
  }

  private boundsFromPoints(points: Point[], padding = 0): Rect {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    let minX = points[0].x
    let maxX = points[0].x
    let minY = points[0].y
    let maxY = points[0].y

    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    }
  }

  private connectorWorldRects(): Rect[] {
    const padding = 12 / this.layout.worldScale
    const rects: Rect[] = []

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
        const isAnimatingGoal = runtime.animatingGoalId === goal.id
        const fuseProgress = solved ? 1 : isAnimatingGoal ? runtime.fuseProgress : 0

        if (fuseProgress <= 0) {
          continue
        }

        const route = this.goalConnectionPoints(section.id, goal)
        if (route.length < 2) {
          continue
        }

        const worldRoute = route.map((point) => this.screenToWorld(point))
        rects.push(this.boundsFromPoints(worldRoute, padding))
      }
    }

    return rects
  }

  private backgroundObstacleRects(): Rect[] {
    const sectionRects = this.sections.map((section) => this.boardWorldRect(section.id))
    const goalRects = this.sections.flatMap((section) =>
      section.goals.map((goal) => {
        const rect = this.goalShapeRect(section.id, goal)
        const topLeft = this.screenToWorld({ x: rect.x, y: rect.y })
        const bottomRight = this.screenToWorld({
          x: rect.x + rect.width,
          y: rect.y + rect.height,
        })

        return {
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        }
      }),
    )
    return [...sectionRects, ...goalRects, ...this.connectorWorldRects()]
  }

  private cameraVisibilityRectForContent(rect: Rect): Rect {
    const scale = this.layout.worldScale
    const visibilityMargin = CAMERA_VISIBILITY_MARGIN_PX / scale
    const leftSpace = Math.max(0, this.layout.worldCenter.x / scale - visibilityMargin)
    const rightSpace = Math.max(
      0,
      (this.layout.width - this.layout.worldCenter.x) / scale - visibilityMargin,
    )
    const topSpace = Math.max(0, this.layout.worldCenter.y / scale - visibilityMargin)
    const bottomSpace = Math.max(
      0,
      (this.layout.height - this.layout.worldCenter.y) / scale - visibilityMargin,
    )

    return {
      x: rect.x - rightSpace,
      y: rect.y - bottomSpace,
      width: rect.width + leftSpace + rightSpace,
      height: rect.height + topSpace + bottomSpace,
    }
  }

  private clampPointToRect(point: Point, rect: Rect): Point {
    return {
      x: clamp(point.x, rect.x, rect.x + rect.width),
      y: clamp(point.y, rect.y, rect.y + rect.height),
    }
  }

  private constrainedCamera(point: Point): Point {
    const contentRects = [
      ...[...this.unlockedSections].map((sectionId) => this.graphWorldRect(sectionId)),
      ...this.connectorWorldRects(),
    ]
    const visibleRects = contentRects.map((rect) => this.cameraVisibilityRectForContent(rect))

    if (visibleRects.length === 0) {
      return point
    }

    for (const rect of visibleRects) {
      if (pointInRect(point, rect)) {
        return point
      }
    }

    let bestPoint = this.clampPointToRect(point, visibleRects[0])
    let bestDistance = distanceBetween(point, bestPoint)

    for (let index = 1; index < visibleRects.length; index += 1) {
      const candidate = this.clampPointToRect(point, visibleRects[index])
      const candidateDistance = distanceBetween(point, candidate)

      if (candidateDistance < bestDistance) {
        bestPoint = candidate
        bestDistance = candidateDistance
      }
    }

    return bestPoint
  }

  private constrainedCameraForScale(point: Point, scale: number): Point {
    const previousScale = this.layout.worldScale
    const previousZoomLevel = this.zoomLevel
    this.layout.worldScale = this.clampWorldScale(scale)
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    const constrained = this.constrainedCamera(point)
    this.layout.worldScale = previousScale
    this.zoomLevel = previousZoomLevel
    return constrained
  }

  private moveCameraAndScaleTo(
    point: Point,
    scale: number,
    animated: boolean,
    delayMs = 0,
  ): void {
    const targetScale = this.clampWorldScale(scale)
    const constrained = this.constrainedCameraForScale(point, targetScale)

    if (!animated) {
      this.layout.worldScale = targetScale
      this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
      this.camera = constrained
      this.cameraTween = null
      this.render()
      return
    }

    this.cameraTween = {
      from: { ...this.camera },
      to: constrained,
      fromScale: this.layout.worldScale,
      toScale: targetScale,
      progress: 0,
      durationMs: CAMERA_DURATION_MS,
      delayMs,
    }
    this.ensureAnimation()
  }

  private cameraForWorldPointAtScreen(worldPoint: Point, screenPoint: Point): Point {
    return this.constrainedCamera({
      x: worldPoint.x - (screenPoint.x - this.layout.worldCenter.x) / this.layout.worldScale,
      y: worldPoint.y - (screenPoint.y - this.layout.worldCenter.y) / this.layout.worldScale,
    })
  }

  private focusSection(sectionId: string, centerCamera: boolean, animated = true): void {
    if (!this.unlockedSections.has(sectionId)) {
      return
    }

    if (centerCamera) {
      this.moveCameraAndScaleTo(
        this.sectionFocusPoint(sectionId),
        this.layout.baseWorldScale * START_ZOOM_LEVEL,
        animated,
        animated ? 0 : 0,
      )
    } else {
      this.setActiveSection(sectionId)
      this.render()
    }
  }

  private debugPlaceTile(tileId: TileId, slotId: string): void {
    this.placeTileInSlot(tileId, slotId, false)
    this.render()
  }

  private debugAnimatePlaceTile(tileId: TileId, slotId: string): void {
    this.placeTileInSlot(tileId, slotId, true)
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

  private sectionAlreadyUsesTile(sectionId: string, tileId: TileId): boolean {
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!runtime) {
      return false
    }

    return Object.values(runtime.placements).some((placedTileId) => placedTileId === tileId)
  }

  private tileAllowedForSection(sectionId: string, tileId: TileId): boolean {
    const section = this.sectionById.get(sectionId)

    if (!section) {
      return false
    }

    if (section.coordinateMode === 'polar') {
      return tileId !== 'x'
    }

    return tileId !== 'θ'
  }

  private setActiveSection(sectionId: string): void {
    if (this.activeSectionId === sectionId) {
      return
    }

    this.activeSectionId = sectionId
  }

  private nearestSectionToCenter(): string | null {
    let nearestId: string | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const sectionId of this.unlockedSections) {
      const rect = this.boardRect(sectionId)
      const center = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      }
      const distanceToCenter = distanceBetween(center, this.layout.worldCenter)

      if (distanceToCenter < bestDistance) {
        bestDistance = distanceToCenter
        nearestId = sectionId
      }
    }

    return nearestId
  }

  private syncSelectedSectionToCenter(): void {
    if (this.drag?.kind === 'tile') {
      return
    }

    const nearestId = this.nearestSectionToCenter()
    if (nearestId) {
      this.setActiveSection(nearestId)
    }
  }

  private getPointerPoint(event: PointerEvent): Point {
    return this.clientPointToCanvasPoint(event.clientX, event.clientY)
  }

  private clientPointToCanvasPoint(clientX: number, clientY: number): Point {
    const bounds = this.canvas.getBoundingClientRect()

    return {
      x: ((clientX - bounds.left) / bounds.width) * this.canvas.width,
      y: ((clientY - bounds.top) / bounds.height) * this.canvas.height,
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

  private clampWorldScale(scale: number): number {
    return clamp(
      scale,
      this.layout.baseWorldScale * MIN_ZOOM_LEVEL,
      this.layout.baseWorldScale * MAX_ZOOM_LEVEL,
    )
  }

  private setWorldScale(scale: number, anchorScreen: Point): void {
    const anchorWorld = this.screenToWorld(anchorScreen)
    this.layout.worldScale = this.clampWorldScale(scale)
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    this.camera = this.cameraForWorldPointAtScreen(anchorWorld, anchorScreen)
  }

  private zoomBy(factor: number, anchorScreen = this.layout.worldCenter): void {
    this.cameraTween = null
    this.setWorldScale(this.layout.worldScale * factor, anchorScreen)
    this.render()
  }

  private cancelDragForGesture(): void {
    if (this.drag?.kind === 'tile' && this.drag.sourceSlotId) {
      this.activeRuntime.placements[this.drag.sourceSlotId] = this.drag.tileId
      this.updateSectionPlot(this.activeSectionId, false)
    }

    this.drag = null
  }

  private beginPinchGesture(): void {
    const pointerIds = [...this.activeTouchPoints.keys()]
    if (pointerIds.length < 2) {
      return
    }

    const firstId = pointerIds[0]
    const secondId = pointerIds[1]
    const first = this.activeTouchPoints.get(firstId)
    const second = this.activeTouchPoints.get(secondId)

    if (!first || !second) {
      return
    }

    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    }

    this.cancelDragForGesture()
    this.cameraTween = null
    this.pinchState = {
      pointerIds: [firstId, secondId],
      startDistance: Math.max(distanceBetween(first, second), MIN_PINCH_DISTANCE),
      startScale: this.layout.worldScale,
      anchorWorld: this.screenToWorld(midpoint),
    }
  }

  private updatePinchGesture(): void {
    if (!this.pinchState) {
      return
    }

    const [firstId, secondId] = this.pinchState.pointerIds
    const first = this.activeTouchPoints.get(firstId)
    const second = this.activeTouchPoints.get(secondId)

    if (!first || !second) {
      return
    }

    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    }
    const distance = Math.max(distanceBetween(first, second), MIN_PINCH_DISTANCE)
    this.layout.worldScale = this.clampWorldScale(
      this.pinchState.startScale * (distance / this.pinchState.startDistance),
    )
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    this.camera = this.cameraForWorldPointAtScreen(this.pinchState.anchorWorld, midpoint)
  }

  private endPinchGesture(): void {
    if (!this.pinchState) {
      return
    }

    const remaining = [...this.activeTouchPoints.entries()]
    this.pinchState = null

    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0]
      this.drag = {
        kind: 'pan',
        pointerId,
        current: point,
        start: point,
        cameraStart: { ...this.camera },
        dragging: false,
        startedSectionId: null,
      }
      return
    }

    this.drag = null
  }

  private boardDropOffset(sectionId: string): number {
    void sectionId
    return 0
  }

  private sectionRevealPhase(sectionId: string, start: number, end: number): number {
    const reveal = easeOutCubic(this.sectionReveal(sectionId))

    if (end <= start) {
      return reveal >= end ? 1 : 0
    }

    return clamp((reveal - start) / (end - start), 0, 1)
  }

  private terrainRect(sectionId: string): Rect {
    return this.worldRectToScreen(this.terrainWorldRect(sectionId))
  }

  private boardRect(sectionId: string): Rect {
    return this.worldRectToScreen(this.boardWorldRect(sectionId))
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
      if (pointInRect(point, this.boardRect(sectionId))) {
        return sectionId
      }
    }

    return null
  }

  private connectorTargetAtPoint(point: Point): string | null {
    const hitThreshold = Math.max(12, 18 * this.layout.worldScale)
    const activeFocus = this.sectionFocusPoint(this.activeSectionId)
    let bestTargetId: string | null = null
    let bestHitDistance = Number.POSITIVE_INFINITY

    for (const section of this.sections) {
      if (!this.unlockedSections.has(section.id)) {
        continue
      }

      const runtime = this.sectionRuntimes.get(section.id)
      if (!runtime) {
        continue
      }

      for (const goal of section.goals) {
        const targetId = goal.unlocks[0]
        if (!targetId || !this.unlockedSections.has(targetId)) {
          continue
        }

        const solved = this.completedGoals.has(`${section.id}:${goal.id}`)
        const isAnimatingGoal = runtime.animatingGoalId === goal.id
        const fuseProgress = solved ? 1 : isAnimatingGoal ? runtime.fuseProgress : 0

        if (fuseProgress <= 0) {
          continue
        }

        const route = this.goalConnectionPoints(section.id, goal)
        if (route.length < 2) {
          continue
        }

        const visible = fuseProgress >= 1 ? route : partialPolyline(route, fuseProgress)
        const hitDistance = pointToPolylineDistance(point, visible)
        if (hitDistance > hitThreshold) {
          continue
        }

        const sourceDistance = distanceBetween(activeFocus, this.sectionFocusPoint(section.id))
        const targetDistance = distanceBetween(activeFocus, this.sectionFocusPoint(targetId))
        const destinationId = targetDistance >= sourceDistance ? targetId : section.id

        if (hitDistance < bestHitDistance) {
          bestHitDistance = hitDistance
          bestTargetId = destinationId
        }
      }
    }

    return bestTargetId
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
    return this.worldRectToScreen(this.graphWorldRect(sectionId))
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

  private equationCenterY(sectionId: string): number {
    const graph = this.graphRect(sectionId)
    const visual = this.sectionVisual(sectionId)
    const scale = this.boardScale(sectionId)
    const tokenSize = EQUATION_TOKEN_SIZE * this.layout.worldScale
    const gapBelowGraph = Math.max(0, visual.equationY - (visual.graphY + visual.graphHeight))
    const desiredBelow = graph.y + graph.height + gapBelowGraph * scale + 1
    const minimumBelow = graph.y + graph.height + tokenSize * 0.82
    return Math.max(desiredBelow, minimumBelow)
  }

  private trayTileRects(): Array<{ tileId: TileId; rect: Rect }> {
    const available = this.activeTileIds()
    const size = this.layout.tileSize
    const gap = this.layout.trayGap
    const maxWidth = Math.max(size, this.layout.width - clamp(this.layout.width * 0.12, 36, 88))
    const columns = Math.max(1, Math.floor((maxWidth + gap) / (size + gap)))
    const rows = Math.max(1, Math.ceil(available.length / columns))

    return available.map((tileId, index) => {
      const row = Math.floor(index / columns)
      const column = index % columns
      const rowCount =
        row === rows - 1 ? available.length - row * columns || columns : columns
      const rowWidth = rowCount * size + Math.max(0, rowCount - 1) * gap
      const startX = (this.layout.width - rowWidth) / 2

      return {
        tileId,
        rect: {
          x: startX + column * (size + gap),
          y: this.layout.trayY - (rows - 1 - row) * (size + gap),
          width: size,
          height: size,
        },
      }
    })
  }

  private equationPrefix(sectionId: string): 'y' | 'r' {
    return this.sectionById.get(sectionId)?.equationPrefix ??
      (this.sectionById.get(sectionId)?.coordinateMode === 'polar' ? 'r' : 'y')
  }

  private equationDisplayParts(sectionId: string): EquationPart[] {
    const section = this.sectionById.get(sectionId)
    return section?.displayEquation ?? section?.equation ?? []
  }

  private usesCustomEquationDisplay(sectionId: string): boolean {
    return Boolean(this.sectionById.get(sectionId)?.displayEquation)
  }

  private equationPrefixWidth(sectionId: string, scale: number): number {
    void scale
    if (this.usesCustomEquationDisplay(sectionId)) {
      return 0
    }
    return (
      (this.equationPrefix(sectionId) === 'r' ? EQUATION_PREFIX_WIDTH_R : EQUATION_PREFIX_WIDTH_Y) *
      this.layout.worldScale
    )
  }

  private equationPartMetrics(
    part: EquationPart,
    scale: number,
    tokenSize: number,
  ): { width: number; height: number; yOffset: number } {
    void scale
    const style = part.displayStyle ?? 'normal'
    const value = part.type === 'fixed' ? part.value : '_'
    const fontSize = EQUATION_FONT_SIZE * this.layout.worldScale

    if (style === 'superscript') {
      return {
        width:
          part.type === 'slot'
            ? tokenSize * 0.82
            : Math.max(fontSize * 0.9, Math.min(tokenSize * 0.72, value.length * fontSize * 0.9)),
        height: tokenSize,
        yOffset: -tokenSize * 0.34,
      }
    }

    if (style === 'subscript') {
      return {
        width:
          part.type === 'slot'
            ? tokenSize * 0.82
            : Math.max(fontSize * 0.9, Math.min(tokenSize * 0.72, value.length * fontSize * 0.9)),
        height: tokenSize,
        yOffset: tokenSize * 0.26,
      }
    }

    if (part.type === 'slot') {
      return { width: tokenSize, height: tokenSize, yOffset: 0 }
    }

    if (value === '+' || value === '-' || value === '/' || value === '(' || value === ')' || value === '|') {
      return {
        width: Math.max(fontSize * 0.7, tokenSize * 0.26),
        height: tokenSize,
        yOffset: 0,
      }
    }

    if (value === 'sin' || value === 'log') {
      return {
        width: Math.max(fontSize * 1.35, Math.min(tokenSize * 1.22, value.length * fontSize * 0.7)),
        height: tokenSize,
        yOffset: 0,
      }
    }

    return {
      width: Math.max(fontSize * 0.9, Math.min(tokenSize * 0.82, value.length * fontSize * 0.9)),
      height: tokenSize,
      yOffset: 0,
    }
  }

  private equationGapBetween(previous: EquationPart | null, next: EquationPart, scale: number): number {
    void scale
    const nextStyle = next.displayStyle ?? 'normal'

    if (nextStyle === 'superscript' || nextStyle === 'subscript') {
      return EQUATION_SUPERSCRIPT_OVERLAP * this.layout.worldScale
    }

    const previousValue = previous?.type === 'fixed' ? previous.value : null
    const nextValue = next.type === 'fixed' ? next.value : null

    if (nextValue === ')' || nextValue === '|' || previousValue === '(' || previousValue === '|') {
      return EQUATION_PAREN_GAP * this.layout.worldScale
    }

    return EQUATION_GAP * this.layout.worldScale
  }

  private equationConnectorCollision(sectionId: string, rect: Rect): boolean {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return false
    }

    const padding = 8 * this.layout.worldScale
    const expanded = {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    }

    for (const goal of section.goals) {
      const solved = this.completedGoals.has(`${section.id}:${goal.id}`)
      const isAnimatingGoal = runtime.animatingGoalId === goal.id
      const fuseProgress = solved ? 1 : isAnimatingGoal ? runtime.fuseProgress : 0

      if (fuseProgress <= 0) {
        continue
      }

      const route = this.goalConnectionPoints(section.id, goal)
      if (route.length < 2) {
        continue
      }

      const visible = fuseProgress >= 1 ? route : partialPolyline(route, fuseProgress)

      for (let index = 1; index < visible.length; index += 1) {
        if (segmentIntersectsRect(visible[index - 1], visible[index], expanded, 0)) {
          return true
        }
      }
    }

    return false
  }

  private equationElementCollision(sectionId: string, rect: Rect): boolean {
    if (this.equationConnectorCollision(sectionId, rect)) {
      return true
    }

    const padding = 10 * this.layout.worldScale
    const expanded = {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    }

    for (const section of this.sections) {
      if (section.id !== sectionId && rectsIntersect(expanded, this.graphRect(section.id), 0)) {
        return true
      }

      for (const goal of section.goals) {
        if (rectsIntersect(expanded, this.goalShapeRect(section.id, goal), 0)) {
          return true
        }
      }
    }

    return false
  }

  private rectToWorld(rect: Rect): Rect {
    const topLeft = this.screenToWorld({ x: rect.x, y: rect.y })
    const bottomRight = this.screenToWorld({
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    })

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }

  private equationWorldRect(sectionId: string): Rect | null {
    const tokenLayouts = this.tokenLayouts(sectionId)

    if (tokenLayouts.length === 0) {
      return null
    }

    const scale = this.boardScale(sectionId)
    const prefixWidth = this.equationPrefixWidth(sectionId, scale)
    const equationY = this.equationCenterY(sectionId)
    const tokenSize = EQUATION_TOKEN_SIZE * this.layout.worldScale
    const first = tokenLayouts[0]
    const last = tokenLayouts[tokenLayouts.length - 1]
    const rect = {
      x: first.rect.x - prefixWidth,
      y: equationY - tokenSize * 0.7,
      width: last.rect.x + last.rect.width - (first.rect.x - prefixWidth),
      height: tokenSize * 1.4,
    }

    return this.rectToWorld(rect)
  }

  private layoutOverlapIssues(): Array<{ kind: string; a: string; b: string }> {
    const items: Array<{ kind: 'graph' | 'equation' | 'goal'; id: string; rect: Rect }> = []

    for (const section of this.sections) {
      items.push({
        kind: 'graph',
        id: section.id,
        rect: this.graphWorldRect(section.id),
      })

      const equationRect = this.equationWorldRect(section.id)
      if (equationRect) {
        items.push({
          kind: 'equation',
          id: section.id,
          rect: equationRect,
        })
      }

      for (const goal of section.goals) {
        items.push({
          kind: 'goal',
          id: `${section.id}:${goal.id}`,
          rect: this.rectToWorld(this.goalShapeRect(section.id, goal)),
        })
      }
    }

    const issues: Array<{ kind: string; a: string; b: string }> = []

    for (let index = 0; index < items.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
        const a = items[index]
        const b = items[otherIndex]

        if (a.id === b.id) {
          continue
        }

        if (rectsIntersect(a.rect, b.rect, 6 / this.layout.worldScale)) {
          issues.push({
            kind: `${a.kind}-${b.kind}`,
            a: a.id,
            b: b.id,
          })
        }
      }
    }

    return issues
  }

  private tokenLayouts(sectionId: string): TokenLayout[] {
    const section = this.sectionById.get(sectionId)

    if (!section) {
      return []
    }

    const equationParts = this.equationDisplayParts(sectionId)
    const rect = this.boardRect(sectionId)
    const scale = this.boardScale(sectionId)
    const tokenSize = EQUATION_TOKEN_SIZE * this.layout.worldScale
    const prefixWidth = this.equationPrefixWidth(sectionId, scale)
    const tokenMetrics = equationParts.map((part) => this.equationPartMetrics(part, scale, tokenSize))
    const totalWidth = prefixWidth + tokenMetrics.reduce((sum, metrics, index) => {
      const gapBefore = index === 0 ? 0 : this.equationGapBetween(equationParts[index - 1], equationParts[index], scale)
      return sum + gapBefore + metrics.width
    }, 0)
    const equationY = this.equationCenterY(sectionId)
    const candidates = [
      rect.x + rect.width / 2 - totalWidth / 2,
      rect.x + rect.width * 0.62 - totalWidth / 2,
      rect.x + rect.width * 0.72 - totalWidth / 2,
      rect.x + rect.width * 0.38 - totalWidth / 2,
    ]

    let rowStart = candidates[0]

    for (const candidate of candidates) {
      const rowRect = {
        x: candidate,
        y: equationY - tokenSize * 0.7,
        width: totalWidth,
        height: tokenSize * 1.4,
      }

      if (!this.equationElementCollision(sectionId, rowRect)) {
        rowStart = candidate
        break
      }
    }

    let cursor = rowStart + prefixWidth

    return equationParts.map((part, index) => {
      const metrics = tokenMetrics[index]
      if (index > 0) {
        cursor += this.equationGapBetween(equationParts[index - 1], part, scale)
      }
      const rectForToken = {
        x: cursor,
        y: equationY - metrics.height / 2 + metrics.yOffset,
        width: metrics.width,
        height: metrics.height,
      }
      cursor += metrics.width
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

  private draggedTileRect(drag: Extract<DragState, { kind: 'tile' }>): Rect {
    return {
      x: drag.current.x - drag.offset.x,
      y: drag.current.y - drag.offset.y,
      width: this.layout.tileSize,
      height: this.layout.tileSize,
    }
  }

  private rectCenter(rect: Rect): Point {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }
  }

  private compatibleSlotsForSection(sectionId: string, tileId: TileId): string[] {
    const section = this.sectionById.get(sectionId)

    if (
      !section ||
      !this.tileAllowedForSection(sectionId, tileId) ||
      this.sectionAlreadyUsesTile(sectionId, tileId)
    ) {
      return []
    }

    return section.slots.map((slot) => slot.id)
  }

  private compatibleSlots(tileId: TileId): string[] {
    return this.compatibleSlotsForSection(this.activeSectionId, tileId)
  }

  private nearestOverlappingOpenSlot(tileId: TileId, tileRect: Rect): string | null {
    const tileCenter = this.rectCenter(tileRect)
    let bestSlotId: string | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const slotId of this.compatibleSlots(tileId)) {
      if (this.activeRuntime.placements[slotId]) {
        continue
      }

      const rect = this.slotRect(slotId)
      if (!rect || !rectsIntersect(tileRect, rect)) {
        continue
      }

      const distanceToSlot = distanceBetween(tileCenter, this.rectCenter(rect))
      if (distanceToSlot < bestDistance) {
        bestDistance = distanceToSlot
        bestSlotId = slotId
      }
    }

    return bestSlotId
  }

  private goalColor(sectionId: string, goal: GoalDefinition | string | null): string {
    const resolvedGoal =
      typeof goal === 'string'
        ? this.sectionById.get(sectionId)?.goals.find((candidate) => candidate.id === goal) ?? null
        : goal

    return resolvedGoal?.color ?? this.sectionById.get(sectionId)?.accent ?? GOAL
  }

  private goalKey(sectionId: string, goalId: string): string {
    return `${sectionId}:${goalId}`
  }

  private inspectedGoalKey(): string | null {
    return this.hoveredGoalKey ?? this.pinnedGoalKey
  }

  private inspectedGoalForSection(sectionId: string): GoalDefinition | null {
    const key = this.inspectedGoalKey()
    if (!key || !key.startsWith(`${sectionId}:`)) {
      return null
    }

    const goalId = key.slice(sectionId.length + 1)
    return this.sectionById.get(sectionId)?.goals.find((goal) => goal.id === goalId) ?? null
  }

  private placementExpression(sectionId: string): string {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!section || !runtime) {
      return 'y = _'
    }

    return formatEquationLabel(section, runtime.placements, true)
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
    const hits = runtime?.plotResult?.hits ?? []

    for (let index = hits.length - 1; index >= 0; index -= 1) {
      const hit = hits[index]
      if (this.goalMatchesHit(goal, hit)) {
        return hit.point
      }
    }

    return null
  }

  private defaultGoalPoint(sectionId: string, goal: GoalDefinition): PlotPoint {
    const axes = this.sectionAxes(sectionId)
    const axis = goal.edge === 'top' || goal.edge === 'bottom' ? axes.x : axes.y
    const coordinate =
      Math.abs(goal.max - axis.max) <= GOAL_EPSILON
        ? goal.max
        : Math.abs(goal.min - axis.min) <= GOAL_EPSILON
          ? goal.min
          : (goal.min + goal.max) / 2

    if (goal.edge === 'top') {
      return { x: coordinate, y: axes.y.max }
    }
    if (goal.edge === 'right') {
      return { x: axes.x.max, y: coordinate }
    }
    if (goal.edge === 'left') {
      return { x: axes.x.min, y: coordinate }
    }

    return { x: coordinate, y: axes.y.min }
  }

  private goalTargetPoint(sectionId: string, goal: GoalDefinition): PlotPoint {
    return this.goalHit(sectionId, goal) ?? this.defaultGoalPoint(sectionId, goal)
  }

  private defaultGoalAnchor(sectionId: string, goal: GoalDefinition): Point {
    return this.graphPointToScreen(sectionId, this.defaultGoalPoint(sectionId, goal))
  }

  private goalAnchor(sectionId: string, goal: GoalDefinition): Point {
    const hit = this.goalHit(sectionId, goal)
    if (hit) {
      return this.graphPointToScreen(sectionId, hit)
    }

    return this.defaultGoalAnchor(sectionId, goal)
  }

  private goalRouteDeparture(sectionId: string, goal: GoalDefinition): Point {
    const targetId = goal.unlocks[0]

    if (!targetId) {
      const anchor = this.defaultGoalAnchor(sectionId, goal)
      const extension = 42 * this.layout.worldScale

      if (goal.edge === 'top') {
        return { x: anchor.x, y: anchor.y - extension }
      }
      if (goal.edge === 'right') {
        return { x: anchor.x + extension, y: anchor.y }
      }
      if (goal.edge === 'left') {
        return { x: anchor.x - extension, y: anchor.y }
      }

      return { x: anchor.x, y: anchor.y + extension }
    }

    return this.graphOutsidePointToward(sectionId, targetId)
  }

  private goalRouteWaypoints(sectionId: string, goal: GoalDefinition): Point[] {
    return [this.goalRouteDeparture(sectionId, goal)]
  }

  private goalShapeCenter(sectionId: string, goal: GoalDefinition): Point {
    return this.goalAnchor(sectionId, goal)
  }

  private goalShapeRect(sectionId: string, goal: GoalDefinition): Rect {
    const center = this.goalShapeCenter(sectionId, goal)
    const radius = 10 * this.layout.worldScale

    return {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2,
    }
  }

  private goalAtPoint(point: Point): { sectionId: string; goal: GoalDefinition } | null {
    const orderedSections = [...this.sections].sort((left, right) => {
      if (left.id === this.activeSectionId) {
        return 1
      }
      if (right.id === this.activeSectionId) {
        return -1
      }
      return 0
    })

    for (let sectionIndex = orderedSections.length - 1; sectionIndex >= 0; sectionIndex -= 1) {
      const section = orderedSections[sectionIndex]
      for (let goalIndex = section.goals.length - 1; goalIndex >= 0; goalIndex -= 1) {
        const goal = section.goals[goalIndex]
        if (pointInRect(point, this.goalShapeRect(section.id, goal))) {
          return { sectionId: section.id, goal }
        }
      }
    }

    return null
  }

  private updateHoveredGoal(point: Point | null): boolean {
    const nextKey = point
      ? (() => {
          const match = this.goalAtPoint(point)
          return match ? this.goalKey(match.sectionId, match.goal.id) : null
        })()
      : null

    if (nextKey === this.hoveredGoalKey) {
      return false
    }

    this.hoveredGoalKey = nextKey
    return true
  }

  private formatGoalAxisLabel(value: number): string {
    const rounded = Math.abs(value) < 0.05 ? 0 : Number(value.toFixed(1))
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }

  private drawGoalAxisGuides(
    sectionId: string,
    goal: GoalDefinition,
    xAxisY: number,
    yAxisX: number,
    scale: number,
  ): void {
    void scale
    const point = this.goalTargetPoint(sectionId, goal)
    const color = this.goalColor(sectionId, goal)
    const labelColor = mixColors(color, INK, 0.22, 0.96)
    const x = this.graphValueToScreenX(sectionId, point.x)
    const y = this.graphValueToScreenY(sectionId, point.y)
    const majorTick = GOAL_GUIDE_MAJOR_TICK_SIZE * this.layout.worldScale
    const minorTick = GOAL_GUIDE_MINOR_TICK_SIZE * this.layout.worldScale
    const xLabel = this.formatGoalAxisLabel(point.x)
    const yLabel = this.formatGoalAxisLabel(point.y)

    this.roughCanvas.line(
      x,
      xAxisY - majorTick / 2,
      x,
      xAxisY + majorTick / 2,
      seeded(`goal-guide:${sectionId}:${goal.id}:x`, {
        stroke: color,
        strokeWidth: Math.max(1.8, 2.2 * this.layout.worldScale),
        roughness: 0.65,
        bowing: 0.4,
      }),
    )

    this.roughCanvas.line(
      yAxisX - minorTick / 2,
      y,
      yAxisX + minorTick / 2,
      y,
      seeded(`goal-guide:${sectionId}:${goal.id}:y`, {
        stroke: color,
        strokeWidth: Math.max(1.8, 2.2 * this.layout.worldScale),
        roughness: 0.65,
        bowing: 0.4,
      }),
    )

    this.context.save()
    this.context.fillStyle = labelColor
    this.context.font = `${Math.round(GOAL_GUIDE_LABEL_SIZE * this.layout.worldScale)}px 'Short Stack', cursive`
    this.context.textBaseline = 'top'
    this.context.textAlign = 'center'
    this.context.fillText(xLabel, x, xAxisY + majorTick * 0.7)
    this.context.textBaseline = 'middle'
    this.context.textAlign = 'right'
    this.context.fillText(yLabel, yAxisX - minorTick * 0.9, y)
    this.context.restore()
  }

  private goalRoutePoints(sectionId: string, goal: GoalDefinition): Point[] {
    const anchor = this.goalRouteDeparture(sectionId, goal)
    const route = this.goalRouteWaypoints(sectionId, goal)

    if (route.length === 0) {
      return [anchor, ...route]
    }

    if (distanceBetween(anchor, route[0]) <= 0.5) {
      return route
    }

    return [anchor, ...route]
  }

  private graphOutsidePointToward(sectionId: string, targetId: string): Point {
    const sourceRect = this.graphRect(sectionId)
    const sourceCenter = this.rectCenter(sourceRect)
    const targetCenter = this.rectCenter(this.graphRect(targetId))
    const offset = 42 * this.layout.worldScale

    return this.rectOutsidePointToward(sourceRect, sourceCenter, targetCenter, offset)
  }

  private graphOutsidePointFrom(sectionId: string, sourceId: string): Point {
    const targetRect = this.graphRect(sectionId)
    const targetCenter = this.rectCenter(targetRect)
    const sourceCenter = this.rectCenter(this.graphRect(sourceId))
    const offset = 42 * this.layout.worldScale

    return this.rectOutsidePointToward(targetRect, targetCenter, sourceCenter, offset)
  }

  private rectOutsidePointToward(rect: Rect, from: Point, toward: Point, offset: number): Point {
    const dx = toward.x - from.x
    const dy = toward.y - from.y
    const distance = Math.hypot(dx, dy) || 1
    const unitX = dx / distance
    const unitY = dy / distance
    const halfWidth = rect.width / 2
    const halfHeight = rect.height / 2
    const scaleX = Math.abs(unitX) > 0.0001 ? halfWidth / Math.abs(unitX) : Number.POSITIVE_INFINITY
    const scaleY = Math.abs(unitY) > 0.0001 ? halfHeight / Math.abs(unitY) : Number.POSITIVE_INFINITY
    const boundaryScale = Math.min(scaleX, scaleY)

    return {
      x: from.x + unitX * (boundaryScale + offset),
      y: from.y + unitY * (boundaryScale + offset),
    }
  }

  private connectorObstacles(
    ignoredIds: Set<string>,
    ignoredGoalKeys = new Set<string>(),
  ): Array<{ id: string; rect: Rect }> {
    const graphObstacles = this.sections
      .filter((section) => this.unlockedSections.has(section.id) && !ignoredIds.has(section.id))
      .map((section) => ({ id: `graph:${section.id}`, rect: this.graphRect(section.id) }))

    const goalObstacles = this.sections.flatMap((section) =>
      section.goals
        .filter((goal) => !ignoredGoalKeys.has(`${section.id}:${goal.id}`))
        .map((goal) => ({
          id: `goal:${section.id}:${goal.id}`,
          rect: this.goalShapeRect(section.id, goal),
        }))
    )

    return [...graphObstacles, ...goalObstacles]
  }

  private segmentObstacleCount(
    start: Point,
    end: Point,
    obstacles: Array<{ id: string; rect: Rect }>,
    inset = 20 * this.layout.worldScale,
  ): number {
    return obstacles.filter(({ rect }) => segmentIntersectsRect(start, end, rect, inset)).length
  }

  private closestBlockingObstacle(
    start: Point,
    end: Point,
    obstacles: Array<{ id: string; rect: Rect }>,
    inset = 20 * this.layout.worldScale,
  ): { id: string; rect: Rect } | null {
    let closest: { id: string; rect: Rect } | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const obstacle of obstacles) {
      if (!segmentIntersectsRect(start, end, obstacle.rect, inset)) {
        continue
      }

      const center = {
        x: obstacle.rect.x + obstacle.rect.width / 2,
        y: obstacle.rect.y + obstacle.rect.height / 2,
      }
      const score = distanceBetween(start, center)

      if (score < bestDistance) {
        bestDistance = score
        closest = obstacle
      }
    }

    return closest
  }

  private detourWaypoints(
    start: Point,
    end: Point,
    rect: Rect,
    obstacles: Array<{ id: string; rect: Rect }>,
  ): Point[] | null {
    const margin = 30 * this.layout.worldScale
    const candidates: Point[][] = [
      [
        { x: start.x, y: rect.y - margin },
        { x: end.x, y: rect.y - margin },
      ],
      [
        { x: start.x, y: rect.y + rect.height + margin },
        { x: end.x, y: rect.y + rect.height + margin },
      ],
      [
        { x: rect.x - margin, y: start.y },
        { x: rect.x - margin, y: end.y },
      ],
      [
        { x: rect.x + rect.width + margin, y: start.y },
        { x: rect.x + rect.width + margin, y: end.y },
      ],
    ]

    let best: Point[] | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
      const path = [start, ...candidate, end]
      let hits = 0
      for (let index = 1; index < path.length; index += 1) {
        hits += this.segmentObstacleCount(path[index - 1], path[index], obstacles, 16 * this.layout.worldScale)
      }
      const score = hits * 100000 + polylineLength(path)

      if (score < bestScore) {
        bestScore = score
        best = candidate
      }
    }

    return best
  }

  private appendAvoidedSegment(
    path: Point[],
    target: Point,
    obstacles: Array<{ id: string; rect: Rect }>,
    depth = 0,
  ): void {
    const start = path[path.length - 1]

    if (distanceBetween(start, target) <= 0.5) {
      return
    }

    if (depth >= 6) {
      path.push(target)
      return
    }

    const blocker = this.closestBlockingObstacle(start, target, obstacles)

    if (!blocker) {
      path.push(target)
      return
    }

    const detour = this.detourWaypoints(start, target, blocker.rect, obstacles)

    if (!detour) {
      path.push(target)
      return
    }

    for (const waypoint of detour) {
      this.appendAvoidedSegment(path, waypoint, obstacles, depth + 1)
    }

    this.appendAvoidedSegment(path, target, obstacles, depth + 1)
  }

  private routedConnectorPoints(
    points: Point[],
    ignoredIds: Set<string>,
    ignoredGoalKeys = new Set<string>(),
  ): Point[] {
    if (points.length <= 1) {
      return points
    }

    const obstacles = this.connectorObstacles(ignoredIds, ignoredGoalKeys)
    const routed: Point[] = [points[0]]

    for (let index = 1; index < points.length; index += 1) {
      this.appendAvoidedSegment(routed, points[index], obstacles)
    }

    return simplifyConnectorPoints(routed)
  }

  private targetConnectionPoints(
    sourcePoint: Point,
    sourceId: string,
    targetId: string,
    ignoredGoalKeys = new Set<string>(),
  ): Point[] {
    const targetPoint = this.graphOutsidePointFrom(targetId, sourceId)
    const routed = this.routedConnectorPoints(
      [sourcePoint, targetPoint],
      new Set<string>([sourceId, targetId]),
      ignoredGoalKeys,
    )
    return simplifyConnectorPoints(routed)
  }

  private goalConnectionPoints(sectionId: string, goal: GoalDefinition): Point[] {
    const route = this.goalRoutePoints(sectionId, goal)
    const targetId = goal.unlocks[0]

    if (!targetId || !this.unlockedSections.has(targetId)) {
      return route
    }

    if (route.length === 0) {
      return route
    }

    const bridge = this.targetConnectionPoints(
      route[route.length - 1],
      sectionId,
      targetId,
      new Set<string>([`${sectionId}:${goal.id}`]),
    )
    return simplifyConnectorPoints([route[0], ...bridge])
  }

  private followAnimatingGoalCamera(sectionId: string, goalId: string | null, progress: number): void {
    if (!goalId) {
      return
    }

    const runtime = this.sectionRuntimes.get(sectionId)
    const from = runtime?.fuseCameraFrom
    const to = runtime?.fuseCameraTo

    if (!runtime || !from || !to) {
      return
    }

    this.cameraTween = null
    const eased = easeInOutCubic(clamp(progress, 0, 1))
    this.camera = this.constrainedCamera({
      x: lerp(from.x, to.x, eased),
      y: lerp(from.y, to.y, eased),
    })
  }

  private dogRect(sectionId: string): Rect | null {
    void sectionId
    return null
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
    runtime.targetFillProgress = 0
    runtime.fuseProgress = 0
    runtime.fuseCameraProgress = 0
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null

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

    if (animated && runtime.animatingGoalId) {
      const goal = section.goals.find((candidate) => candidate.id === runtime.animatingGoalId)
      const targetSectionId = goal?.unlocks[0] ?? null
      runtime.fuseCameraFrom = { ...this.camera }
      runtime.fuseCameraTo = targetSectionId ? this.sectionFocusPoint(targetSectionId) : { ...this.camera }
    }

    runtime.plotProgress = animated ? 0 : 1
    runtime.targetFillProgress = !animated && runtime.animatingGoalId ? 1 : 0
    runtime.fuseProgress = !animated && runtime.animatingGoalId ? 1 : 0
    runtime.fuseCameraProgress = !animated && runtime.animatingGoalId ? 1 : 0
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

    for (const goalId of newGoals) {
      this.completedGoals.add(`${sectionId}:${goalId}`)
    }

    runtime.solvedGoalIds = section.goals
      .filter((goal) => this.completedGoals.has(`${sectionId}:${goal.id}`))
      .map((goal) => goal.id)
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.plotProgress = runtime.plotResult.hasVisiblePath ? 1 : 0
    runtime.targetFillProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.targetFillProgress
    runtime.fuseProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.fuseProgress
    runtime.fuseCameraProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.fuseCameraProgress
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null

    if (runtime.solvedGoalIds.length === section.goals.length && !this.completedSections.has(sectionId)) {
      this.completedSections.add(sectionId)

      if (section.rewardTileId) {
        this.unlockedTiles.add(section.rewardTileId)
        runtime.statusMessage = `tile-${section.rewardTileId}-unlocked`
      } else {
        runtime.statusMessage = `${sectionId}-completed`
      }
    }

    this.statusMessage = runtime.statusMessage
  }

  private unlockSectionsForGoals(sectionId: string, goalIds: string[]): string[] {
    const section = this.sectionById.get(sectionId)

    if (!section || goalIds.length === 0) {
      return []
    }

    const newlyUnlockedSections: string[] = []

    for (const goalId of goalIds) {
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

    return newlyUnlockedSections
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

    if (
      !slot ||
      !this.tileAllowedForSection(this.activeSectionId, tileId) ||
      this.sectionAlreadyUsesTile(this.activeSectionId, tileId)
    ) {
      return
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
        this.layout.worldScale = lerp(this.cameraTween.fromScale, this.cameraTween.toScale, eased)
        this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
        this.camera = {
          x: lerp(this.cameraTween.from.x, this.cameraTween.to.x, eased),
          y: lerp(this.cameraTween.from.y, this.cameraTween.to.y, eased),
        }
        this.camera = this.constrainedCamera(this.camera)

        if (this.cameraTween.progress >= 1) {
          this.layout.worldScale = this.cameraTween.toScale
          this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
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
      this.camera = this.constrainedCamera({
        x: this.camera.x + (this.keyboardVelocity.x * deltaMs) / 1000,
        y: this.camera.y + (this.keyboardVelocity.y * deltaMs) / 1000,
      })
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
        clamp(reveal + deltaMs / SECTION_REVEAL_DURATION_MS, 0, 1),
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

      if (runtime.animatingGoalId && runtime.targetFillProgress < 1) {
        runtime.targetFillProgress = clamp(
          runtime.targetFillProgress + deltaMs / TARGET_FILL_DURATION_MS,
          0,
          1,
        )
        keepGoing = true

        if (runtime.targetFillProgress < 1) {
          continue
        }
        continue
      }

      if (runtime.animatingGoalId && (runtime.fuseProgress < 1 || runtime.fuseCameraProgress < 1)) {
        const goal = section.goals.find((candidate) => candidate.id === runtime.animatingGoalId)
        const route = goal ? this.goalConnectionPoints(section.id, goal) : []
        const durationMs =
          route.length > 1 ? this.connectorDurationMs(section.id, route) : FUSE_DURATION_MS

        if (runtime.fuseProgress < 1) {
          runtime.fuseProgress = clamp(runtime.fuseProgress + deltaMs / durationMs, 0, 1)
        }

        if (runtime.fuseCameraProgress < 1) {
          const cameraDurationMs = durationMs * UNLOCK_CAMERA_DURATION_MULTIPLIER
          runtime.fuseCameraProgress = clamp(
            runtime.fuseCameraProgress + deltaMs / cameraDurationMs,
            0,
            1,
          )
        }

        this.followAnimatingGoalCamera(
          section.id,
          runtime.animatingGoalId,
          runtime.fuseCameraProgress,
        )
        keepGoing = true

        if (runtime.fuseProgress < 1 || runtime.fuseCameraProgress < 1) {
          continue
        }
      }

      if (runtime.animatingGoalId) {
        const newlyUnlockedSections = this.unlockSectionsForGoals(section.id, [runtime.animatingGoalId])
        if (newlyUnlockedSections.length > 0) {
          runtime.statusMessage = `unlock-${newlyUnlockedSections[0]}`
          this.statusMessage = runtime.statusMessage
        }
      }

      runtime.animating = false
      this.finalizeGoals(section.id)
      keepGoing = keepGoing || this.cameraTween !== null
    }

    if (this.petDogTimer > 0) {
      this.petDogTimer = Math.max(0, this.petDogTimer - deltaMs)
      if (this.petDogTimer > 0) {
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

    if (event.pointerType === 'touch') {
      this.activeTouchPoints.set(event.pointerId, point)
      this.canvas.setPointerCapture(event.pointerId)

      if (this.activeTouchPoints.size >= 2) {
        this.beginPinchGesture()
        this.render()
        return
      }
    }

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

    const goalMatch = this.goalAtPoint(point)
    if (goalMatch) {
      const key = this.goalKey(goalMatch.sectionId, goalMatch.goal.id)
      this.pinnedGoalKey = this.pinnedGoalKey === key ? null : key
      this.hoveredGoalKey = key
      this.render()
      return
    }

    for (const section of [...this.unlockedSections].reverse()) {
      const rect = this.dogRect(section)
      if (!rect || !pointInRect(point, rect)) {
        continue
      }

      this.petDogTimer = DOG_PET_MS
      this.statusMessage = `pet-${section}`
      this.ensureAnimation()
      this.render()
      return
    }

    this.cameraTween = null
    const clickedConnectorTargetId = this.connectorTargetAtPoint(point)
    this.drag = {
      kind: 'pan',
      pointerId: event.pointerId,
      current: point,
      start: point,
      cameraStart: { ...this.camera },
      dragging: false,
      startedSectionId: this.sectionAtPoint(point) ?? clickedConnectorTargetId,
    }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const point = this.getPointerPoint(event)

    if (this.activeTouchPoints.has(event.pointerId)) {
      this.activeTouchPoints.set(event.pointerId, point)

      if (this.pinchState) {
        this.updatePinchGesture()
        this.render()
        return
      }
    }

    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      if (this.updateHoveredGoal(point)) {
        this.render()
      }
      return
    }

    this.drag.current = point

    if (this.drag.kind === 'pan') {
      if (!this.drag.dragging && distance(this.drag.start, this.drag.current) > PAN_DRAG_THRESHOLD) {
        this.drag.dragging = true
      }

      if (this.drag.dragging) {
        this.camera = this.constrainedCamera({
          x: this.drag.cameraStart.x - (this.drag.current.x - this.drag.start.x) / this.layout.worldScale,
          y: this.drag.cameraStart.y - (this.drag.current.y - this.drag.start.y) / this.layout.worldScale,
        })
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

  private handlePointerLeave = (): void => {
    if (this.updateHoveredGoal(null)) {
      this.render()
    }
  }

  private handlePointerUp = (event: PointerEvent): void => {
    const point = this.getPointerPoint(event)

    if (this.activeTouchPoints.has(event.pointerId)) {
      this.activeTouchPoints.set(event.pointerId, point)
      this.activeTouchPoints.delete(event.pointerId)

      if (this.pinchState?.pointerIds.includes(event.pointerId)) {
        this.endPinchGesture()
        this.render()
        return
      }
    }

    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      if (this.updateHoveredGoal(point)) {
        this.render()
      }
      return
    }

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
        this.updateHoveredGoal(point)
        this.render()
      }
      return
    }

    if (this.drag.kind === 'tile') {
      const draggedRect = this.draggedTileRect(this.drag)
      const targetSlot = this.nearestOverlappingOpenSlot(this.drag.tileId, draggedRect)

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
    this.updateHoveredGoal(point)
    this.render()
  }

  private handlePointerCancel = (event: PointerEvent): void => {
    if (this.activeTouchPoints.has(event.pointerId)) {
      this.activeTouchPoints.delete(event.pointerId)

      if (this.pinchState?.pointerIds.includes(event.pointerId)) {
        this.endPinchGesture()
        this.render()
        return
      }
    }

    if (this.drag?.kind === 'tile' && this.drag.sourceSlotId) {
      this.activeRuntime.placements[this.drag.sourceSlotId] = this.drag.tileId
      this.updateSectionPlot(this.activeSectionId, false)
    }

    this.drag = null
    this.updateHoveredGoal(null)
    this.render()
  }

  private handleWheel = (event: WheelEvent): void => {
    const delta = this.normalizedWheelDelta(event)
    if (Math.abs(delta.x) < 0.01 && Math.abs(delta.y) < 0.01) {
      return
    }

    event.preventDefault()

    if (event.ctrlKey || event.metaKey) {
      const anchor = this.clientPointToCanvasPoint(event.clientX, event.clientY)
      const factor = Math.exp((-delta.y * WHEEL_ZOOM_SENSITIVITY))
      this.zoomBy(factor, anchor)
      return
    }

    this.cameraTween = null
    this.camera = this.constrainedCamera({
      x: this.camera.x + delta.x / this.layout.worldScale,
      y: this.camera.y + delta.y / this.layout.worldScale,
    })
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

    if (key === 'e' || key === 'q') {
      event.preventDefault()
      this.zoomBy(key === 'e' ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR)
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
    this.activeTouchPoints.clear()
    this.pinchState = null
  }

  private drawBackground(): void {
    const context = this.context
    const { width, height } = this.canvas

    context.clearRect(0, 0, width, height)

    const paper = context.createLinearGradient(0, 0, width, height)
    paper.addColorStop(0, '#fffdf7')
    paper.addColorStop(0.52, CHALKBOARD_MID)
    paper.addColorStop(1, '#efe4d2')
    context.fillStyle = paper
    context.fillRect(0, 0, width, height)

    if (!this.paperPattern) {
      const tile = document.createElement('canvas')
      tile.width = 280
      tile.height = 280
      const tileContext = tile.getContext('2d')

      if (tileContext) {
        tileContext.fillStyle = '#f6efe3'
        tileContext.fillRect(0, 0, tile.width, tile.height)

        for (let index = 0; index < 46; index += 1) {
          const startX = ((hashSeed(`paper-tile-fiber-x:${index}`) % 1000) / 1000) * tile.width
          const startY = ((hashSeed(`paper-tile-fiber-y:${index}`) % 1000) / 1000) * tile.height
          const endX =
            startX +
            (((hashSeed(`paper-tile-fiber-dx:${index}`) % 1000) / 1000) - 0.5) * 68
          const endY =
            startY +
            (((hashSeed(`paper-tile-fiber-dy:${index}`) % 1000) / 1000) - 0.5) * 16
          tileContext.strokeStyle =
            index % 3 === 0 ? 'rgba(112, 95, 72, 0.065)' : 'rgba(255, 255, 255, 0.22)'
          tileContext.lineWidth = 0.8 + ((hashSeed(`paper-tile-fiber-w:${index}`) % 1000) / 1000) * 0.8
          tileContext.lineCap = 'round'
          tileContext.beginPath()
          tileContext.moveTo(startX, startY)
          tileContext.lineTo(endX, endY)
          tileContext.stroke()
        }

        for (let index = 0; index < 260; index += 1) {
          const x = ((hashSeed(`paper-tile-speck-x:${index}`) % 1000) / 1000) * tile.width
          const y = ((hashSeed(`paper-tile-speck-y:${index}`) % 1000) / 1000) * tile.height
          const radius = 0.35 + ((hashSeed(`paper-tile-speck-r:${index}`) % 1000) / 1000) * 1.1
          tileContext.fillStyle =
            index % 4 === 0 ? 'rgba(116, 98, 76, 0.09)' : 'rgba(255, 255, 255, 0.2)'
          tileContext.beginPath()
          tileContext.arc(x, y, radius, 0, Math.PI * 2)
          tileContext.fill()
        }

        this.paperPattern = context.createPattern(tile, 'repeat')
      }
    }

    if (this.paperPattern) {
      context.save()
      context.globalAlpha = 0.72
      context.fillStyle = this.paperPattern
      context.fillRect(0, 0, width, height)
      context.restore()
    }

    for (let index = 0; index < 12; index += 1) {
      const centerX = ((hashSeed(`paper-smudge-x:${index}`) % 1000) / 1000) * width
      const centerY = ((hashSeed(`paper-smudge-y:${index}`) % 1000) / 1000) * height
      const radius =
        Math.max(width, height) * (0.08 + (hashSeed(`paper-smudge-r:${index}`) % 8) / 100)
      const paperGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      paperGlow.addColorStop(0, CHALK_DUST)
      paperGlow.addColorStop(1, 'rgba(120, 101, 79, 0)')
      context.fillStyle = paperGlow
      context.beginPath()
      context.arc(centerX, centerY, radius, 0, Math.PI * 2)
      context.fill()
    }

    this.drawWritingPaperRules()
    this.drawBackgroundDoodles()
  }

  private drawWritingPaperRules(): void {
    const visible = this.visibleWorldRect()
    const spacing = 56
    const startY = Math.floor(visible.y / spacing) * spacing
    const endY = visible.y + visible.height + spacing
    const marginPeriod = 820
    const marginOffset = 128
    const startMarginX = Math.floor((visible.x - marginOffset) / marginPeriod) * marginPeriod + marginOffset
    const endMarginX = visible.x + visible.width + marginPeriod

    this.context.save()
    this.context.strokeStyle = 'rgba(92, 96, 118, 0.075)'
    this.context.lineWidth = Math.max(0.8, this.layout.worldScale * 0.9)

    for (let y = startY; y <= endY; y += spacing) {
      const screenY = this.worldToScreen({ x: visible.x, y }).y
      this.context.beginPath()
      this.context.moveTo(0, screenY)
      this.context.lineTo(this.layout.width, screenY)
      this.context.stroke()
    }

    this.context.strokeStyle = 'rgba(82, 74, 68, 0.11)'
    this.context.setLineDash([6, 8])
    for (let x = startMarginX; x <= endMarginX; x += marginPeriod) {
      const screenX = this.worldToScreen({ x, y: visible.y }).x
      this.context.beginPath()
      this.context.moveTo(screenX, 0)
      this.context.lineTo(screenX, this.layout.height)
      this.context.stroke()
    }
    this.context.restore()
  }

  private backgroundDoodleBounds(center: Point, size: number): Rect {
    return {
      x: center.x - size * 1.05,
      y: center.y - size * 1.05,
      width: size * 2.1,
      height: size * 2.1,
    }
  }

  private canDrawBackgroundRect(rect: Rect, obstacles: Rect[]): boolean {
    return !obstacles.some((obstacle) => rectsIntersect(rect, obstacle, 18))
  }

  private backgroundDoodleZoomProgress(): number {
    return clamp((this.layout.worldScale - 0.22) / 0.78, 0, 1)
  }

  private backgroundSketchStroke(alpha = 0.2): string {
    const zoomProgress = this.backgroundDoodleZoomProgress()
    const scaledAlpha = lerp(alpha * 0.14, alpha, zoomProgress)
    return `rgba(45, 38, 32, ${scaledAlpha})`
  }

  private backgroundSketchWidth(size: number, factor: number): number {
    const zoomProgress = this.backgroundDoodleZoomProgress()
    const minWidth = lerp(0.14, 1, zoomProgress)
    return Math.max(minWidth, size * factor)
  }

  private drawBackgroundLoop(center: Point, size: number, seedKey: string): void {
    this.roughCanvas.circle(
      center.x,
      center.y,
      size,
      seeded(`${seedKey}:loop`, {
        stroke: this.backgroundSketchStroke(0.17),
        strokeWidth: this.backgroundSketchWidth(size, 0.045),
        roughness: 1.35,
        bowing: 1.2,
      }),
    )
  }

  private drawBackgroundStar(center: Point, size: number, seedKey: string): void {
    const points: Point[] = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5
      const radius = index % 2 === 0 ? size * 0.5 : size * 0.22
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      }
    })

    this.roughCanvas.polygon(
      points.map((point) => [point.x, point.y]),
      seeded(`${seedKey}:star`, {
        stroke: this.backgroundSketchStroke(0.16),
        strokeWidth: this.backgroundSketchWidth(size, 0.04),
        roughness: 1.45,
        bowing: 1,
      }),
    )
  }

  private drawBackgroundArrow(center: Point, size: number, seedKey: string): void {
    const points = [
      { x: center.x - size * 0.42, y: center.y + size * 0.2 },
      { x: center.x + size * 0.12, y: center.y - size * 0.18 },
      { x: center.x + size * 0.42, y: center.y - size * 0.18 },
    ]
    this.drawRoughPolyline(points, `${seedKey}:arrow:shaft`, {
      stroke: this.backgroundSketchStroke(0.16),
      strokeWidth: this.backgroundSketchWidth(size, 0.05),
      roughness: 1.45,
      bowing: 1.2,
    })
    this.drawRoughPolyline(
      [
        { x: center.x + size * 0.42, y: center.y - size * 0.18 },
        { x: center.x + size * 0.25, y: center.y - size * 0.32 },
      ],
      `${seedKey}:arrow:tip-a`,
      {
        stroke: this.backgroundSketchStroke(0.16),
        strokeWidth: this.backgroundSketchWidth(size, 0.05),
        roughness: 1.45,
        bowing: 1.15,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x + size * 0.42, y: center.y - size * 0.18 },
        { x: center.x + size * 0.27, y: center.y - size * 0.02 },
      ],
      `${seedKey}:arrow:tip-b`,
      {
        stroke: this.backgroundSketchStroke(0.16),
        strokeWidth: this.backgroundSketchWidth(size, 0.05),
        roughness: 1.45,
        bowing: 1.15,
      },
    )
  }

  private drawBackgroundSmiley(center: Point, size: number, seedKey: string): void {
    this.roughCanvas.circle(
      center.x,
      center.y,
      size,
      seeded(`${seedKey}:face`, {
        stroke: this.backgroundSketchStroke(0.16),
        strokeWidth: this.backgroundSketchWidth(size, 0.05),
        roughness: 1.3,
        bowing: 1.1,
      }),
    )

    this.context.save()
    this.context.fillStyle = this.backgroundSketchStroke(0.16)
    this.context.beginPath()
    this.context.arc(center.x - size * 0.16, center.y - size * 0.1, size * 0.03, 0, Math.PI * 2)
    this.context.arc(center.x + size * 0.16, center.y - size * 0.1, size * 0.03, 0, Math.PI * 2)
    this.context.fill()
    this.context.strokeStyle = this.backgroundSketchStroke(0.16)
    this.context.lineWidth = this.backgroundSketchWidth(size, 0.045)
    this.context.lineCap = 'round'
    this.context.beginPath()
    this.context.arc(center.x, center.y + size * 0.02, size * 0.23, 0.2, Math.PI - 0.2)
    this.context.stroke()
    this.context.restore()
  }

  private drawBackgroundSpiral(center: Point, size: number, seedKey: string): void {
    const points = Array.from({ length: 26 }, (_, index) => {
      const t = index / 25
      const angle = t * Math.PI * 3.2
      const radius = size * (0.08 + t * 0.42)
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      }
    })

    this.drawRoughPolyline(points, `${seedKey}:spiral`, {
      stroke: this.backgroundSketchStroke(0.15),
      strokeWidth: this.backgroundSketchWidth(size, 0.04),
      roughness: 1.55,
      bowing: 1.4,
    })
  }

  private drawBackgroundSquiggle(center: Point, size: number, seedKey: string): void {
    const points = Array.from({ length: 8 }, (_, index) => ({
      x: center.x + (index - 3.5) * (size * 0.12),
      y: center.y + Math.sin(index * 0.95) * size * 0.18,
    }))

    this.drawRoughPolyline(points, `${seedKey}:squiggle`, {
      stroke: this.backgroundSketchStroke(0.14),
      strokeWidth: this.backgroundSketchWidth(size, 0.04),
      roughness: 1.65,
      bowing: 1.7,
    })
  }

  private drawBackgroundTickMark(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.28, y: center.y + size * 0.08 },
        { x: center.x - size * 0.05, y: center.y + size * 0.28 },
        { x: center.x + size * 0.3, y: center.y - size * 0.26 },
      ],
      `${seedKey}:tick`,
      {
        stroke: this.backgroundSketchStroke(0.12),
        strokeWidth: this.backgroundSketchWidth(size, 0.05),
        roughness: 1.45,
        bowing: 1.2,
      },
    )
  }

  private drawBackgroundCross(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.24, y: center.y - size * 0.24 },
        { x: center.x + size * 0.24, y: center.y + size * 0.24 },
      ],
      `${seedKey}:cross-a`,
      {
        stroke: this.backgroundSketchStroke(0.11),
        strokeWidth: this.backgroundSketchWidth(size, 0.04),
        roughness: 1.4,
        bowing: 1.1,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x + size * 0.24, y: center.y - size * 0.24 },
        { x: center.x - size * 0.24, y: center.y + size * 0.24 },
      ],
      `${seedKey}:cross-b`,
      {
        stroke: this.backgroundSketchStroke(0.11),
        strokeWidth: this.backgroundSketchWidth(size, 0.04),
        roughness: 1.4,
        bowing: 1.1,
      },
    )
  }

  private drawBackgroundUnderline(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.34, y: center.y + size * 0.04 },
        { x: center.x + size * 0.34, y: center.y - size * 0.02 },
      ],
      `${seedKey}:underline`,
      {
        stroke: this.backgroundSketchStroke(0.11),
        strokeWidth: this.backgroundSketchWidth(size, 0.035),
        roughness: 1.55,
        bowing: 1.35,
      },
    )
  }

  private drawBackgroundFlower(center: Point, size: number, seedKey: string): void {
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = -Math.PI / 2 + (petal * Math.PI * 2) / 5
      this.roughCanvas.ellipse(
        center.x + Math.cos(angle) * size * 0.24,
        center.y + Math.sin(angle) * size * 0.24,
        size * 0.34,
        size * 0.22,
        seeded(`${seedKey}:flower:petal:${petal}`, {
          stroke: this.backgroundSketchStroke(0.15),
          strokeWidth: this.backgroundSketchWidth(size, 0.036),
          roughness: 1.35,
          bowing: 1.1,
        }),
      )
    }

    this.roughCanvas.circle(
      center.x,
      center.y,
      size * 0.18,
      seeded(`${seedKey}:flower:center`, {
        stroke: this.backgroundSketchStroke(0.16),
        strokeWidth: this.backgroundSketchWidth(size, 0.04),
        roughness: 1.25,
        bowing: 1,
      }),
    )

    this.drawRoughPolyline(
      [
        { x: center.x, y: center.y + size * 0.18 },
        { x: center.x - size * 0.06, y: center.y + size * 0.44 },
        { x: center.x + size * 0.02, y: center.y + size * 0.8 },
      ],
      `${seedKey}:flower:stem`,
      {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.035),
        roughness: 1.5,
        bowing: 1.3,
      },
    )
  }

  private drawBackgroundCloud(center: Point, size: number, seedKey: string): void {
    const points = [
      { x: center.x - size * 0.46, y: center.y + size * 0.08 },
      { x: center.x - size * 0.34, y: center.y - size * 0.1 },
      { x: center.x - size * 0.12, y: center.y - size * 0.2 },
      { x: center.x + size * 0.08, y: center.y - size * 0.08 },
      { x: center.x + size * 0.24, y: center.y - size * 0.18 },
      { x: center.x + size * 0.44, y: center.y + size * 0.02 },
      { x: center.x + size * 0.28, y: center.y + size * 0.18 },
      { x: center.x - size * 0.06, y: center.y + size * 0.2 },
      { x: center.x - size * 0.32, y: center.y + size * 0.16 },
    ]

    this.roughCanvas.curve(
      points.map((point) => [point.x, point.y]),
      seeded(`${seedKey}:cloud`, {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.036),
        roughness: 1.35,
        bowing: 1.15,
        curveTightness: 0.2,
      }),
    )
  }

  private drawBackgroundKite(center: Point, size: number, seedKey: string): void {
    this.roughCanvas.polygon(
      [
        [center.x, center.y - size * 0.42],
        [center.x + size * 0.28, center.y],
        [center.x, center.y + size * 0.38],
        [center.x - size * 0.28, center.y],
      ],
      seeded(`${seedKey}:kite:body`, {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.038),
        roughness: 1.35,
        bowing: 1,
      }),
    )

    this.drawRoughPolyline(
      [
        { x: center.x, y: center.y + size * 0.38 },
        { x: center.x + size * 0.12, y: center.y + size * 0.58 },
        { x: center.x - size * 0.08, y: center.y + size * 0.76 },
        { x: center.x + size * 0.1, y: center.y + size * 0.96 },
      ],
      `${seedKey}:kite:string`,
      {
        stroke: this.backgroundSketchStroke(0.13),
        strokeWidth: this.backgroundSketchWidth(size, 0.03),
        roughness: 1.6,
        bowing: 1.35,
      },
    )
  }

  private drawBackgroundLeaf(center: Point, size: number, seedKey: string): void {
    const points = [
      { x: center.x - size * 0.04, y: center.y + size * 0.44 },
      { x: center.x - size * 0.34, y: center.y + size * 0.08 },
      { x: center.x - size * 0.1, y: center.y - size * 0.38 },
      { x: center.x + size * 0.3, y: center.y - size * 0.02 },
      { x: center.x + size * 0.04, y: center.y + size * 0.44 },
    ]
    this.roughCanvas.curve(
      points.map((point) => [point.x, point.y]),
      seeded(`${seedKey}:leaf`, {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.034),
        roughness: 1.3,
        bowing: 1.15,
      }),
    )
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.02, y: center.y + size * 0.38 },
        { x: center.x + size * 0.02, y: center.y + size * 0.02 },
        { x: center.x + size * 0.12, y: center.y - size * 0.26 },
      ],
      `${seedKey}:leaf:vein`,
      {
        stroke: this.backgroundSketchStroke(0.12),
        strokeWidth: this.backgroundSketchWidth(size, 0.028),
        roughness: 1.45,
        bowing: 1.2,
      },
    )
  }

  private drawBackgroundBoat(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.42, y: center.y + size * 0.16 },
        { x: center.x - size * 0.22, y: center.y + size * 0.32 },
        { x: center.x + size * 0.28, y: center.y + size * 0.28 },
        { x: center.x + size * 0.42, y: center.y + size * 0.08 },
      ],
      `${seedKey}:boat:hull`,
      {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.04),
        roughness: 1.4,
        bowing: 1.1,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.02, y: center.y + size * 0.24 },
        { x: center.x - size * 0.02, y: center.y - size * 0.34 },
        { x: center.x + size * 0.26, y: center.y - size * 0.04 },
      ],
      `${seedKey}:boat:mast`,
      {
        stroke: this.backgroundSketchStroke(0.13),
        strokeWidth: this.backgroundSketchWidth(size, 0.034),
        roughness: 1.45,
        bowing: 1.2,
      },
    )
  }

  private drawBackgroundGlyph(kind: string, center: Point, size: number, seedKey: string): void {
    if (kind === 'loop') {
      this.drawBackgroundLoop(center, size, seedKey)
      return
    }
    if (kind === 'star') {
      this.drawBackgroundStar(center, size, seedKey)
      return
    }
    if (kind === 'arrow') {
      this.drawBackgroundArrow(center, size, seedKey)
      return
    }
    if (kind === 'smiley') {
      this.drawBackgroundSmiley(center, size, seedKey)
      return
    }
    if (kind === 'spiral') {
      this.drawBackgroundSpiral(center, size, seedKey)
      return
    }
    if (kind === 'squiggle') {
      this.drawBackgroundSquiggle(center, size, seedKey)
      return
    }
    if (kind === 'tick') {
      this.drawBackgroundTickMark(center, size, seedKey)
      return
    }
    if (kind === 'cross') {
      this.drawBackgroundCross(center, size, seedKey)
      return
    }
    if (kind === 'flower') {
      this.drawBackgroundFlower(center, size, seedKey)
      return
    }
    if (kind === 'cloud') {
      this.drawBackgroundCloud(center, size, seedKey)
      return
    }
    if (kind === 'kite') {
      this.drawBackgroundKite(center, size, seedKey)
      return
    }
    if (kind === 'leaf') {
      this.drawBackgroundLeaf(center, size, seedKey)
      return
    }
    if (kind === 'boat') {
      this.drawBackgroundBoat(center, size, seedKey)
      return
    }

    this.drawBackgroundUnderline(center, size, seedKey)
  }

  private drawBackgroundDoodles(): void {
    const visible = this.visibleWorldRect()
    const obstacles = this.backgroundObstacleRects()
    const artCell = 276
    const doodleCell = 166
    const markCell = 114
    const artKinds = ['flower', 'cloud', 'kite', 'leaf', 'boat'] as const
    const doodleKinds = ['arrow', 'smiley', 'spiral', 'squiggle', 'flower'] as const
    const markKinds = ['tick', 'underline', 'squiggle'] as const

    const drawCandidates = (
      cell: number,
      chanceThreshold: number,
      sizeMin: number,
      sizeRange: number,
      kinds: readonly string[],
      prefix: string,
    ): void => {
      const startX = Math.floor(visible.x / cell) * cell
      const endX = visible.x + visible.width + cell
      const startY = Math.floor(visible.y / cell) * cell
      const endY = visible.y + visible.height + cell

      for (let x = startX; x <= endX; x += cell) {
        for (let y = startY; y <= endY; y += cell) {
          const key = `${prefix}:${x}:${y}`
          const chance = (hashSeed(`${key}:chance`) % 1000) / 1000
          if (chance > chanceThreshold) {
            continue
          }

          const center = {
            x: x + cell * (0.18 + ((hashSeed(`${key}:offset-x`) % 1000) / 1000) * 0.64),
            y: y + cell * (0.18 + ((hashSeed(`${key}:offset-y`) % 1000) / 1000) * 0.64),
          }
          const size = sizeMin + ((hashSeed(`${key}:size`) % 1000) / 1000) * sizeRange
          const bounds = this.backgroundDoodleBounds(center, size)

          if (!this.canDrawBackgroundRect(bounds, obstacles)) {
            continue
          }

          const kind = kinds[hashSeed(`${key}:kind`) % kinds.length]
          const screenCenter = this.worldToScreen(center)
          this.drawBackgroundGlyph(kind, screenCenter, size * this.layout.worldScale, key)
        }
      }
    }

    drawCandidates(artCell, 0.27, 40, 34, artKinds, 'bg-art')
    drawCandidates(doodleCell, 0.3, 28, 24, doodleKinds, 'bg-doodle')
    drawCandidates(markCell, 0.46, 14, 16, markKinds, 'bg-mark')
  }

  private drawTerrainTexture(rect: Rect, seedKey: string): void {
    void rect
    void seedKey
  }

  private drawSketchProgressLine(
    points: Point[],
    progress: number,
    seedKey: string,
    options: Record<string, unknown>,
  ): void {
    const visible = progress >= 1 ? points : partialPolyline(points, progress)
    if (visible.length < 2) {
      return
    }

    this.drawRoughPolyline(visible, seedKey, options)
  }

  private connectorRenderedPoints(points: Point[]): Point[] {
    return [...points]
  }

  private plotPixelsPerMs(sectionId: string): number | null {
    const runtime = this.sectionRuntimes.get(sectionId)
    const plotPoints = runtime?.plotResult?.points

    if (!plotPoints || plotPoints.length < 2) {
      return null
    }

    const screenPoints = plotPoints.map((point) => this.graphPointToScreen(sectionId, point))
    const length = polylineLength(screenPoints)

    if (length <= 0) {
      return null
    }

    return length / PLOT_DURATION_MS
  }

  private connectorDurationMs(sectionId: string, points: Point[]): number {
    const rendered = this.connectorRenderedPoints(points)
    const length = Math.max(polylineLength(rendered), 1)
    const plotSpeed = this.plotPixelsPerMs(sectionId)

    if (!plotSpeed || plotSpeed <= 0) {
      return FUSE_DURATION_MS
    }

    return length / plotSpeed
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
    void sectionId
  }

  private drawDog(sectionId: string): void {
    void this.dogRect(sectionId)
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
    const treeSets: Record<string, Array<{ x: number; y: number; size: number }>> = {}

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
    > = {}

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
    const rendered = this.connectorRenderedPoints(points)
    const visible = progress >= 1 ? rendered : partialPolyline(rendered, progress)

    if (visible.length < 2) {
      return
    }

    const dashColor = mixColors(color, CHALKBOARD_MID, 0.46, 0.88)
    const width = 7.6 * this.layout.worldScale
    const dashSegments = dashedPolylineSegments(
      visible,
      24 * this.layout.worldScale,
      18 * this.layout.worldScale,
    )

    this.context.save()
    this.context.strokeStyle = mixColors(color, CHALKBOARD_MID, 0.58, 0.3)
    this.context.lineWidth = width + 2.2 * this.layout.worldScale
    this.context.lineCap = 'round'
    this.context.lineJoin = 'round'
    this.context.setLineDash([24 * this.layout.worldScale, 18 * this.layout.worldScale])
    this.context.beginPath()
    tracePolylinePath(this.context, visible)
    this.context.stroke()
    this.context.restore()

    dashSegments.forEach((segment, index) => {
      this.drawRoughPolyline(segment, `unlock-path:${color}:${index}`, {
        stroke: dashColor,
        strokeWidth: Math.max(3.2, width),
        roughness: 1.08,
        bowing: 0.82,
      })
    })
  }

  private drawWorldLinksBase(): void {
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
        const route = this.goalConnectionPoints(section.id, goal)
        const isAnimatingGoal = runtime.animatingGoalId === goal.id
        const fuseProgress = solved ? 1 : isAnimatingGoal ? runtime.fuseProgress : 0

        if (route.length > 1 && fuseProgress > 0) {
          this.drawLitPath(route, fuseProgress, this.goalColor(section.id, goal))
        }
      }
    }
  }

  private drawGoalShape(
    sectionId: string,
    goal: GoalDefinition,
    progress = 1,
    fillProgress = 0,
    colorOverride?: string,
  ): void {
    const color = colorOverride ?? this.goalColor(sectionId, goal)
    const center = this.goalShapeCenter(sectionId, goal)
    const size = 18 * this.layout.worldScale
    const alpha = clamp(progress, 0, 1)
    const fillAlpha = clamp(fillProgress, 0, 1)
    const fillColor = mixColors(color, color, 0, 0.28 + fillAlpha * 0.24)
    const fillOptions =
      fillAlpha > 0.001
        ? {
            fill: fillColor,
            fillStyle: 'cross-hatch',
            hachureGap: Math.max(3, size * 0.14),
            fillWeight: Math.max(1.1, size * 0.05),
          }
        : {}

    this.context.save()
    this.context.globalAlpha = alpha

    const polygonShape = (
      key: string,
      points: Point[],
      roughness = 1.12,
      bowing = 0.95,
    ): void => {
      this.roughCanvas.polygon(
        points.map((point) => [point.x, point.y]),
        seeded(key, {
          stroke: color,
          strokeWidth: Math.max(2.2, this.layout.worldScale * 2.15),
          roughness,
          bowing,
          ...fillOptions,
        }),
      )
    }

    if (goal.shape === 'circle') {
      this.roughCanvas.circle(
        center.x,
        center.y,
        size * 1.75,
        seeded(`goal-shape:${sectionId}:${goal.id}`, {
          stroke: color,
          strokeWidth: Math.max(2.2, this.layout.worldScale * 2.15),
          roughness: 1.1,
          bowing: 1.1,
          ...fillOptions,
        }),
      )
      this.context.restore()
      return
    }

    if (goal.shape === 'triangle') {
      polygonShape(`goal-shape:${sectionId}:${goal.id}`, [
        { x: center.x, y: center.y - size * 0.95 },
        { x: center.x + size * 0.92, y: center.y + size * 0.76 },
        { x: center.x - size * 0.92, y: center.y + size * 0.76 },
      ])
      this.context.restore()
      return
    }

    if (goal.shape === 'square') {
      polygonShape(`goal-shape:${sectionId}:${goal.id}`, [
        { x: center.x - size * 0.85, y: center.y - size * 0.85 },
        { x: center.x + size * 0.85, y: center.y - size * 0.85 },
        { x: center.x + size * 0.85, y: center.y + size * 0.85 },
        { x: center.x - size * 0.85, y: center.y + size * 0.85 },
      ])
      this.context.restore()
      return
    }

    if (goal.shape === 'diamond') {
      polygonShape(`goal-shape:${sectionId}:${goal.id}`, [
        { x: center.x, y: center.y - size * 1.04 },
        { x: center.x + size * 0.86, y: center.y },
        { x: center.x, y: center.y + size * 1.04 },
        { x: center.x - size * 0.86, y: center.y },
      ])
      this.context.restore()
      return
    }

    if (goal.shape === 'hexagon') {
      const points: Point[] = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 6 + (index * Math.PI) / 3
        return {
          x: center.x + Math.cos(angle) * size * 0.92,
          y: center.y + Math.sin(angle) * size * 0.92,
        }
      })
      polygonShape(`goal-shape:${sectionId}:${goal.id}`, points)
      this.context.restore()
      return
    }

    if (goal.shape === 'clover') {
      const petals: Point[] = [
        { x: center.x, y: center.y - size * 0.4 },
        { x: center.x + size * 0.4, y: center.y },
        { x: center.x, y: center.y + size * 0.4 },
        { x: center.x - size * 0.4, y: center.y },
      ]
      for (const [index, petal] of petals.entries()) {
        this.roughCanvas.circle(
          petal.x,
          petal.y,
          size * 0.95,
          seeded(`goal-shape:${sectionId}:${goal.id}:petal:${index}`, {
            stroke: color,
            strokeWidth: Math.max(2.2, this.layout.worldScale * 2.15),
            roughness: 1.08,
            bowing: 1,
            ...fillOptions,
          }),
        )
      }
      this.context.restore()
      return
    }

    if (goal.shape === 'x') {
      if (fillAlpha > 0.001) {
        this.roughCanvas.circle(
          center.x,
          center.y,
          size * 1.15,
          seeded(`goal-shape:${sectionId}:${goal.id}:fill`, {
            stroke: 'transparent',
            fill: fillColor,
            fillStyle: 'hachure',
            hachureGap: Math.max(4, size * 0.16),
            fillWeight: Math.max(0.9, size * 0.04),
            roughness: 1.05,
            bowing: 0.9,
          }),
        )
      }
      this.drawRoughPolyline(
        [
          { x: center.x - size * 0.6, y: center.y - size * 0.6 },
          { x: center.x + size * 0.6, y: center.y + size * 0.6 },
        ],
        `goal-shape:${sectionId}:${goal.id}:a`,
        {
          stroke: color,
          strokeWidth: Math.max(2.2, this.layout.worldScale * 2.15),
          roughness: 1.1,
          bowing: 0.9,
        },
      )
      this.drawRoughPolyline(
        [
          { x: center.x + size * 0.6, y: center.y - size * 0.6 },
          { x: center.x - size * 0.6, y: center.y + size * 0.6 },
        ],
        `goal-shape:${sectionId}:${goal.id}:b`,
        {
          stroke: color,
          strokeWidth: Math.max(2.2, this.layout.worldScale * 2.15),
          roughness: 1.1,
          bowing: 0.9,
        },
      )
      this.context.restore()
      return
    }

    if (goal.shape === 'star') {
      const points: Point[] = Array.from({ length: 10 }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI) / 5
        const radius = index % 2 === 0 ? size * 0.95 : size * 0.42
        return {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        }
      })
      polygonShape(`goal-shape:${sectionId}:${goal.id}`, points, 1.15, 0.95)
      this.context.restore()
      return
    }

    const heartPoints: Point[] = Array.from({ length: 24 }, (_, index) => {
      const t = (index / 23) * Math.PI * 2
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
    polygonShape(`goal-shape:${sectionId}:${goal.id}`, heartPoints, 1.1, 1)

    this.context.restore()
  }

  private goalGlowAlpha(): number {
    if (this.zoomLevel > GOAL_GLOW_ZOOM_THRESHOLD) {
      return 0
    }

    const progress = 1 - clamp(this.zoomLevel / GOAL_GLOW_ZOOM_THRESHOLD, 0, 1)
    return lerp(GOAL_GLOW_MIN_ALPHA, GOAL_GLOW_MAX_ALPHA, progress)
  }

  private lockedGoalAlpha(): number {
    if (this.zoomLevel >= LOCKED_GOAL_ZOOM_THRESHOLD) {
      return LOCKED_GOAL_MAX_ALPHA
    }

    const progress = clamp(this.zoomLevel / LOCKED_GOAL_ZOOM_THRESHOLD, 0, 1)
    return lerp(LOCKED_GOAL_MIN_ALPHA, LOCKED_GOAL_MAX_ALPHA, progress)
  }

  private solvedGoalColor(color: string): string {
    return mixColors(color, CHALKBOARD_MID, SOLVED_GOAL_LIGHTEN, 0.92)
  }

  private drawGoalGlow(sectionId: string, goal: GoalDefinition, color: string): void {
    const alpha = this.goalGlowAlpha()

    if (alpha <= 0.001) {
      return
    }

    const center = this.goalShapeCenter(sectionId, goal)
    const baseSize = Math.max(18 * this.layout.worldScale, 8)
    const radius = baseSize * 1.45

    this.context.save()
    this.context.globalAlpha = alpha
    this.context.strokeStyle = mixColors(color, CHALKBOARD_MID, 0.18, alpha * 0.95)
    this.context.fillStyle = mixColors(color, CHALKBOARD_MID, 0.1, alpha * 0.22)
    this.context.shadowColor = mixColors(color, '#ffffff', 0.06, alpha)
    this.context.shadowBlur = radius * 1.9
    this.context.beginPath()
    this.context.arc(center.x, center.y, radius, 0, Math.PI * 2)
    this.context.fill()
    this.context.stroke()
    this.context.restore()
  }

  private drawEquationSlotPlaceholder(
    rect: Rect,
    state: 'normal' | 'compatible' | 'disabled',
    seedKey: string,
  ): void {
    void seedKey

    const radius = rect.width * 0.22

    this.context.save()
    this.context.strokeStyle =
      state === 'disabled' ? 'rgba(45, 38, 32, 0.25)' : state === 'compatible' ? INK : 'rgba(45, 38, 32, 0.72)'
    this.context.lineWidth =
      state === 'compatible'
        ? Math.max(1.45, this.layout.worldScale * 1.7)
        : Math.max(1.2, this.layout.worldScale * 1.35)
    this.context.setLineDash([6 * this.layout.worldScale, 4 * this.layout.worldScale])
    if (state === 'disabled') {
      fillRoundedRect(this.context, rect, radius, 'rgba(45, 38, 32, 0.06)')
    }
    roundRectPath(this.context, rect, radius)
    this.context.stroke()
    this.context.restore()
  }

  private drawTile(rect: Rect, tile: TileDefinition, active: boolean, seedKey: string): void {
    const context = this.context
    const radius = rect.width * 0.22

    context.save()
    context.shadowColor = SHADOW
    context.shadowBlur = active ? 14 : 8
    context.shadowOffsetY = active ? 6 : 3
    fillRoundedRect(context, rect, radius, 'rgba(255,255,255,0.04)')
    context.restore()

    this.drawRoughRoundedRect(rect, radius, `tile:${seedKey}`, {
      stroke: active ? GOAL : 'rgba(85, 72, 57, 0.55)',
      strokeWidth: 1.6,
      fill: tile.fill,
      fillStyle: 'cross-hatch',
      hachureGap: Math.max(4, rect.width * 0.11),
      fillWeight: Math.max(0.75, rect.width * 0.02),
      roughness: 1.05,
      bowing: 0.8,
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
          stroke: GOAL,
          strokeWidth: 1.3,
          roughness: 0.9,
          bowing: 0.65,
        },
      )
    }

    context.save()
    context.fillStyle = INK
    context.font = `${Math.round(rect.height * 0.46)}px 'Short Stack', cursive`
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
    const reveal = easeOutCubic(this.sectionReveal(sectionId))
    const yAxisReveal = this.sectionRevealPhase(sectionId, 0.02, 0.34)
    const xAxisReveal = this.sectionRevealPhase(sectionId, 0.12, 0.46)
    const tickReveal = this.sectionRevealPhase(sectionId, 0.28, 0.72)
    const goalReveal = this.sectionRevealPhase(sectionId, 0.44, 0.82)
    const equationReveal = this.sectionRevealPhase(sectionId, 0.56, 0.9)

    if (reveal <= 0.001) {
      return
    }

    void terrain
    this.drawTerrainTexture(terrain, `terrain:${sectionId}`)
    this.drawSectionDecorations(sectionId)

    const yAxisX =
      axes.x.min <= 0 && axes.x.max >= 0 ? this.graphValueToScreenX(sectionId, 0) : graph.x
    const xAxisY =
      axes.y.min <= 0 && axes.y.max >= 0
        ? this.graphValueToScreenY(sectionId, 0)
        : graph.y + graph.height

    this.drawSketchProgressLine(
      [
        { x: graph.x, y: xAxisY },
        { x: graph.x + graph.width, y: xAxisY },
      ],
      xAxisReveal,
      `axis:${sectionId}:x`,
      {
        stroke: AXIS,
        strokeWidth: 2.3 * scale,
        roughness: 0.8,
        bowing: 0.45,
      },
    )
    this.drawSketchProgressLine(
      [
        { x: yAxisX, y: graph.y + graph.height },
        { x: yAxisX, y: graph.y },
      ],
      yAxisReveal,
      `axis:${sectionId}:y`,
      {
        stroke: AXIS,
        strokeWidth: 2.3 * scale,
        roughness: 0.8,
        bowing: 0.45,
      },
    )

    const xTicks = axisTicks(axes.x)
    for (const [index, tick] of xTicks.entries()) {
      if (tickReveal <= index / Math.max(1, xTicks.length)) {
        continue
      }
      const x = this.graphValueToScreenX(sectionId, tick)
      const tickSize =
        (isMajorTick(tick, axes.x) ? MAJOR_TICK_SIZE : MINOR_TICK_SIZE) * this.layout.worldScale
      this.roughCanvas.line(
        x,
        xAxisY - tickSize / 2,
        x,
        xAxisY + tickSize / 2,
        seeded(`tick:${sectionId}:x:${tick}`, {
          stroke: AXIS,
          strokeWidth: Math.max(1.2, TICK_STROKE_WIDTH * this.layout.worldScale),
          roughness: 0.7,
          bowing: 0.4,
        }),
      )
    }

    const yTicks = axisTicks(axes.y)
    for (const [index, tick] of yTicks.entries()) {
      if (tickReveal <= index / Math.max(1, yTicks.length)) {
        continue
      }
      const y = this.graphValueToScreenY(sectionId, tick)
      const tickSize =
        (isMajorTick(tick, axes.y) ? MAJOR_TICK_SIZE : MINOR_TICK_SIZE) * this.layout.worldScale
      this.roughCanvas.line(
        yAxisX - tickSize / 2,
        y,
        yAxisX + tickSize / 2,
        y,
        seeded(`tick:${sectionId}:y:${tick}`, {
          stroke: AXIS,
          strokeWidth: Math.max(1.2, TICK_STROKE_WIDTH * this.layout.worldScale),
          roughness: 0.7,
          bowing: 0.4,
        }),
      )
    }

    const inspectedGoal = this.inspectedGoalForSection(sectionId)
    if (inspectedGoal) {
      this.drawGoalAxisGuides(sectionId, inspectedGoal, xAxisY, yAxisX, scale)
    }

    if (runtime.plotResult && runtime.plotResult.points.length > 1) {
      const progress = runtime.animating ? runtime.plotProgress : 1
      const plotPoints = runtime.plotResult.points.map((point) => this.graphPointToScreen(sectionId, point))
      const visiblePoints = partialPolyline(plotPoints, progress)

      if (visiblePoints.length > 1) {
        this.context.save()
        this.context.strokeStyle = PLOT_GLOW
        this.context.lineWidth = 5.4 * scale
        this.context.lineCap = 'round'
        this.context.lineJoin = 'round'
        this.context.beginPath()
        traceSmoothPath(this.context, visiblePoints)
        this.context.stroke()

        this.context.strokeStyle = INK
        this.context.globalAlpha = 0.95
        this.context.lineWidth = 3.6 * scale
        this.context.beginPath()
        traceSmoothPath(this.context, visiblePoints)
        this.context.stroke()
        this.context.restore()
      }
    }

    void goalReveal

    const tokenLayouts = this.tokenLayouts(sectionId)
    const prefixX =
      tokenLayouts.length > 0
        ? tokenLayouts[0].rect.x - this.equationPrefixWidth(sectionId, scale) + 2 * scale
        : this.layout.width * 0.32
    const equationY = this.equationCenterY(sectionId)
    const activeTileId =
      this.drag?.kind === 'tile' ? this.drag.tileId : this.selectedTileId
    const compatibleSlotIds = activeTileId
      ? this.compatibleSlotsForSection(sectionId, activeTileId as TileId)
      : []

    this.context.save()
    this.context.globalAlpha = equationReveal
    this.context.fillStyle = INK
    this.context.font = `${Math.round(EQUATION_FONT_SIZE * this.layout.worldScale)}px 'Short Stack', cursive`
    this.context.textBaseline = 'middle'
    if (!this.usesCustomEquationDisplay(sectionId)) {
      this.context.fillText(`${this.equationPrefix(sectionId)} =`, prefixX, equationY)
    }

    for (const token of tokenLayouts) {
      if (token.part.type === 'fixed') {
        const fontSize = Math.round(EQUATION_FONT_SIZE * this.layout.worldScale)
        this.context.font = `${fontSize}px 'Short Stack', cursive`
        this.context.fillText(
          token.part.value,
          token.rect.x + token.rect.width / 2 - token.rect.width * 0.18,
          token.rect.y + token.rect.height / 2,
        )
        continue
      }

      const placedTileId = runtime.placements[token.part.slotId]
      const slotState: 'normal' | 'compatible' | 'disabled' =
        placedTileId
          ? 'normal'
          : !activeTileId
            ? 'normal'
            : compatibleSlotIds.includes(token.part.slotId)
              ? 'compatible'
              : 'disabled'

      if (placedTileId) {
        this.drawTile(
          {
            x: token.rect.x + 1,
            y: token.rect.y + 2,
            width: token.rect.width - 2,
            height: token.rect.height - 4,
          },
          TILE_DEFINITIONS[placedTileId],
          false,
          `slot:${sectionId}:${token.part.slotId}`,
        )
        continue
      }

      this.drawEquationSlotPlaceholder(
        token.rect,
        slotState,
        `slot:${sectionId}:${token.part.slotId}`,
      )
    }
    this.context.restore()
  }

  private drawWorldLinksOverlay(): void {
    for (const section of this.sections) {
      const unlocked = this.unlockedSections.has(section.id)
      const runtime = this.sectionRuntimes.get(section.id)

      for (const goal of section.goals) {
        const solved = this.completedGoals.has(`${section.id}:${goal.id}`)
        const isAnimatingGoal = runtime?.animatingGoalId === goal.id
        const fillProgress = solved ? 1 : isAnimatingGoal ? (runtime?.targetFillProgress ?? 0) : 0
        const baseColor = this.goalColor(section.id, goal)
        const color = unlocked
          ? solved
            ? this.solvedGoalColor(baseColor)
            : baseColor
          : `rgba(45, 38, 32, ${this.lockedGoalAlpha()})`
        const alpha = unlocked && solved ? SOLVED_GOAL_ALPHA : 1

        if (unlocked && !solved && fillProgress < 0.999) {
          this.drawGoalGlow(section.id, goal, color)
        }

        this.drawGoalShape(
          section.id,
          goal,
          alpha,
          fillProgress,
          color,
        )
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
    this.syncSelectedSectionToCenter()
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
    this.syncSelectedSectionToCenter()
    const activeLevel = (this.sectionIndexById.get(this.activeSectionId) ?? 0) + 1
    const sections = this.sections
      .filter((section) => this.unlockedSections.has(section.id))
      .map((section) => {
        const runtime = this.sectionRuntimes.get(section.id)
        const axes = this.sectionAxes(section.id)
        const terrain = this.terrainWorldRect(section.id)
        const graph = this.graphWorldRect(section.id)
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
            width: Number(terrain.width.toFixed(1)),
            height: Number(terrain.height.toFixed(1)),
          },
          graphFrame: {
            width: Number(graph.width.toFixed(1)),
            height: Number(graph.height.toFixed(1)),
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
        'drag or two-finger scroll to pan, pinch or cmd+gesture to zoom, use WASD or arrow keys to glide the camera, use Q/E to zoom, tap a board to center it, drag or tap tiles into slots',
      coordinateSystem:
        'world uses screen-centered camera space; each graph uses its own axis bounds, with x increasing right and y increasing upward',
      activeSection: this.activeSectionId,
      activeLevel,
      camera: {
        x: Number(this.camera.x.toFixed(1)),
        y: Number(this.camera.y.toFixed(1)),
      },
      zoom: Number(this.zoomLevel.toFixed(2)),
      inspectedGoal: this.inspectedGoalKey(),
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
      selectTile: (tileId: TileId | null) => void
      placeTile: (tileId: TileId, slotId: string) => void
      animatePlaceTile: (tileId: TileId, slotId: string) => void
      startAtLevel: (levelNumber: number) => void
      getState: () => unknown
      getLayoutIssues: () => Array<{ kind: string; a: string; b: string }>
    }
  }
}
