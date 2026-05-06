import rough from 'roughjs'

import { AudioManager } from './audio'
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
const UNLOCK_CAMERA_DURATION_MULTIPLIER = 1
const MIN_CONNECTOR_DRAW_SPEED_PX_PER_MS = 0.55
const MIN_CONNECTOR_DURATION_MS = 620
const MAX_CONNECTOR_DURATION_MS = 2100
const SECTION_REVEAL_DURATION_MS = 1160
const DOG_PET_MS = 1200
const PAN_DRAG_THRESHOLD = 7
const TILE_DRAG_THRESHOLD = 10
const GOAL_EPSILON = 0.12
const GOAL_TARGET_TOLERANCE = 0.5
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
const LOCKED_GOAL_MIN_ALPHA = 0.035
const LOCKED_GOAL_MAX_ALPHA = 0.34
const GOAL_VISUAL_BOOST_START_ZOOM_OUT = 0.5
const GOAL_VISUAL_MAX_SCREEN_SCALE = 0.82
const SOLVED_GOAL_ALPHA = 0.52
const SOLVED_GOAL_LIGHTEN = 0.64
const DIMMED_TRAY_TILE_ALPHA = 0.38
const EQUATION_FONT_SIZE = 23
const EQUATION_TOKEN_SIZE = 38
const EQUATION_PREFIX_WIDTH_Y = 40
const EQUATION_PREFIX_WIDTH_R = EQUATION_PREFIX_WIDTH_Y
const EQUATION_GAP = 10
const EQUATION_PAREN_GAP = 4
const EQUATION_SUPERSCRIPT_OVERLAP = -4
const EQUATION_SCRIPT_SLOT_SCALE = 0.72
const MAJOR_TICK_SIZE = 12
const MINOR_TICK_SIZE = 6
const TICK_STROKE_WIDTH = 1.55
const TILE_HOVER_LIFT_PX = 5
const TILE_DRAG_SCALE = 1.06
const TILE_SETTLE_DURATION_MS = 180
const SLOT_FLASH_DURATION_MS = 220
const TRAY_ARRIVAL_DURATION_MS = 760
const TILE_UNLOCK_DURATION_MS = 1400
const TILE_UNLOCK_REVEAL_END = 0.58
const GRAPH_COMPLETE_DURATION_MS = 940
const TARGET_CELEBRATION_DURATION_MS = 920
const CONFETTI_PARTICLE_COUNT = 28
const REWARD_DOODLE_LIFETIME_MS = 5600
const GRAPHITE_DUST_LIFETIME_MS = 1250
const GOAL_GUIDE_MAJOR_TICK_SIZE = 16
const GOAL_GUIDE_MINOR_TICK_SIZE = 10
const GOAL_GUIDE_LABEL_SIZE = 16
const CAMERA_VISIBILITY_MARGIN_PX = 50
const PROGRESS_STORAGE_KEY = 'graphbound-progress-v1'
const PROGRESS_STORAGE_VERSION = 1

type RoughCanvas = ReturnType<typeof rough.canvas>

export interface IntendedPreviewResult {
  achievedGoalIds: string[]
  expression: string | null
  sectionId: string
  solved: boolean
  statusMessage: string
}

interface TileDrawOptions {
  scale?: number
  rotation?: number
  showHighlight?: boolean
}

interface TileUnlockAnimation {
  tileId: TileId
  sourceScreen: Point
  color: string
  ageMs: number
}

interface StoredProgress {
  version: number
  completedGoals: string[]
  activeSectionId: string | null
  tileFocusSectionId: string | null
  victoryScreenShown: boolean
}

interface InferredFunctionParens {
  startIndex: number
  endIndex: number
}

type RewardDoodleKind = 'check' | 'flower' | 'spark' | 'spiral' | 'pie' | 'crease'

interface RewardDoodle {
  id: string
  kind: RewardDoodleKind
  world: Point
  color: string
  ageMs: number
  lifetimeMs: number
}

interface CelebrationConfettiParticle {
  color: string
  shape: 'dash' | 'box' | 'spark'
  vx: number
  vy: number
  gravity: number
  size: number
  angle: number
  spin: number
  wobble: number
  delayMs: number
}

interface CelebrationConfetti {
  id: string
  world: Point
  ageMs: number
  lifetimeMs: number
  particles: CelebrationConfettiParticle[]
}

interface GraphiteDust {
  id: string
  world: Point
  radius: number
  ageMs: number
  lifetimeMs: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

function smoothStep(value: number): number {
  const progress = clamp(value, 0, 1)
  return progress * progress * (3 - 2 * progress)
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
  axes: GraphAxes,
): Required<SectionVisualDefinition> {
  const base = {
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

  const graphWidth = axisRange(axes.x) * GRAPH_UNIT_WORLD_X
  const graphHeight = axisRange(axes.y) * GRAPH_UNIT_WORLD_Y
  const boardLeft = base.graphX
  const boardRight = Math.max(0, base.boardWidth - base.graphX - base.graphWidth)
  const boardTop = base.graphY
  const boardBottom = Math.max(0, base.boardHeight - base.graphY - base.graphHeight)
  const boardWidth = boardLeft + graphWidth + boardRight
  const boardHeight = boardTop + graphHeight + boardBottom
  const terrainLeft = base.boardX
  const terrainRight = Math.max(0, base.terrainWidth - base.boardX - base.boardWidth)
  const terrainTop = base.boardY
  const terrainBottom = Math.max(0, base.terrainHeight - base.boardY - base.boardHeight)
  const equationGap = Math.max(0, base.equationY - (base.graphY + base.graphHeight))

  return {
    terrainWidth: terrainLeft + boardWidth + terrainRight,
    terrainHeight: terrainTop + boardHeight + terrainBottom,
    boardX: base.boardX,
    boardY: base.boardY,
    boardWidth,
    boardHeight,
    graphX: base.graphX,
    graphY: base.graphY,
    graphWidth,
    graphHeight,
    equationY: base.graphY + graphHeight + equationGap,
    slotSize: base.slotSize,
    tokenGap: base.tokenGap,
  }
}

function axisRange(axis: AxisDefinition): number {
  return Math.max(0.001, axis.max - axis.min)
}

const GRAPH_UNIT_WORLD_X = 30
const GRAPH_UNIT_WORLD_Y = 30

function axisTicks(axis: AxisDefinition): number[] {
  const step = 1
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
  void axis
  const everyFive = value / 5
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

function seededUnit(key: string): number {
  return (hashSeed(key) % 10000) / 10000
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

function polylineSegmentsLength(segments: Point[][]): number {
  return segments.reduce((total, segment) => total + polylineLength(segment), 0)
}

function progressivePolylineSegments(segments: Point[][], progress: number): Point[][] {
  const clampedProgress = clamp(progress, 0, 1)
  if (clampedProgress >= 1) {
    return segments
  }

  const totalLength = polylineSegmentsLength(segments)
  if (totalLength <= 0) {
    return []
  }

  const targetLength = totalLength * clampedProgress
  const visibleSegments: Point[][] = []
  let coveredLength = 0

  for (const segment of segments) {
    const segmentLength = polylineLength(segment)
    if (segmentLength <= 0) {
      continue
    }

    if (coveredLength + segmentLength <= targetLength) {
      visibleSegments.push(segment)
      coveredLength += segmentLength
      continue
    }

    const segmentProgress = (targetLength - coveredLength) / segmentLength
    const partialSegment = partialPolyline(segment, segmentProgress)
    if (partialSegment.length > 1) {
      visibleSegments.push(partialSegment)
    }
    break
  }

  return visibleSegments
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

function rectsIntersect(a: Rect, b: Rect, inset = 0): boolean {
  return !(
    a.x + a.width < b.x - inset ||
    b.x + b.width < a.x - inset ||
    a.y + a.height < b.y - inset ||
    b.y + b.height < a.y - inset
  )
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    Boolean(target.closest('[contenteditable="true"]'))
  )
}

function rectIntersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.height, b.y + b.height)

  return Math.max(0, right - left) * Math.max(0, bottom - top)
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
  const tileSize = clamp(Math.min(width, height) * 0.0792, 42, 61)
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
  private readonly audio: AudioManager
  private readonly zoomRoot: HTMLDivElement
  private readonly zoomButton: HTMLButtonElement
  private readonly sectionRevealProgress = new Map<string, number>()
  private readonly connectorRouteWorldCache = new Map<string, Point[]>()
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
  private tileFocusSectionId: string | null = null
  private hoveredTrayTileId: TileId | null = null
  private hoveredGoalKey: string | null = null
  private pinnedGoalKey: string | null = null
  private readonly slotSettleAnimations = new Map<string, number>()
  private readonly slotFlashAnimations = new Map<string, number>()
  private readonly trayArrivalAnimations = new Map<TileId, number>()
  private readonly tileUnlockAnimations: TileUnlockAnimation[] = []
  private readonly graphCompleteAnimations = new Map<string, number>()
  private readonly rewardDoodles: RewardDoodle[] = []
  private readonly celebrationConfetti: CelebrationConfetti[] = []
  private readonly graphiteDust: GraphiteDust[] = []
  private activeSectionId = this.sections[0].id
  private camera: Point = { ...this.sections[0].world }
  private zoomLevel = START_ZOOM_LEVEL
  private statusMessage = 'world-ready'
  private startLevelOverride: number | null = null
  private victoryScreenVisible = false
  private victoryScreenShown = false
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
    this.audio = new AudioManager({ onResetProgress: () => this.resetStoredProgress() })
    this.layout = createLayout(960, 720, this.zoomLevel)
    const zoomControl = this.createZoomControl()
    this.zoomRoot = zoomControl.root
    this.zoomButton = zoomControl.button
    document.body.append(this.zoomRoot)

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
        targetCelebrationProgress: 0,
        targetCelebrationQueued: false,
        fuseProgress: 0,
        fuseCameraProgress: 0,
        fuseCameraFrom: null,
        fuseCameraTo: null,
        fuseCameraFromScale: null,
        fuseCameraToScale: null,
        animating: false,
        animatingGoalId: null,
        targetHitSoundPlayed: false,
        unlockRouteSoundPlayed: false,
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

    if (!this.applyLevelOverrideFromUrl()) {
      this.restoreStoredProgress()
    }
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

  private createZoomControl(): { root: HTMLDivElement; button: HTMLButtonElement } {
    const root = document.createElement('div')
    root.className = 'zoom-control'

    const button = document.createElement('button')
    button.className = 'zoom-control__button'
    button.type = 'button'
    button.addEventListener('click', this.handleZoomButtonClick)

    const icon = document.createElement('span')
    icon.className = 'zoom-control__icon'
    icon.setAttribute('aria-hidden', 'true')

    const lens = document.createElement('span')
    lens.className = 'zoom-control__lens'

    const mark = document.createElement('span')
    mark.className = 'zoom-control__mark'

    icon.append(lens, mark)
    button.append(icon)
    root.append(button)
    return { root, button }
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
      previewIntendedSolution: (sectionId: string, goalId: string) =>
        this.previewIntendedSolution(sectionId, goalId),
      getState: () => JSON.parse(this.renderGameToText()),
      getInteractionRects: () => this.debugInteractionRects(),
      getLayoutIssues: () => this.layoutOverlapIssues(),
    }
  }

  previewIntendedSolution(sectionId: string, goalId: string): IntendedPreviewResult {
    const section = this.sectionById.get(sectionId)
    const sectionIndex = this.sectionIndexById.get(sectionId)
    const goal = section?.goals.find((candidate) => candidate.id === goalId)

    if (!section || sectionIndex === undefined || !goal?.solutionTiles) {
      return {
        achievedGoalIds: [],
        expression: null,
        sectionId,
        solved: false,
        statusMessage: 'missing-intended-solution',
      }
    }

    this.resetProgressionState()
    this.startLevelOverride = sectionIndex + 1
    this.unlockedSections.add(section.id)
    this.sectionRevealProgress.set(section.id, 1)
    this.setActiveSection(section.id)
    const focus = this.sectionComfortableFocus(section.id)
    this.layout.worldScale = focus.scale
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    this.camera = focus.camera

    const runtime = this.sectionRuntimes.get(sectionId)
    if (!runtime || goal.solutionTiles.length !== section.slots.length) {
      return {
        achievedGoalIds: [],
        expression: null,
        sectionId,
        solved: false,
        statusMessage: 'invalid-intended-solution-slots',
      }
    }

    runtime.placements = this.createEmptyPlacements(section)
    for (const [index, tileId] of goal.solutionTiles.entries()) {
      runtime.placements[section.slots[index].id] = tileId
    }

    const result = evaluateSectionPlot(section, runtime.placements)
    runtime.plotResult = result
    runtime.pendingGoalIds = result?.achievedGoalIds ?? []
    runtime.solvedGoalIds = result?.achievedGoalIds ?? []
    runtime.plotProgress = result?.hasVisiblePath ? 1 : 0
    runtime.targetFillProgress = result?.achievedGoalIds.includes(goalId) ? 1 : 0
    runtime.targetCelebrationProgress = runtime.targetFillProgress
    runtime.targetCelebrationQueued = false
    runtime.fuseProgress = runtime.targetFillProgress
    runtime.fuseCameraProgress = runtime.targetFillProgress
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null
    runtime.fuseCameraFromScale = null
    runtime.fuseCameraToScale = null
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.statusMessage = result?.achievedGoalIds.includes(goalId)
      ? 'goal-lined-up'
      : result?.hasVisiblePath
        ? 'line-drawn'
        : result
          ? 'no-visible-line'
          : 'awaiting-tiles'

    for (const achievedGoalId of runtime.solvedGoalIds) {
      this.completedGoals.add(`${section.id}:${achievedGoalId}`)
    }

    this.pinnedGoalKey = null
    this.hoveredGoalKey = null
    this.selectedTileId = null
    this.statusMessage = runtime.statusMessage
    this.render()

    return {
      achievedGoalIds: [...runtime.solvedGoalIds],
      expression: result?.screenLabel ?? null,
      sectionId,
      solved: runtime.solvedGoalIds.includes(goalId),
      statusMessage: runtime.statusMessage,
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
    runtime.targetCelebrationProgress = 0
    runtime.targetCelebrationQueued = false
    runtime.fuseProgress = 0
    runtime.fuseCameraProgress = 0
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null
    runtime.fuseCameraFromScale = null
    runtime.fuseCameraToScale = null
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.targetHitSoundPlayed = false
    runtime.unlockRouteSoundPlayed = false
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
    this.connectorRouteWorldCache.clear()
    this.selectedTileId = null
    this.tileFocusSectionId = null
    this.hoveredTrayTileId = null
    this.slotSettleAnimations.clear()
    this.slotFlashAnimations.clear()
    this.trayArrivalAnimations.clear()
    this.tileUnlockAnimations.length = 0
    this.graphCompleteAnimations.clear()
    this.rewardDoodles.length = 0
    this.celebrationConfetti.length = 0
    this.graphiteDust.length = 0
    this.drag = null
    this.cameraTween = null
    this.keyboardVelocity = { x: 0, y: 0 }
    this.movementKeys.clear()
    this.petDogTimer = 0
    this.startLevelOverride = null
    this.victoryScreenVisible = false
    this.victoryScreenShown = false
    this.audio.setVictoryMusic(false)

    for (const section of this.sections) {
      this.resetRuntime(section.id)

      if (section.initialUnlocked) {
        this.unlockedSections.add(section.id)
        this.sectionRevealProgress.set(section.id, 1)
      }
    }

    this.activeSectionId = this.sections[0].id
    this.camera = this.sectionComfortableFocus(this.sections[0].id).camera
    this.statusMessage = 'world-ready'
  }

  private clearStoredProgress(): void {
    try {
      window.localStorage.removeItem(PROGRESS_STORAGE_KEY)
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }

  private resetStoredProgress(): void {
    this.clearStoredProgress()
    this.resetProgressionState()
    this.render()
  }

  private validStoredGoalKeys(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return []
    }

    const seen = new Set<string>()
    const keys: string[] = []
    for (const item of value) {
      if (typeof item !== 'string' || seen.has(item) || !this.parseGoalKey(item)) {
        continue
      }

      seen.add(item)
      keys.push(item)
    }

    return keys
  }

  private validStoredSectionId(value: unknown): string | null {
    return typeof value === 'string' && this.sectionById.has(value) ? value : null
  }

  private loadStoredProgress(): StoredProgress | null {
    try {
      const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY)
      if (!raw) {
        return null
      }

      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed) || Number(parsed.version) !== PROGRESS_STORAGE_VERSION) {
        return null
      }

      const completedGoals = this.validStoredGoalKeys(parsed.completedGoals)
      const activeSectionId = this.validStoredSectionId(parsed.activeSectionId)
      const tileFocusSectionId = this.validStoredSectionId(parsed.tileFocusSectionId)
      if (completedGoals.length === 0 && !activeSectionId && !tileFocusSectionId) {
        return null
      }

      return {
        version: PROGRESS_STORAGE_VERSION,
        completedGoals,
        activeSectionId,
        tileFocusSectionId,
        victoryScreenShown: parsed.victoryScreenShown === true,
      }
    } catch {
      return null
    }
  }

  private completedGoalKeysInOrder(): string[] {
    return this.sections.flatMap((section) =>
      section.goals
        .map((goal) => this.goalKey(section.id, goal.id))
        .filter((key) => this.completedGoals.has(key)),
    )
  }

  private saveProgress(): void {
    if (this.startLevelOverride !== null) {
      return
    }

    const progress: StoredProgress = {
      version: PROGRESS_STORAGE_VERSION,
      completedGoals: this.completedGoalKeysInOrder(),
      activeSectionId: this.activeSectionId,
      tileFocusSectionId: this.tileFocusSectionId,
      victoryScreenShown: this.victoryScreenShown,
    }

    try {
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }

  private parseGoalKey(key: string): { section: SectionDefinition; goal: GoalDefinition } | null {
    const [sectionId, goalId, extra] = key.split(':')
    if (!sectionId || !goalId || extra !== undefined) {
      return null
    }

    const section = this.sectionById.get(sectionId)
    const goal = section?.goals.find((candidate) => candidate.id === goalId) ?? null
    return section && goal ? { section, goal } : null
  }

  private restoreRuntimeForSolvedSection(section: SectionDefinition, solvedGoalIds: string[]): void {
    const runtime = this.sectionRuntimes.get(section.id)
    if (!runtime) {
      return
    }

    const showcase = this.findBootstrapPlacement(section.id, solvedGoalIds)
    runtime.placements = showcase ?? this.createEmptyPlacements(section)
    runtime.plotResult = showcase ? evaluateSectionPlot(section, runtime.placements) : null
    runtime.plotProgress = runtime.plotResult?.hasVisiblePath ? 1 : 0
    runtime.targetFillProgress = solvedGoalIds.length > 0 ? 1 : 0
    runtime.targetCelebrationProgress = solvedGoalIds.length > 0 ? 1 : 0
    runtime.targetCelebrationQueued = false
    runtime.fuseProgress = solvedGoalIds.length > 0 ? 1 : 0
    runtime.fuseCameraProgress = solvedGoalIds.length > 0 ? 1 : 0
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.pendingGoalIds = []
    runtime.solvedGoalIds = solvedGoalIds
    runtime.statusMessage = solvedGoalIds.length === section.goals.length ? `${section.id}-completed` : `revisit-${section.id}`
  }

  private applyStoredSolvedGoals(completedGoalKeys: string[]): void {
    this.completedGoals.clear()
    for (const key of completedGoalKeys) {
      this.completedGoals.add(key)
    }

    for (const section of this.sections) {
      const solvedGoalIds = section.goals
        .filter((goal) => this.completedGoals.has(this.goalKey(section.id, goal.id)))
        .map((goal) => goal.id)

      if (solvedGoalIds.length === 0) {
        continue
      }

      this.unlockedSections.add(section.id)
      this.sectionRevealProgress.set(section.id, 1)

      for (const goalId of solvedGoalIds) {
        const goal = section.goals.find((candidate) => candidate.id === goalId)
        if (!goal) {
          continue
        }

        if (goal.rewardTileId) {
          this.unlockedTiles.add(goal.rewardTileId)
        }

        for (const unlockId of goal.unlocks) {
          this.unlockedSections.add(unlockId)
          this.sectionRevealProgress.set(unlockId, 1)
        }
      }

      if (solvedGoalIds.length === section.goals.length) {
        this.completedSections.add(section.id)
        if (section.rewardTileId) {
          this.unlockedTiles.add(section.rewardTileId)
        }
      }

      this.restoreRuntimeForSolvedSection(section, solvedGoalIds)
    }
  }

  private restorableFocusSectionId(sectionId: string | null): string | null {
    return sectionId && this.unlockedSections.has(sectionId) ? sectionId : null
  }

  private restoreStoredProgress(): boolean {
    const stored = this.loadStoredProgress()
    if (!stored) {
      return false
    }

    this.resetProgressionState()
    this.victoryScreenShown = stored.victoryScreenShown
    this.applyStoredSolvedGoals(stored.completedGoals)

    const focusSectionId =
      this.restorableFocusSectionId(stored.activeSectionId) ??
      this.restorableFocusSectionId(stored.tileFocusSectionId) ??
      this.activeSectionId

    this.activeSectionId = focusSectionId
    this.tileFocusSectionId =
      stored.tileFocusSectionId &&
      this.unlockedSections.has(stored.tileFocusSectionId)
        ? stored.tileFocusSectionId
        : null

    const focus = this.sectionComfortableFocus(focusSectionId)
    this.layout.worldScale = focus.scale
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    this.camera = focus.camera
    this.statusMessage = stored.completedGoals.length > 0 ? 'progress-restored' : 'world-ready'
    this.updateVictoryState(false)
    return true
  }

  private completedPuzzleCount(): number {
    return this.sections.filter((section) =>
      section.goals.every((goal) => this.completedGoals.has(this.goalKey(section.id, goal.id))),
    ).length
  }

  private hasCompletedEveryPuzzle(): boolean {
    return this.sections.every((section) =>
      section.goals.length > 0 &&
      section.goals.every((goal) => this.completedGoals.has(this.goalKey(section.id, goal.id))),
    )
  }

  private updateVictoryState(playMusic: boolean): void {
    const completed = this.hasCompletedEveryPuzzle()
    if (!completed) {
      if (this.victoryScreenVisible) {
        this.victoryScreenVisible = false
      }
      this.victoryScreenShown = false
      this.audio.setVictoryMusic(false)
      return
    }

    if (this.victoryScreenVisible) {
      this.statusMessage = 'victory'
      if (playMusic) {
        this.audio.playVictoryMusic()
      } else {
        this.audio.setVictoryMusic(true)
      }
      return
    }

    if (this.victoryScreenShown) {
      this.audio.setVictoryMusic(false)
      return
    }

    const newlyVictorious = !this.victoryScreenVisible
    this.victoryScreenVisible = true
    this.victoryScreenShown = true
    this.statusMessage = 'victory'
    if (playMusic && newlyVictorious) {
      this.audio.playVictoryMusic()
    } else {
      this.audio.setVictoryMusic(true)
    }
    this.saveProgress()
  }

  private dismissVictoryScreen(): void {
    if (!this.victoryScreenVisible) {
      return
    }

    this.victoryScreenVisible = false
    this.saveProgress()
    this.render()
  }

  private requestedLevelIndexFromUrl(): number | null {
    if (!import.meta.env.DEV) {
      return null
    }

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

  private intendedBootstrapPlacement(
    section: SectionDefinition,
    preferredGoalIds: string[],
  ): Record<string, TileId | null> | null {
    for (const goalId of preferredGoalIds) {
      const goal = section.goals.find((candidate) => candidate.id === goalId)
      if (!goal?.solutionTiles || goal.solutionTiles.length !== section.slots.length) {
        continue
      }

      const placements = this.createEmptyPlacements(section)
      for (const [index, tileId] of goal.solutionTiles.entries()) {
        placements[section.slots[index].id] = tileId
      }

      const result = evaluateSectionPlot(section, placements)
      if (result?.hasVisiblePath) {
        return placements
      }
    }

    return null
  }

  private findBootstrapPlacement(
    sectionId: string,
    preferredGoalIds: string[],
  ): Record<string, TileId | null> | null {
    const section = this.sectionById.get(sectionId)
    if (!section || section.slots.length === 0) {
      return null
    }

    const intendedPlacement = this.intendedBootstrapPlacement(section, preferredGoalIds)
    if (intendedPlacement) {
      return intendedPlacement
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
        if (!this.tileAllowedInSlot(sectionId, slotId, tileId, [], placements)) {
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
    const newlyUnlockedTiles: TileId[] = []
    this.unlockedSections.add(sectionId)
    this.sectionRevealProgress.set(sectionId, 1)

    for (const goalId of goalIds) {
      this.completedGoals.add(`${sectionId}:${goalId}`)
      const goal = section.goals.find((candidate) => candidate.id === goalId)

      if (goal?.rewardTileId && !this.unlockedTiles.has(goal.rewardTileId)) {
        this.unlockedTiles.add(goal.rewardTileId)
        newlyUnlockedTiles.push(goal.rewardTileId)
      }

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
    runtime.targetCelebrationProgress = runtime.plotResult?.achievedGoalIds.length ? 1 : 0
    runtime.targetCelebrationQueued = false
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
      } else if (newlyUnlockedTiles.length > 0) {
        runtime.statusMessage = `tile-${newlyUnlockedTiles.at(-1)}-unlocked`
      } else {
        runtime.statusMessage = `${sectionId}-completed`
      }
      return
    }

    runtime.statusMessage =
      newlyUnlockedTiles.length > 0
        ? `tile-${newlyUnlockedTiles.at(-1)}-unlocked`
        : runtime.solvedGoalIds.length > 0
          ? `revisit-${sectionId}`
          : section.blurb
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
    const focus = this.sectionComfortableFocus(targetSection.id)
    this.layout.worldScale = focus.scale
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    this.camera = focus.camera
    this.statusMessage = `level-${targetIndex + 1}-ready`
  }

  private applyLevelOverrideFromUrl(): boolean {
    const targetIndex = this.requestedLevelIndexFromUrl()
    if (targetIndex === null) {
      return false
    }

    this.startAtLevel(targetIndex)
    return true
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
    return resolveVisual(
      this.sectionById.get(sectionId)?.visual,
      this.sectionAxes(sectionId),
    )
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
    const visual = this.sectionVisual(sectionId)
    return {
      width: visual.graphWidth,
      height: visual.graphHeight,
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

  private focusViewportRect(): Rect {
    const horizontalMargin = clamp(this.layout.width * 0.055, 28, 72)
    const topMargin = clamp(this.layout.height * 0.055, 26, 62)
    const trayRects = this.trayTileRects()
    const trayTop =
      trayRects.length > 0
        ? Math.min(...trayRects.map(({ rect }) => rect.y))
        : this.layout.trayY
    const bottomMargin = clamp(this.layout.tileSize * 0.9, 26, 48)
    const bottom = Math.max(topMargin + 160, trayTop - bottomMargin)

    return {
      x: horizontalMargin,
      y: topMargin,
      width: Math.max(240, this.layout.width - horizontalMargin * 2),
      height: Math.max(160, bottom - topMargin),
    }
  }

  private sectionComfortableFocus(sectionId: string): {
    point: Point
    scale: number
    anchorScreen: Point
    camera: Point
  } {
    const content = this.boardWorldRect(sectionId)
    const viewport = this.focusViewportRect()
    const fitPadding = clamp(Math.min(viewport.width, viewport.height) * 0.035, 14, 28)
    const safeWidth = Math.max(120, viewport.width - fitPadding * 2)
    const safeHeight = Math.max(120, viewport.height - fitPadding * 2)
    const targetScale = this.clampWorldScale(
      Math.min(
        this.layout.baseWorldScale * START_ZOOM_LEVEL,
        safeWidth / Math.max(1, content.width),
        safeHeight / Math.max(1, content.height),
      ),
    )
    const point = {
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    }
    const anchorScreen = {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    }

    return {
      point,
      scale: targetScale,
      anchorScreen,
      camera: this.constrainedCameraForScaleAtScreen(point, targetScale, anchorScreen, [content]),
    }
  }

  private constrainedCamera(point: Point, extraContentRects: Rect[] = []): Point {
    const contentRects = [
      ...[...this.unlockedSections].map((sectionId) => this.graphWorldRect(sectionId)),
      ...this.connectorWorldRects(),
      ...extraContentRects,
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

  private constrainedCameraForScaleAtScreen(
    point: Point,
    scale: number,
    screenPoint: Point,
    extraContentRects: Rect[] = [],
  ): Point {
    const previousScale = this.layout.worldScale
    const previousZoomLevel = this.zoomLevel
    this.layout.worldScale = this.clampWorldScale(scale)
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    const constrained = this.constrainedCamera({
      x: point.x - (screenPoint.x - this.layout.worldCenter.x) / this.layout.worldScale,
      y: point.y - (screenPoint.y - this.layout.worldCenter.y) / this.layout.worldScale,
    }, extraContentRects)
    this.layout.worldScale = previousScale
    this.zoomLevel = previousZoomLevel
    return constrained
  }

  private moveCameraAndScaleTo(
    point: Point,
    scale: number,
    animated: boolean,
    delayMs = 0,
    anchorScreen = this.layout.worldCenter,
  ): void {
    const targetScale = this.clampWorldScale(scale)
    const constrained = this.constrainedCameraForScaleAtScreen(point, targetScale, anchorScreen)

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

    this.setActiveSection(sectionId)
    this.focusTilesOnSection(sectionId)

    if (centerCamera) {
      const focus = this.sectionComfortableFocus(sectionId)
      this.moveCameraAndScaleTo(
        focus.point,
        focus.scale,
        animated,
        animated ? 0 : 0,
        focus.anchorScreen,
      )
    } else {
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
    if (!import.meta.env.DEV) {
      return
    }

    if (!Number.isFinite(levelNumber)) {
      return
    }

    this.startAtLevel(Math.round(levelNumber) - 1)
    this.render()
  }

  private debugInteractionRects(): unknown {
    return {
      tray: this.trayTileRects().map(({ tileId, rect }) => ({ tileId, rect })),
      slots: this.activeSection.slots.map((slot) => ({
        slotId: slot.id,
        tileId: this.activeRuntime.placements[slot.id],
        rect: this.slotRect(slot.id),
        slottedRect: this.slottedTileRect(slot.id),
      })),
      goals: this.sections.flatMap((section) =>
        section.goals.map((goal) => ({
          key: this.goalKey(section.id, goal.id),
          sectionId: section.id,
          goalId: goal.id,
          rect: this.goalShapeRect(section.id, goal),
        })),
      ),
    }
  }

  private activeTileIds(): TileId[] {
    return [...this.unlockedTiles]
  }

  private slotAnimationKey(sectionId: string, slotId: string): string {
    return `${sectionId}:${slotId}`
  }

  private queueSlotSettle(sectionId: string, slotId: string): void {
    this.slotSettleAnimations.set(this.slotAnimationKey(sectionId, slotId), 0)
    this.ensureAnimation()
  }

  private queueSlotFlash(sectionId: string, slotId: string): void {
    this.slotFlashAnimations.set(this.slotAnimationKey(sectionId, slotId), 0)
    this.ensureAnimation()
  }

  private queueTrayArrival(tileId: TileId): void {
    this.trayArrivalAnimations.set(tileId, 0)
    this.ensureAnimation()
  }

  private queueTileUnlock(tileId: TileId, sourceScreen: Point, color: string): void {
    const existingIndex = this.tileUnlockAnimations.findIndex((animation) => animation.tileId === tileId)
    if (existingIndex >= 0) {
      return
    }

    const animation: TileUnlockAnimation = {
      tileId,
      sourceScreen,
      color,
      ageMs: 0,
    }

    this.tileUnlockAnimations.push(animation)

    this.queueTrayArrival(tileId)
    this.ensureAnimation()
  }

  private queueGraphComplete(sectionId: string): void {
    this.graphCompleteAnimations.set(sectionId, 0)
    this.ensureAnimation()
  }

  private tileUnlockProgress(tileId: TileId): number | null {
    const animation = this.tileUnlockAnimations.find((candidate) => candidate.tileId === tileId)
    return animation ? clamp(animation.ageMs / TILE_UNLOCK_DURATION_MS, 0, 1) : null
  }

  private previewRewardUnlocks(sectionId: string, goalId: string): void {
    const section = this.sectionById.get(sectionId)
    const runtime = this.sectionRuntimes.get(sectionId)
    const goal = section?.goals.find((candidate) => candidate.id === goalId)

    if (!section || !runtime || !goal) {
      return
    }

    const source = this.goalShapeCenter(sectionId, goal)
    const color = this.goalColor(sectionId, goal)

    if (goal.rewardTileId && !this.unlockedTiles.has(goal.rewardTileId)) {
      this.queueTileUnlock(goal.rewardTileId, source, color)
    }

    const solvedAfter = new Set(runtime.solvedGoalIds)
    solvedAfter.add(goalId)
    const sectionWillComplete = section.goals.every((candidate) => solvedAfter.has(candidate.id))

    if (sectionWillComplete && section.rewardTileId && !this.unlockedTiles.has(section.rewardTileId)) {
      this.queueTileUnlock(section.rewardTileId, source, color)
    }
  }

  private queueGoalRewardEffects(sectionId: string, goalId: string): void {
    const section = this.sectionById.get(sectionId)
    const goal = section?.goals.find((candidate) => candidate.id === goalId)
    if (!section || !goal) {
      return
    }

    const color = this.goalColor(sectionId, goal)
    const source = this.goalShapeCenter(sectionId, goal)
    const graphCenter = this.rectCenter(this.graphRect(sectionId))
    const direction = {
      x: source.x - graphCenter.x,
      y: source.y - graphCenter.y,
    }
    const length = Math.max(1, Math.hypot(direction.x, direction.y))
    const normalized = {
      x: direction.x / length,
      y: direction.y / length,
    }
    const perpendicular = {
      x: -normalized.y,
      y: normalized.x,
    }
    const offset = 42 * this.layout.worldScale
    const wobble = (seededUnit(`doodle-wobble:${sectionId}:${goalId}`) - 0.5) * 26 * this.layout.worldScale
    const doodleScreen = {
      x: source.x + normalized.x * offset + perpendicular.x * wobble,
      y: source.y + normalized.y * offset + perpendicular.y * wobble,
    }

    const rewardTile = goal.rewardTileId ?? section.rewardTileId ?? null
    this.rewardDoodles.push({
      id: `doodle:${sectionId}:${goalId}:${this.rewardDoodles.length}`,
      kind: this.doodleKindForReward(section, rewardTile),
      world: this.screenToWorld(doodleScreen),
      color,
      ageMs: 0,
      lifetimeMs: REWARD_DOODLE_LIFETIME_MS,
    })

    for (let index = 0; index < 14; index += 1) {
      const angle = seededUnit(`dust-angle:${sectionId}:${goalId}:${index}`) * Math.PI * 2
      const distancePx = (6 + seededUnit(`dust-distance:${sectionId}:${goalId}:${index}`) * 28) *
        this.layout.worldScale
      const dustScreen = {
        x: source.x + Math.cos(angle) * distancePx,
        y: source.y + Math.sin(angle) * distancePx,
      }
      this.graphiteDust.push({
        id: `dust:${sectionId}:${goalId}:${index}:${this.graphiteDust.length}`,
        world: this.screenToWorld(dustScreen),
        radius: 1.2 + seededUnit(`dust-radius:${sectionId}:${goalId}:${index}`) * 2.1,
        ageMs: 0,
        lifetimeMs: GRAPHITE_DUST_LIFETIME_MS,
      })
    }

    this.ensureAnimation()
  }

  private queueGoalCelebration(sectionId: string, goalId: string): void {
    const section = this.sectionById.get(sectionId)
    const goal = section?.goals.find((candidate) => candidate.id === goalId)
    if (!section || !goal) {
      return
    }

    const source = this.goalShapeCenter(sectionId, goal)
    const baseColor = this.goalColor(sectionId, goal)
    const palette = [baseColor, '#e99b52', '#e176a8', '#6f9fe8', '#72b986', '#a17ee6']
    const particles: CelebrationConfettiParticle[] = []

    for (let index = 0; index < CONFETTI_PARTICLE_COUNT; index += 1) {
      const spread = seededUnit(`confetti-spread:${sectionId}:${goalId}:${index}`)
      const launch = seededUnit(`confetti-launch:${sectionId}:${goalId}:${index}`)
      const side = seededUnit(`confetti-side:${sectionId}:${goalId}:${index}`) < 0.5 ? -1 : 1
      particles.push({
        color: palette[index % palette.length],
        shape: index % 5 === 0 ? 'spark' : index % 3 === 0 ? 'box' : 'dash',
        vx: side * (32 + spread * 142),
        vy: -(145 + launch * 172),
        gravity: 315 + seededUnit(`confetti-gravity:${sectionId}:${goalId}:${index}`) * 96,
        size: 4.5 + seededUnit(`confetti-size:${sectionId}:${goalId}:${index}`) * 5.5,
        angle: seededUnit(`confetti-angle:${sectionId}:${goalId}:${index}`) * Math.PI * 2,
        spin: (seededUnit(`confetti-spin:${sectionId}:${goalId}:${index}`) - 0.5) * Math.PI * 3.8,
        wobble: (seededUnit(`confetti-wobble:${sectionId}:${goalId}:${index}`) - 0.5) * 28,
        delayMs: seededUnit(`confetti-delay:${sectionId}:${goalId}:${index}`) * 110,
      })
    }

    this.celebrationConfetti.push({
      id: `confetti:${sectionId}:${goalId}:${this.celebrationConfetti.length}`,
      world: this.screenToWorld(source),
      ageMs: 0,
      lifetimeMs: TARGET_CELEBRATION_DURATION_MS,
      particles,
    })
    this.ensureAnimation()
  }

  private doodleKindForReward(section: SectionDefinition, tileId: TileId | null): RewardDoodleKind {
    if (tileId === 'π') {
      return 'pie'
    }

    if (tileId === 'sin' || tileId === 'θ' || section.coordinateMode === 'polar') {
      return 'spiral'
    }

    if (tileId === '(' || tileId === ')') {
      return 'crease'
    }

    if (tileId === '^') {
      return 'spark'
    }

    if (section.goals.length > 1) {
      return 'flower'
    }

    return 'check'
  }

  private timedAnimationProgress(
    map: Map<string, number>,
    key: string,
    durationMs: number,
  ): number | null {
    const age = map.get(key)
    if (age === undefined) {
      return null
    }

    return clamp(age / durationMs, 0, 1)
  }

  private slotIdUsingTile(sectionId: string, tileId: TileId): string | null {
    const runtime = this.sectionRuntimes.get(sectionId)

    if (!runtime) {
      return null
    }

    return (
      Object.entries(runtime.placements).find(([, placedTileId]) => placedTileId === tileId)?.[0] ??
      null
    )
  }

  private tileAllowedInSlot(
    sectionId: string,
    slotId: string,
    tileId: TileId,
    ignoredSlotIds: string[] = [],
    placementsOverride?: Record<string, TileId | null>,
  ): boolean {
    if (!this.tileAllowedForSection(sectionId, tileId)) {
      return false
    }

    const placements = placementsOverride ?? this.sectionRuntimes.get(sectionId)?.placements
    if (!placements) {
      return false
    }

    const ignored = new Set(ignoredSlotIds)
    const candidatePlacements = { ...placements }
    for (const ignoredSlotId of ignored) {
      candidatePlacements[ignoredSlotId] = null
    }
    candidatePlacements[slotId] = tileId

    if (!this.slotAllowsTile(sectionId, slotId, tileId, candidatePlacements)) {
      return false
    }

    return !Object.entries(placements).some(
      ([placedSlotId, placedTileId]) => placedTileId === tileId && !ignored.has(placedSlotId),
    )
  }

  private tileAllowedForSection(sectionId: string, tileId: TileId): boolean {
    const section = this.sectionById.get(sectionId)

    if (!section) {
      return false
    }

    const fixedValues = this.fixedEquationValues(section)

    if (tileId === '=' && fixedValues.includes('=')) {
      return false
    }

    if (section.coordinateMode === 'polar') {
      return tileId !== 'x' && tileId !== 'y'
    }

    return tileId !== 'θ'
  }

  private fixedEquationValues(section: SectionDefinition): string[] {
    const values = section.displayEquation
      ? section.displayEquation.filter((part) => part.type === 'fixed').map((part) => part.value)
      : [this.equationPrefix(section.id), '=', ...section.equation
          .filter((part) => part.type === 'fixed')
          .map((part) => part.value)]

    return values
  }

  private tileIsOperator(tileId: TileId): boolean {
    return ['+', '-', '/', '^', '='].includes(tileId)
  }

  private equationPartValue(
    sectionId: string,
    part: EquationPart | undefined,
    placementsOverride?: Record<string, TileId | null>,
  ): string | null {
    if (!part) {
      return null
    }

    if (part.type === 'fixed') {
      return part.value
    }

    const placements = placementsOverride ?? this.sectionRuntimes.get(sectionId)?.placements
    const tileId = placements?.[part.slotId]
    return tileId ? TILE_DEFINITIONS[tileId].label : null
  }

  private parenthesesCanBeBalanced(
    sectionId: string,
    placementsOverride?: Record<string, TileId | null>,
  ): boolean {
    let possibleBalances = new Set<number>([0])

    for (const part of this.equationDisplayParts(sectionId)) {
      const value = this.equationPartValue(sectionId, part, placementsOverride)
      const deltas = value === '(' ? [1] : value === ')' ? [-1] : value === null ? [-1, 0, 1] : [0]
      const nextBalances = new Set<number>()

      for (const balance of possibleBalances) {
        for (const delta of deltas) {
          const nextBalance = balance + delta
          if (nextBalance >= 0) {
            nextBalances.add(nextBalance)
          }
        }
      }

      if (nextBalances.size === 0) {
        return false
      }

      possibleBalances = nextBalances
    }

    return possibleBalances.has(0)
  }

  private slotAllowsTile(
    sectionId: string,
    slotId: string,
    tileId: TileId,
    placementsOverride?: Record<string, TileId | null>,
  ): boolean {
    const section = this.sectionById.get(sectionId)
    const slot = section?.slots.find((candidate) => candidate.id === slotId)

    if (!slot?.allowedTiles.includes(tileId)) {
      return false
    }

    const parts = this.equationDisplayParts(sectionId)
    const slotIndex = parts.findIndex(
      (part) => part.type === 'slot' && part.slotId === slotId,
    )

    if (slotIndex === -1) {
      return false
    }

    if (!this.parenthesesCanBeBalanced(sectionId, placementsOverride)) {
      return false
    }

    if (!this.equationTokensCanBeValid(sectionId, placementsOverride)) {
      return false
    }

    const previousValue = this.equationPartValue(sectionId, parts[slotIndex - 1], placementsOverride)
    const nextValue = this.equationPartValue(sectionId, parts[slotIndex + 1], placementsOverride)
    const tileValue = TILE_DEFINITIONS[tileId].label

    if (tileId === ')' && this.valueCannotPrecedeRightParenthesis(previousValue)) {
      return false
    }

    if (nextValue === ')' && this.valueCannotPrecedeRightParenthesis(tileValue)) {
      return false
    }

    if (!this.tileIsOperator(tileId)) {
      return true
    }

    if (slotIndex >= parts.length - 1) {
      return false
    }

    if (
      (tileId === '+' && (previousValue === '-' || nextValue === '-')) ||
      (tileId === '-' && (previousValue === '+' || nextValue === '+'))
    ) {
      return false
    }

    return true
  }

  private equationTokensCanBeValid(
    sectionId: string,
    placementsOverride?: Record<string, TileId | null>,
  ): boolean {
    const values = this.equationDisplayParts(sectionId).map((part) =>
      this.equationPartValue(sectionId, part, placementsOverride),
    )
    const equalsIndexes = values
      .map((value, index) => (value === '=' ? index : -1))
      .filter((index) => index >= 0)

    if (equalsIndexes.length > 1) {
      return false
    }

    if (!this.equationCanStillContainEquals(sectionId, values)) {
      return false
    }

    for (const equalsIndex of equalsIndexes) {
      if (equalsIndex === 0 || equalsIndex === values.length - 1) {
        return false
      }
    }

    if (!this.equationCanSatisfyVariablePairs(values)) {
      return false
    }

    for (const equalsIndex of equalsIndexes) {
      const leftValues = values.slice(0, equalsIndex)
      const rightValues = values.slice(equalsIndex + 1)

      if (
        this.valuesFormSolvedOutputVariable(leftValues) &&
        rightValues.some((value) => this.valueIsOutputVariable(value))
      ) {
        return false
      }
    }

    for (let index = 0; index < values.length; index += 1) {
      const value = values[index]

      if (value === 'sin' && !this.sinArgumentCanBeValid(values, index)) {
        return false
      }

      if (value === ')' && this.valueCannotPrecedeRightParenthesis(values[index - 1])) {
        return false
      }

      if (values[index + 1] === ')' && this.valueCannotPrecedeRightParenthesis(value)) {
        return false
      }

      if (!value || !this.valueIsEquationOperator(value)) {
        continue
      }

      const previous = values[index - 1]
      const next = values[index + 1]
      const unarySign = this.valueIsUnarySign(values, index)

      if (unarySign && !this.valueCanStartUnaryOperand(next)) {
        return false
      }

      if ((value === '^' || value === '=') && (index === 0 || index === values.length - 1)) {
        return false
      }

      if (
        (value === '^' || value === '=') &&
        (this.valueIsEquationOperator(previous) ||
          (this.valueIsEquationOperator(next) && !this.valueIsUnarySign(values, index + 1)))
      ) {
        return false
      }

      if (!unarySign && ['+', '/', '^', '='].includes(value) && this.valueIsEquationOperator(previous)) {
        return false
      }

      if (!unarySign && value === '+' && this.valueIsEquationOperator(next)) {
        return false
      }
    }

    return true
  }

  private equationCanStillContainEquals(
    sectionId: string,
    values: Array<string | null>,
  ): boolean {
    if (!this.usesCustomEquationDisplay(sectionId) || values.includes('=')) {
      return true
    }

    const section = this.sectionById.get(sectionId)
    if (!section || !this.tileAllowedForSection(sectionId, '=')) {
      return false
    }

    const parts = this.equationDisplayParts(sectionId)
    return parts.some((part, index) => {
      if (
        part.type !== 'slot' ||
        values[index] !== null ||
        index === 0 ||
        index === values.length - 1
      ) {
        return false
      }

      const slot = section.slots.find((candidate) => candidate.id === part.slotId)
      if (!slot?.allowedTiles.includes('=')) {
        return false
      }

      const previous = values[index - 1]
      const next = values[index + 1]
      const valuesWithEquals = [...values]
      valuesWithEquals[index] = '='

      return (
        !this.valueIsEquationOperator(previous) &&
        (!this.valueIsEquationOperator(next) || this.valueIsUnarySign(valuesWithEquals, index + 1))
      )
    })
  }

  private equationCanSatisfyVariablePairs(values: Array<string | null>): boolean {
    const relevantValues = this.valuesWithoutSolvedOutputVariable(values)
    const hasEmptySlot = relevantValues.some((value) => value === null)
    const hasX = relevantValues.some((value) => value === 'x')
    const hasY = relevantValues.some((value) => value === 'y')
    const hasTheta = relevantValues.some((value) => this.valueIsTheta(value))
    const hasR = relevantValues.some((value) => value === 'r')

    if (hasY && !hasX && !hasEmptySlot) {
      return false
    }

    if (hasR && !hasTheta && !hasEmptySlot) {
      return false
    }

    return true
  }

  private valuesWithoutSolvedOutputVariable(values: Array<string | null>): Array<string | null> {
    const equalsIndex = values.indexOf('=')
    if (equalsIndex <= 0) {
      return values
    }

    const leftValues = values.slice(0, equalsIndex).filter((value): value is string => Boolean(value))
    const leftIsOutput =
      (leftValues.length === 1 && (leftValues[0] === 'y' || leftValues[0] === 'r')) ||
      (leftValues.length === 2 &&
        this.valueIsNumberText(leftValues[0]) &&
        (leftValues[1] === 'y' || leftValues[1] === 'r'))

    return leftIsOutput ? values.slice(equalsIndex + 1) : values
  }

  private valuesFormSolvedOutputVariable(values: Array<string | null>): boolean {
    if (values.some((value) => value === null)) {
      return false
    }

    return (
      (values.length === 1 && this.valueIsOutputVariable(values[0])) ||
      (values.length === 2 && this.valueIsNumberText(values[0]) && this.valueIsOutputVariable(values[1]))
    )
  }

  private valueIsOutputVariable(value: string | null | undefined): boolean {
    return value === 'y' || value === 'r'
  }

  private valueIsNumberText(value: string | null | undefined): boolean {
    return Boolean(value && /^-?\d+(?:\.\d+)?$/.test(value))
  }

  private valueIsTheta(value: string | null | undefined): boolean {
    return value === 'θ' || value === 'Θ' || value === 'theta'
  }

  private valueIsVariable(value: string | null | undefined): boolean {
    return value === 'x' || value === 'y' || value === 'r' || this.valueIsTheta(value)
  }

  private valueIsEquationOperator(value: string | null | undefined): boolean {
    return Boolean(value && ['+', '-', '/', '^', '='].includes(value))
  }

  private valueIsUnarySign(values: Array<string | null>, index: number): boolean {
    const value = values[index]
    if (value !== '+' && value !== '-') {
      return false
    }

    const previous = values[index - 1]
    return previous === '='
  }

  private valueCanStartUnaryOperand(value: string | null | undefined): boolean {
    if (value === null) {
      return true
    }

    if (!value) {
      return false
    }

    return (
      value === '(' ||
      value === 'sin' ||
      value === 'π' ||
      this.valueIsVariable(value) ||
      this.valueIsNumberText(value)
    )
  }

  private valueCannotPrecedeRightParenthesis(value: string | null | undefined): boolean {
    return (
      value === '(' ||
      value === 'sin' ||
      value === '+' ||
      value === '-' ||
      value === '/' ||
      value === '^' ||
      value === '='
    )
  }

  private sinArgumentCanBeValid(values: Array<string | null>, sinIndex: number): boolean {
    const next = values[sinIndex + 1]

    if (next === null || next === '(') {
      return true
    }

    if (!next) {
      return false
    }

    if (next === '+' || next === '-') {
      const operand = values[sinIndex + 2]
      return operand === null || this.valueCanStartSinArgument(operand)
    }

    return this.valueCanStartSinArgument(next)
  }

  private valueCanStartSinArgument(value: string | null | undefined): boolean {
    if (value === null) {
      return true
    }

    if (!value) {
      return false
    }

    return (
      value === '(' ||
      value === 'π' ||
      value === 'x' ||
      value === 'y' ||
      value === 'r' ||
      this.valueIsTheta(value) ||
      this.valueIsNumberText(value)
    )
  }

  private setActiveSection(sectionId: string): void {
    if (this.activeSectionId === sectionId) {
      return
    }

    this.activeSectionId = sectionId
    this.saveProgress()
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

  private unlockScrollSourceSectionId(): string | null {
    for (const section of this.sections) {
      const runtime = this.sectionRuntimes.get(section.id)
      if (!runtime?.animating || !runtime.animatingGoalId || runtime.fuseCameraProgress <= 0) {
        continue
      }

      const goal = section.goals.find((candidate) => candidate.id === runtime.animatingGoalId)
      if (goal?.unlocks.length) {
        return section.id
      }
    }

    return null
  }

  private syncTileFocusSelection(): void {
    const unlockScrollSourceId = this.unlockScrollSourceSectionId()
    const sectionId = this.tileFocusSectionId

    if (sectionId && (!this.unlockedSections.has(sectionId) || sectionId === unlockScrollSourceId)) {
      this.tileFocusSectionId = null
    }

    if (this.tileFocusSectionId && this.sectionVisibleRatio(this.tileFocusSectionId) <= 0.2) {
      this.tileFocusSectionId = null
    }

    if (this.tileFocusSectionId) {
      return
    }

    if (unlockScrollSourceId) {
      return
    }

    const visibleSections = [...this.unlockedSections].filter(
      (candidateId) => this.sectionVisibleRatio(candidateId) > 0.2,
    )

    if (visibleSections.length === 1) {
      this.tileFocusSectionId = visibleSections[0]
    }
  }

  private sectionVisibleRatio(sectionId: string): number {
    const rect = this.boardRect(sectionId)
    const totalArea = rect.width * rect.height
    if (totalArea <= 0) {
      return 0
    }

    const visibleArea = rectIntersectionArea(rect, {
      x: 0,
      y: 0,
      width: this.layout.width,
      height: this.layout.height,
    })

    return visibleArea / totalArea
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

  private zoomButtonAction(): 'in' | 'out' {
    const distanceToMin = Math.abs(this.zoomLevel - MIN_ZOOM_LEVEL)
    const distanceToMax = Math.abs(MAX_ZOOM_LEVEL - this.zoomLevel)
    return distanceToMin >= distanceToMax ? 'out' : 'in'
  }

  private syncZoomButton(): void {
    const action = this.zoomButtonAction()
    const label = action === 'out' ? 'Zoom all the way out' : 'Zoom all the way in'
    this.zoomButton.classList.toggle('zoom-control__button--out', action === 'out')
    this.zoomButton.classList.toggle('zoom-control__button--in', action === 'in')
    this.zoomButton.setAttribute('aria-label', label)
    this.zoomButton.title = label
  }

  private handleZoomButtonClick = (): void => {
    const action = this.zoomButtonAction()
    const targetZoomLevel = action === 'out' ? MIN_ZOOM_LEVEL : MAX_ZOOM_LEVEL
    this.moveCameraAndScaleTo(
      { ...this.camera },
      this.layout.baseWorldScale * targetZoomLevel,
      true,
      0,
      this.layout.worldCenter,
    )
    this.syncZoomButton()
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
    return this.trayTileRectsFor(this.activeTileIds())
  }

  private trayTileRectsFor(available: TileId[]): Array<{ tileId: TileId; rect: Rect }> {
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

  private tileUnlockTargetRect(tileId: TileId): Rect {
    const current = this.trayTileRects().find((candidate) => candidate.tileId === tileId)
    if (current) {
      return current.rect
    }

    const futureTiles = [...this.activeTileIds(), tileId]
    return this.trayTileRectsFor(futureTiles).find((candidate) => candidate.tileId === tileId)?.rect ?? {
      x: this.layout.width / 2 - this.layout.tileSize / 2,
      y: this.layout.trayY,
      width: this.layout.tileSize,
      height: this.layout.tileSize,
    }
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
      const scriptSlotSize = tokenSize * EQUATION_SCRIPT_SLOT_SCALE
      return {
        width:
          part.type === 'slot'
            ? scriptSlotSize
            : Math.max(fontSize * 0.9, Math.min(tokenSize * 0.72, value.length * fontSize * 0.9)),
        height: part.type === 'slot' ? scriptSlotSize : tokenSize,
        yOffset: -tokenSize * 0.34,
      }
    }

    if (style === 'subscript') {
      const scriptSlotSize = tokenSize * EQUATION_SCRIPT_SLOT_SCALE
      return {
        width:
          part.type === 'slot'
            ? scriptSlotSize
            : Math.max(fontSize * 0.9, Math.min(tokenSize * 0.72, value.length * fontSize * 0.9)),
        height: part.type === 'slot' ? scriptSlotSize : tokenSize,
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

  private equationLayoutValue(sectionId: string, layout: TokenLayout): string | null {
    return this.equationPartValue(sectionId, layout.part)
  }

  private bareFunctionPrimaryEnd(
    values: Array<string | null>,
    tokenLayouts: TokenLayout[],
    index: number,
  ): number | null {
    const value = values[index]

    if (!value || value === '(') {
      return null
    }

    if (value === 'sin') {
      return this.inferredBareFunctionArgumentRange(values, tokenLayouts, index)?.endIndex ?? null
    }

    return this.valueCanStartUnaryOperand(value) ? index : null
  }

  private bareFunctionUnaryEnd(
    values: Array<string | null>,
    tokenLayouts: TokenLayout[],
    startIndex: number,
  ): number | null {
    let index = startIndex

    while (values[index] === '+' || values[index] === '-') {
      index += 1
    }

    return this.bareFunctionPrimaryEnd(values, tokenLayouts, index)
  }

  private inferredBareFunctionArgumentRange(
    values: Array<string | null>,
    tokenLayouts: TokenLayout[],
    functionIndex: number,
  ): InferredFunctionParens | null {
    const startIndex = functionIndex + 1
    const firstValue = values[startIndex]

    if (!firstValue || firstValue === '(') {
      return null
    }

    if (firstValue === '+' || firstValue === '-') {
      const endIndex = this.bareFunctionUnaryEnd(values, tokenLayouts, startIndex + 1)
      return endIndex === null ? null : { startIndex, endIndex }
    }

    const endIndex = this.bareFunctionUnaryEnd(values, tokenLayouts, startIndex)
    return endIndex === null ? null : { startIndex, endIndex }
  }

  private inferredFunctionParens(sectionId: string, tokenLayouts: TokenLayout[]): InferredFunctionParens[] {
    if (this.usesCustomEquationDisplay(sectionId)) {
      return []
    }

    const values = tokenLayouts.map((layout) => this.equationLayoutValue(sectionId, layout))
    const ranges: InferredFunctionParens[] = []

    values.forEach((value, index) => {
      if (value !== 'sin') {
        return
      }

      const range = this.inferredBareFunctionArgumentRange(values, tokenLayouts, index)
      if (range) {
        ranges.push(range)
      }
    })

    return ranges
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

  private slotRect(slotId: string, sectionId = this.activeSectionId): Rect | null {
    const token = this.tokenLayouts(sectionId).find(
      (layout) => layout.part.type === 'slot' && layout.part.slotId === slotId,
    )

    return token?.rect ?? null
  }

  private slottedTileRect(slotId: string, sectionId = this.activeSectionId): Rect | null {
    const rect = this.slotRect(slotId, sectionId)
    if (!rect) {
      return null
    }

    const insetX = Math.max(0.5, this.layout.worldScale * 0.45)
    const insetY = Math.max(0.75, this.layout.worldScale * 0.7)
    return {
      x: rect.x + insetX,
      y: rect.y + insetY,
      width: rect.width - insetX * 2,
      height: rect.height - insetY * 2,
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

    if (!section) {
      return []
    }

    const existingSlotId = this.slotIdUsingTile(sectionId, tileId)
    const ignoredSlotIds = existingSlotId ? [existingSlotId] : []

    return section.slots
      .map((slot) => slot.id)
      .filter((slotId) => this.tileAllowedInSlot(sectionId, slotId, tileId, ignoredSlotIds))
  }

  private compatibleSlots(tileId: TileId): string[] {
    return this.compatibleSlotsForSection(this.activeSectionId, tileId)
  }

  private focusTilesOnSection(sectionId: string): void {
    if (this.tileFocusSectionId === sectionId) {
      return
    }

    this.tileFocusSectionId = sectionId
    this.saveProgress()
  }

  private tileCanStillBePlacedInFocusedPuzzle(tileId: TileId): boolean {
    const sectionId = this.tileFocusSectionId
    const section = sectionId ? this.sectionById.get(sectionId) : null
    const runtime = sectionId ? this.sectionRuntimes.get(sectionId) : null

    if (!sectionId || !section || !runtime) {
      return true
    }

    if (!this.tileAllowedForSection(sectionId, tileId)) {
      return false
    }

    if (this.slotIdUsingTile(sectionId, tileId)) {
      return false
    }

    return section.slots.some((slot) => this.tileAllowedInSlot(sectionId, slot.id, tileId))
  }

  private trayTileDimmed(tileId: TileId): boolean {
    if (!this.tileFocusSectionId) {
      return false
    }

    return !this.tileCanStillBePlacedInFocusedPuzzle(tileId)
  }

  private nearestOverlappingSlot(tileId: TileId, tileRect: Rect): string | null {
    const tileCenter = this.rectCenter(tileRect)
    let bestSlotId: string | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const slotId of this.compatibleSlots(tileId)) {
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

  private connectorRouteKey(sectionId: string, goalId: string): string {
    return `${sectionId}:${goalId}`
  }

  private clearConnectorRouteCacheForSection(sectionId: string): void {
    for (const key of this.connectorRouteWorldCache.keys()) {
      if (key.startsWith(`${sectionId}:`)) {
        this.connectorRouteWorldCache.delete(key)
      }
    }
  }

  private inspectedGoalKey(): string | null {
    return this.hoveredGoalKey ?? this.pinnedGoalKey
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
    if (goal.target) {
      return distanceBetween(goal.target, hit.point) <= GOAL_TARGET_TOLERANCE
    }

    if (!hit.edges.includes(goal.edge)) {
      return false
    }

    const coordinate = goal.edge === 'top' || goal.edge === 'bottom' ? hit.point.x : hit.point.y
    return coordinate >= goal.min - GOAL_EPSILON && coordinate <= goal.max + GOAL_EPSILON
  }

  private goalHit(sectionId: string, goal: GoalDefinition): PlotPoint | null {
    const runtime = this.sectionRuntimes.get(sectionId)
    const terminalPoint = runtime?.plotResult?.points.at(-1)
    const hits = runtime?.plotResult?.hits ?? []

    if (goal.target && runtime?.plotResult?.achievedGoalIds.includes(goal.id)) {
      return goal.target
    }

    if (terminalPoint) {
      for (const hit of hits) {
        if (
          Math.abs(hit.point.x - terminalPoint.x) <= GOAL_EPSILON &&
          Math.abs(hit.point.y - terminalPoint.y) <= GOAL_EPSILON &&
          this.goalMatchesHit(goal, hit)
        ) {
          return terminalPoint
        }
      }
    }

    for (let index = hits.length - 1; index >= 0; index -= 1) {
      const hit = hits[index]
      if (this.goalMatchesHit(goal, hit)) {
        return hit.point
      }
    }

    return null
  }

  private defaultGoalPoint(sectionId: string, goal: GoalDefinition): PlotPoint {
    if (goal.target) {
      return goal.target
    }

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

    return this.boardOutsidePointToward(sectionId, targetId)
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

  private goalVisualScale(boosted: boolean): number {
    if (!boosted) {
      return 1
    }

    const zoomOutProgress = clamp(
      (MAX_ZOOM_LEVEL - this.zoomLevel) / (MAX_ZOOM_LEVEL - MIN_ZOOM_LEVEL),
      0,
      1,
    )

    if (zoomOutProgress <= GOAL_VISUAL_BOOST_START_ZOOM_OUT) {
      return 1
    }

    const boostProgress =
      (zoomOutProgress - GOAL_VISUAL_BOOST_START_ZOOM_OUT) /
      (1 - GOAL_VISUAL_BOOST_START_ZOOM_OUT)
    const boostStartScreenScale = lerp(
      MAX_ZOOM_LEVEL,
      MIN_ZOOM_LEVEL,
      GOAL_VISUAL_BOOST_START_ZOOM_OUT,
    )
    const targetScreenScale = lerp(
      boostStartScreenScale,
      GOAL_VISUAL_MAX_SCREEN_SCALE,
      smoothStep(boostProgress),
    )

    return Math.max(1, targetScreenScale / Math.max(this.zoomLevel, MIN_ZOOM_LEVEL))
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
      if (!this.unlockedSections.has(section.id)) {
        continue
      }

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

  private updateHoveredTrayTile(point: Point | null): boolean {
    const nextTileId = point
      ? (this.trayTileRects().find(({ rect }) => pointInRect(point, rect))?.tileId ?? null)
      : null

    if (nextTileId === this.hoveredTrayTileId) {
      return false
    }

    this.hoveredTrayTileId = nextTileId
    return true
  }

  private clearPinnedGoalSelection(): boolean {
    if (!this.pinnedGoalKey && !this.hoveredGoalKey) {
      return false
    }

    this.pinnedGoalKey = null
    this.hoveredGoalKey = null
    return true
  }

  private formatGoalAxisLabel(value: number): string {
    const rounded = Math.abs(value) < 0.05 ? 0 : Number(value.toFixed(1))
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }

  private drawGoalAxisGuides(
    sectionId: string,
    goal: GoalDefinition,
  ): void {
    const graph = this.graphRect(sectionId)
    const axes = this.sectionAxes(sectionId)
    const xAxisY =
      axes.y.min <= 0 && axes.y.max >= 0
        ? this.graphValueToScreenY(sectionId, 0)
        : graph.y + graph.height
    const yAxisX =
      axes.x.min <= 0 && axes.x.max >= 0 ? this.graphValueToScreenX(sectionId, 0) : graph.x
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

    this.drawGuideLabel(xLabel, x, xAxisY + majorTick * 0.7, 'center', 'top', labelColor)
    this.drawGuideLabel(yLabel, yAxisX - minorTick * 0.9, y, 'right', 'middle', labelColor)
  }

  private drawGuideLabel(
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign,
    baseline: CanvasTextBaseline,
    color: string,
  ): void {
    const context = this.context
    const fontSize = Math.round(GOAL_GUIDE_LABEL_SIZE * this.layout.worldScale)
    const paddingX = Math.max(5, 5 * this.layout.worldScale)
    const paddingY = Math.max(3, 3 * this.layout.worldScale)

    context.save()
    context.font = `${fontSize}px 'Short Stack', cursive`
    context.textAlign = align
    context.textBaseline = baseline

    const metrics = context.measureText(text)
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.75
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25
    const width = metrics.width
    let left = x
    if (align === 'center') {
      left -= width / 2
    } else if (align === 'right' || align === 'end') {
      left -= width
    }

    let top = y
    if (baseline === 'middle') {
      top -= (ascent + descent) / 2
    } else if (baseline === 'bottom' || baseline === 'alphabetic') {
      top -= ascent
    }

    const rect = {
      x: left - paddingX,
      y: top - paddingY,
      width: width + paddingX * 2,
      height: ascent + descent + paddingY * 2,
    }

    context.shadowColor = 'rgba(70, 55, 36, 0.22)'
    context.shadowBlur = 12
    context.shadowOffsetY = 3
    roundRectPath(context, rect, Math.max(5, rect.height * 0.28))
    context.fillStyle = 'rgba(255, 253, 247, 0.96)'
    context.fill()
    context.shadowColor = 'transparent'
    context.strokeStyle = mixColors(color, '#ffffff', 0.08, 0.95)
    context.lineWidth = Math.max(1, 1.25 * this.layout.worldScale)
    context.stroke()
    context.fillStyle = color
    context.fillText(text, x, y)
    context.restore()
  }

  private drawInspectedGoalOverlay(): void {
    const key = this.inspectedGoalKey()
    if (!key) {
      return
    }

    const separatorIndex = key.indexOf(':')
    if (separatorIndex < 0) {
      return
    }

    const sectionId = key.slice(0, separatorIndex)
    const goalId = key.slice(separatorIndex + 1)
    const goal = this.sectionById.get(sectionId)?.goals.find((candidate) => candidate.id === goalId)
    if (!goal) {
      return
    }

    this.drawGoalAxisGuides(sectionId, goal)
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

  private boardOutsidePointToward(sectionId: string, targetId: string): Point {
    const sourceRect = this.boardRect(sectionId)
    const sourceCenter = this.rectCenter(sourceRect)
    const targetCenter = this.rectCenter(this.boardRect(targetId))
    const offset = 42 * this.layout.worldScale

    return this.rectOutsidePointToward(sourceRect, sourceCenter, targetCenter, offset)
  }

  private boardOutsidePointFrom(sectionId: string, sourceId: string): Point {
    const targetRect = this.boardRect(sectionId)
    const targetCenter = this.rectCenter(targetRect)
    const sourceCenter = this.rectCenter(this.boardRect(sourceId))
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
    const boardObstacles = this.sections
      .filter((section) => !ignoredIds.has(section.id))
      .map((section) => ({ id: `board:${section.id}`, rect: this.boardRect(section.id) }))

    const goalObstacles = this.sections
      .filter((section) => !ignoredIds.has(section.id))
      .flatMap((section) =>
        section.goals
          .filter((goal) => !ignoredGoalKeys.has(`${section.id}:${goal.id}`))
          .map((goal) => ({
            id: `goal:${section.id}:${goal.id}`,
            rect: this.goalShapeRect(section.id, goal),
          })),
      )

    return [...boardObstacles, ...goalObstacles]
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
    const targetPoint = this.boardOutsidePointFrom(targetId, sourceId)
    const routed = this.routedConnectorPoints(
      [sourcePoint, targetPoint],
      new Set<string>([sourceId, targetId]),
      ignoredGoalKeys,
    )
    return simplifyConnectorPoints(routed)
  }

  private goalConnectionPoints(sectionId: string, goal: GoalDefinition): Point[] {
    const targetId = goal.unlocks[0]
    if (!targetId) {
      return []
    }

    const cacheKey = this.connectorRouteKey(sectionId, goal.id)
    const cachedWorldRoute = this.connectorRouteWorldCache.get(cacheKey)
    if (cachedWorldRoute) {
      return cachedWorldRoute.map((point) => this.worldToScreen(point))
    }

    const route = this.goalRoutePoints(sectionId, goal)

    if (route.length === 0) {
      return route
    }

    const bridge = this.targetConnectionPoints(
      route[route.length - 1],
      sectionId,
      targetId,
      new Set<string>([`${sectionId}:${goal.id}`]),
    )
    const connection = simplifyConnectorPoints([route[0], ...bridge])
    this.connectorRouteWorldCache.set(
      cacheKey,
      connection.map((point) => this.screenToWorld(point)),
    )
    return connection
  }

  private followAnimatingGoalCamera(sectionId: string, goalId: string | null, progress: number): void {
    if (!goalId) {
      return
    }

    const section = this.sectionById.get(sectionId)
    const goal = section?.goals.find((candidate) => candidate.id === goalId)
    const targetSectionId = this.firstNewSectionUnlockId(goal)
    const extraContentRects = targetSectionId ? [this.boardWorldRect(targetSectionId)] : []
    const runtime = this.sectionRuntimes.get(sectionId)
    const from = runtime?.fuseCameraFrom
    const to = runtime?.fuseCameraTo
    const fromScale = runtime?.fuseCameraFromScale
    const toScale = runtime?.fuseCameraToScale

    if (!runtime || !from || !to || fromScale === null || toScale === null) {
      return
    }

    this.cameraTween = null
    const eased = easeInOutCubic(clamp(progress, 0, 1))
    const startScale = fromScale ?? this.layout.worldScale
    const endScale = toScale ?? startScale
    this.layout.worldScale = lerp(startScale, endScale, eased)
    this.zoomLevel = this.layout.worldScale / this.layout.baseWorldScale
    this.camera = this.constrainedCamera({
      x: lerp(from.x, to.x, eased),
      y: lerp(from.y, to.y, eased),
    }, extraContentRects)
  }

  private firstNewSectionUnlockId(goal: GoalDefinition | null | undefined): string | null {
    return goal?.unlocks.find((unlockId) => !this.unlockedSections.has(unlockId)) ?? null
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

    this.clearConnectorRouteCacheForSection(sectionId)
    const result = evaluateSectionPlot(section, runtime.placements)
    runtime.plotResult = result
    runtime.pendingGoalIds = result?.achievedGoalIds ?? []
    runtime.animatingGoalId =
      result?.achievedGoalIds.find((goalId) => !this.completedGoals.has(`${sectionId}:${goalId}`)) ??
      null
    runtime.targetFillProgress = 0
    runtime.targetCelebrationProgress = 0
    runtime.targetCelebrationQueued = false
    runtime.fuseProgress = 0
    runtime.fuseCameraProgress = 0
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null
    runtime.fuseCameraFromScale = null
    runtime.fuseCameraToScale = null
    runtime.targetHitSoundPlayed = false
    runtime.unlockRouteSoundPlayed = false

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
      const targetSectionId = this.firstNewSectionUnlockId(goal)
      runtime.fuseCameraFrom = { ...this.camera }
      runtime.fuseCameraFromScale = this.layout.worldScale
      if (targetSectionId) {
        const focus = this.sectionComfortableFocus(targetSectionId)
        runtime.fuseCameraTo = focus.camera
        runtime.fuseCameraToScale = focus.scale
      } else {
        runtime.fuseCameraTo = { ...this.camera }
        runtime.fuseCameraToScale = this.layout.worldScale
      }
    }

    runtime.plotProgress = animated ? 0 : 1
    runtime.targetFillProgress = !animated && runtime.animatingGoalId ? 1 : 0
    runtime.targetCelebrationProgress = !animated && runtime.animatingGoalId ? 1 : 0
    runtime.targetCelebrationQueued = false
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

  private finalizeGoals(sectionId: string, clearSourceSelectionForUnlock = false): void {
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

    const newGoalsUnlockSection = newGoals.some((goalId) => {
      const goal = section.goals.find((candidate) => candidate.id === goalId)
      return Boolean(this.firstNewSectionUnlockId(goal))
    })

    const newlyUnlockedSections = this.unlockSectionsForGoals(sectionId, newGoals)
    const newlyUnlockedTiles: TileId[] = []
    for (const goalId of newGoals) {
      const goal = section.goals.find((candidate) => candidate.id === goalId)
      if (!goal?.rewardTileId || this.unlockedTiles.has(goal.rewardTileId)) {
        continue
      }

      this.unlockedTiles.add(goal.rewardTileId)
      newlyUnlockedTiles.push(goal.rewardTileId)
      this.queueTileUnlock(
        goal.rewardTileId,
        this.goalShapeCenter(sectionId, goal),
        this.goalColor(sectionId, goal),
      )
      this.audio.play('tile-unlock')
    }

    runtime.solvedGoalIds = section.goals
      .filter((goal) => this.completedGoals.has(`${sectionId}:${goal.id}`))
      .map((goal) => goal.id)
    runtime.animating = false
    runtime.animatingGoalId = null
    runtime.plotProgress = runtime.plotResult.hasVisiblePath ? 1 : 0
    runtime.targetFillProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.targetFillProgress
    runtime.targetCelebrationProgress =
      runtime.pendingGoalIds.length > 0 ? 1 : runtime.targetCelebrationProgress
    runtime.targetCelebrationQueued = false
    runtime.fuseProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.fuseProgress
    runtime.fuseCameraProgress = runtime.pendingGoalIds.length > 0 ? 1 : runtime.fuseCameraProgress
    runtime.fuseCameraFrom = null
    runtime.fuseCameraTo = null
    runtime.fuseCameraFromScale = null
    runtime.fuseCameraToScale = null

    if (runtime.solvedGoalIds.length === section.goals.length && !this.completedSections.has(sectionId)) {
      this.completedSections.add(sectionId)

      if (section.rewardTileId) {
        const newlyUnlockedRewardTile = !this.unlockedTiles.has(section.rewardTileId)
        this.unlockedTiles.add(section.rewardTileId)
        if (newlyUnlockedRewardTile) {
          const sourceGoal = newGoals
            .map((goalId) => section.goals.find((candidate) => candidate.id === goalId) ?? null)
            .find((goal): goal is GoalDefinition => goal !== null)
          this.queueTileUnlock(
            section.rewardTileId,
            sourceGoal
              ? this.goalShapeCenter(sectionId, sourceGoal)
              : this.rectCenter(this.graphRect(sectionId)),
            sourceGoal ? this.goalColor(sectionId, sourceGoal) : section.accent,
          )
          this.audio.play('tile-unlock')
        }
        runtime.statusMessage = `tile-${section.rewardTileId}-unlocked`
      } else if (newlyUnlockedTiles.length > 0) {
        runtime.statusMessage = `tile-${newlyUnlockedTiles.at(-1)}-unlocked`
      } else if (newlyUnlockedSections.length > 0) {
        runtime.statusMessage = `unlock-${newlyUnlockedSections[0]}`
      } else {
        runtime.statusMessage = `${sectionId}-completed`
      }
      this.queueGraphComplete(sectionId)
      this.audio.play('graph-complete')
    } else if (newlyUnlockedTiles.length > 0) {
      runtime.statusMessage = `tile-${newlyUnlockedTiles.at(-1)}-unlocked`
    } else if (newlyUnlockedSections.length > 0) {
      runtime.statusMessage = `unlock-${newlyUnlockedSections[0]}`
    }

    if (clearSourceSelectionForUnlock && newGoalsUnlockSection && this.tileFocusSectionId === sectionId) {
      this.tileFocusSectionId = null
    }

    this.statusMessage = runtime.statusMessage
    this.saveProgress()
    this.updateVictoryState(true)
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
    const existingSlotId = this.slotIdUsingTile(this.activeSectionId, tileId)
    const ignoredSlotIds = existingSlotId ? [existingSlotId] : []
    const replacingDifferentTile =
      this.activeRuntime.placements[slotId] !== null &&
      this.activeRuntime.placements[slotId] !== tileId

    if (
      !slot ||
      !this.tileAllowedInSlot(this.activeSectionId, slotId, tileId, ignoredSlotIds)
    ) {
      this.audio.play('tile-invalid')
      return
    }

    if (existingSlotId && existingSlotId !== slotId) {
      this.activeRuntime.placements[existingSlotId] = null
    }

    this.activeRuntime.placements[slotId] = tileId
    this.selectedTileId = null
    this.focusTilesOnSection(this.activeSectionId)
    this.queueSlotSettle(this.activeSectionId, slotId)
    if (replacingDifferentTile) {
      this.queueSlotFlash(this.activeSectionId, slotId)
    }
    this.audio.play(replacingDifferentTile ? 'tile-replace' : 'tile-place')
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

  private stepTimedAnimations(deltaMs: number): boolean {
    let keepGoing = false

    const stepMap = <K,>(map: Map<K, number>, durationMs: number): void => {
      for (const [key, age] of map) {
        const nextAge = age + deltaMs
        if (nextAge >= durationMs) {
          map.delete(key)
        } else {
          map.set(key, nextAge)
          keepGoing = true
        }
      }
    }

    stepMap(this.slotSettleAnimations, TILE_SETTLE_DURATION_MS)
    stepMap(this.slotFlashAnimations, SLOT_FLASH_DURATION_MS)
    stepMap(this.trayArrivalAnimations, TRAY_ARRIVAL_DURATION_MS)
    stepMap(this.graphCompleteAnimations, GRAPH_COMPLETE_DURATION_MS)

    for (let index = this.tileUnlockAnimations.length - 1; index >= 0; index -= 1) {
      const animation = this.tileUnlockAnimations[index]
      animation.ageMs += deltaMs
      if (animation.ageMs >= TILE_UNLOCK_DURATION_MS) {
        this.tileUnlockAnimations.splice(index, 1)
      } else {
        keepGoing = true
      }
    }

    for (let index = this.rewardDoodles.length - 1; index >= 0; index -= 1) {
      const doodle = this.rewardDoodles[index]
      doodle.ageMs += deltaMs
      if (doodle.ageMs >= doodle.lifetimeMs) {
        this.rewardDoodles.splice(index, 1)
      } else {
        keepGoing = true
      }
    }

    for (let index = this.celebrationConfetti.length - 1; index >= 0; index -= 1) {
      const burst = this.celebrationConfetti[index]
      burst.ageMs += deltaMs
      if (burst.ageMs >= burst.lifetimeMs) {
        this.celebrationConfetti.splice(index, 1)
      } else {
        keepGoing = true
      }
    }

    for (let index = this.graphiteDust.length - 1; index >= 0; index -= 1) {
      const dust = this.graphiteDust[index]
      dust.ageMs += deltaMs
      if (dust.ageMs >= dust.lifetimeMs) {
        this.graphiteDust.splice(index, 1)
      } else {
        keepGoing = true
      }
    }

    return keepGoing
  }

  private step(deltaMs: number): boolean {
    let keepGoing = false

    keepGoing = this.stepTimedAnimations(deltaMs) || keepGoing

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
        if (!runtime.targetHitSoundPlayed) {
          this.audio.play('target-hit')
          this.previewRewardUnlocks(section.id, runtime.animatingGoalId)
          this.queueGoalRewardEffects(section.id, runtime.animatingGoalId)
          runtime.targetHitSoundPlayed = true
        }
        runtime.targetFillProgress = clamp(
          runtime.targetFillProgress + deltaMs / TARGET_FILL_DURATION_MS,
          0,
          1,
        )
        keepGoing = true

        if (runtime.targetFillProgress < 1) {
          continue
        }
      }

      if (runtime.animatingGoalId && runtime.targetCelebrationProgress < 1) {
        if (!runtime.targetCelebrationQueued) {
          this.queueGoalCelebration(section.id, runtime.animatingGoalId)
          runtime.targetCelebrationQueued = true
          runtime.statusMessage = 'celebrating'
          this.statusMessage = runtime.statusMessage
        }

        runtime.targetCelebrationProgress = clamp(
          runtime.targetCelebrationProgress + deltaMs / TARGET_CELEBRATION_DURATION_MS,
          0,
          1,
        )
        keepGoing = true

        if (runtime.targetCelebrationProgress < 1) {
          continue
        }
      }

      const animatingGoal = runtime.animatingGoalId
        ? section.goals.find((candidate) => candidate.id === runtime.animatingGoalId)
        : null
      const animatingGoalUnlocksPuzzle = Boolean(this.firstNewSectionUnlockId(animatingGoal))

      if (
        animatingGoalUnlocksPuzzle &&
        runtime.animatingGoalId &&
        (runtime.fuseProgress < 1 || runtime.fuseCameraProgress < 1)
      ) {
        const route = animatingGoal ? this.goalConnectionPoints(section.id, animatingGoal) : []
        const durationMs =
          route.length > 1 ? this.connectorDurationMs(section.id, route) : FUSE_DURATION_MS

        if (!runtime.unlockRouteSoundPlayed) {
          this.audio.play('puzzle-unlock')
          runtime.unlockRouteSoundPlayed = true
        }

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
      this.finalizeGoals(section.id, true)
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
    void this.audio.unlock()
    const point = this.getPointerPoint(event)

    if (this.victoryScreenVisible) {
      if (!pointInRect(point, this.victoryScreenRect())) {
        this.dismissVictoryScreen()
      }
      return
    }

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
      this.updateHoveredTrayTile(null)
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
      this.updateHoveredTrayTile(null)
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

    const clearedPinnedGoal = this.clearPinnedGoalSelection()

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
    const startedSectionId = this.sectionAtPoint(point)

    this.drag = {
      kind: 'pan',
      pointerId: event.pointerId,
      current: point,
      start: point,
      cameraStart: { ...this.camera },
      dragging: false,
      startedSectionId,
    }
    this.canvas.setPointerCapture(event.pointerId)
    if (clearedPinnedGoal) {
      this.render()
    }
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
      const hoverChanged = this.updateHoveredGoal(point) || this.updateHoveredTrayTile(point)
      if (hoverChanged) {
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
    const hoverChanged = this.updateHoveredGoal(null) || this.updateHoveredTrayTile(null)
    if (hoverChanged) {
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
      const hoverChanged = this.updateHoveredGoal(point) || this.updateHoveredTrayTile(point)
      if (hoverChanged) {
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
      const targetSlot = this.nearestOverlappingSlot(this.drag.tileId, draggedRect)

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
    this.updateHoveredTrayTile(point)
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
    this.updateHoveredTrayTile(null)
    this.render()
  }

  private handleWheel = (event: WheelEvent): void => {
    void this.audio.unlock()
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
    if (isTextEditingTarget(event.target)) {
      return
    }

    void this.audio.unlock()
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
    if (isTextEditingTarget(event.target)) {
      return
    }

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

  private drawBackgroundMoon(center: Point, size: number, seedKey: string): void {
    this.roughCanvas.arc(
      center.x,
      center.y,
      size * 0.82,
      size * 0.82,
      Math.PI * 0.18,
      Math.PI * 1.52,
      false,
      seeded(`${seedKey}:moon:outer`, {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.04),
        roughness: 1.35,
        bowing: 1,
      }),
    )
    this.roughCanvas.arc(
      center.x + size * 0.18,
      center.y - size * 0.02,
      size * 0.56,
      size * 0.74,
      Math.PI * 0.28,
      Math.PI * 1.45,
      false,
      seeded(`${seedKey}:moon:inner`, {
        stroke: this.backgroundSketchStroke(0.1),
        strokeWidth: this.backgroundSketchWidth(size, 0.032),
        roughness: 1.4,
        bowing: 1.1,
      }),
    )
  }

  private drawBackgroundPaperPlane(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.48, y: center.y - size * 0.04 },
        { x: center.x + size * 0.48, y: center.y - size * 0.34 },
        { x: center.x + size * 0.12, y: center.y + size * 0.42 },
        { x: center.x - size * 0.04, y: center.y + size * 0.12 },
        { x: center.x - size * 0.48, y: center.y - size * 0.04 },
      ],
      `${seedKey}:plane:body`,
      {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.038),
        roughness: 1.4,
        bowing: 1.1,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.04, y: center.y + size * 0.12 },
        { x: center.x + size * 0.48, y: center.y - size * 0.34 },
      ],
      `${seedKey}:plane:fold`,
      {
        stroke: this.backgroundSketchStroke(0.1),
        strokeWidth: this.backgroundSketchWidth(size, 0.03),
        roughness: 1.45,
        bowing: 1.15,
      },
    )
  }

  private drawBackgroundLadder(center: Point, size: number, seedKey: string): void {
    const leftTop = { x: center.x - size * 0.24, y: center.y - size * 0.48 }
    const leftBottom = { x: center.x - size * 0.34, y: center.y + size * 0.48 }
    const rightTop = { x: center.x + size * 0.24, y: center.y - size * 0.48 }
    const rightBottom = { x: center.x + size * 0.34, y: center.y + size * 0.48 }
    const stroke = this.backgroundSketchStroke(0.13)
    const strokeWidth = this.backgroundSketchWidth(size, 0.034)

    this.drawRoughPolyline([leftTop, leftBottom], `${seedKey}:ladder:left`, {
      stroke,
      strokeWidth,
      roughness: 1.4,
      bowing: 1.1,
    })
    this.drawRoughPolyline([rightTop, rightBottom], `${seedKey}:ladder:right`, {
      stroke,
      strokeWidth,
      roughness: 1.4,
      bowing: 1.1,
    })

    for (let rung = 0; rung < 4; rung += 1) {
      const progress = (rung + 0.5) / 4
      this.drawRoughPolyline(
        [
          { x: lerp(leftTop.x, leftBottom.x, progress), y: lerp(leftTop.y, leftBottom.y, progress) },
          { x: lerp(rightTop.x, rightBottom.x, progress), y: lerp(rightTop.y, rightBottom.y, progress) },
        ],
        `${seedKey}:ladder:rung:${rung}`,
        {
          stroke,
          strokeWidth,
          roughness: 1.45,
          bowing: 1.2,
        },
      )
    }
  }

  private drawBackgroundCrown(center: Point, size: number, seedKey: string): void {
    this.drawRoughPolyline(
      [
        { x: center.x - size * 0.44, y: center.y + size * 0.22 },
        { x: center.x - size * 0.34, y: center.y - size * 0.24 },
        { x: center.x - size * 0.1, y: center.y + size * 0.08 },
        { x: center.x, y: center.y - size * 0.36 },
        { x: center.x + size * 0.12, y: center.y + size * 0.08 },
        { x: center.x + size * 0.36, y: center.y - size * 0.22 },
        { x: center.x + size * 0.44, y: center.y + size * 0.22 },
        { x: center.x - size * 0.44, y: center.y + size * 0.22 },
      ],
      `${seedKey}:crown`,
      {
        stroke: this.backgroundSketchStroke(0.14),
        strokeWidth: this.backgroundSketchWidth(size, 0.038),
        roughness: 1.35,
        bowing: 1,
      },
    )
  }

  private drawBackgroundComet(center: Point, size: number, seedKey: string): void {
    this.drawBackgroundStar({ x: center.x + size * 0.28, y: center.y - size * 0.18 }, size * 0.74, `${seedKey}:comet:star`)
    this.drawRoughPolyline(
      [
        { x: center.x + size * 0.02, y: center.y },
        { x: center.x - size * 0.22, y: center.y + size * 0.12 },
        { x: center.x - size * 0.48, y: center.y + size * 0.16 },
      ],
      `${seedKey}:comet:tail-a`,
      {
        stroke: this.backgroundSketchStroke(0.1),
        strokeWidth: this.backgroundSketchWidth(size, 0.032),
        roughness: 1.55,
        bowing: 1.35,
      },
    )
    this.drawRoughPolyline(
      [
        { x: center.x + size * 0.04, y: center.y - size * 0.14 },
        { x: center.x - size * 0.18, y: center.y - size * 0.06 },
        { x: center.x - size * 0.42, y: center.y - size * 0.02 },
      ],
      `${seedKey}:comet:tail-b`,
      {
        stroke: this.backgroundSketchStroke(0.1),
        strokeWidth: this.backgroundSketchWidth(size, 0.028),
        roughness: 1.55,
        bowing: 1.35,
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
    if (kind === 'moon') {
      this.drawBackgroundMoon(center, size, seedKey)
      return
    }
    if (kind === 'plane') {
      this.drawBackgroundPaperPlane(center, size, seedKey)
      return
    }
    if (kind === 'ladder') {
      this.drawBackgroundLadder(center, size, seedKey)
      return
    }
    if (kind === 'crown') {
      this.drawBackgroundCrown(center, size, seedKey)
      return
    }
    if (kind === 'comet') {
      this.drawBackgroundComet(center, size, seedKey)
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
    const artKinds = ['flower', 'cloud', 'kite', 'leaf', 'boat', 'moon', 'plane', 'crown', 'comet'] as const
    const doodleKinds = ['arrow', 'smiley', 'spiral', 'squiggle', 'flower', 'ladder', 'plane', 'moon'] as const
    const markKinds = ['tick', 'underline', 'squiggle', 'cross'] as const

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
    const plotResult = runtime?.plotResult

    if (!plotResult || plotResult.points.length < 2) {
      return null
    }

    const plotSegments =
      plotResult.segments && plotResult.segments.length > 0
        ? plotResult.segments
        : [plotResult.points]
    const screenSegments = plotSegments
      .filter((segment) => segment.length > 1)
      .map((segment) => segment.map((point) => this.graphPointToScreen(sectionId, point)))
    const length = polylineSegmentsLength(screenSegments)

    if (length <= 0) {
      return null
    }

    return length / PLOT_DURATION_MS
  }

  private connectorDurationMs(sectionId: string, points: Point[]): number {
    const rendered = this.connectorRenderedPoints(points)
    const length = Math.max(polylineLength(rendered), 1)
    const plotSpeed = this.plotPixelsPerMs(sectionId)

    const speed = Math.max(plotSpeed ?? length / FUSE_DURATION_MS, MIN_CONNECTOR_DRAW_SPEED_PX_PER_MS)
    return clamp(length / speed, MIN_CONNECTOR_DURATION_MS, MAX_CONNECTOR_DURATION_MS)
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
    boosted = true,
  ): void {
    const color = colorOverride ?? this.goalColor(sectionId, goal)
    const center = this.goalShapeCenter(sectionId, goal)
    const visualScale = this.goalVisualScale(boosted)
    const size = 18 * this.layout.worldScale * visualScale
    const strokeWidth = Math.max(2.2, this.layout.worldScale * 2.15 * visualScale)
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
          strokeWidth,
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
          strokeWidth,
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
            strokeWidth,
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
          strokeWidth,
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
          strokeWidth,
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

  private drawInferredFunctionParens(sectionId: string, tokenLayouts: TokenLayout[]): void {
    const ranges = this.inferredFunctionParens(sectionId, tokenLayouts)
    if (ranges.length === 0) {
      return
    }

    const pad = Math.max(7 * this.layout.worldScale, EQUATION_FONT_SIZE * this.layout.worldScale * 0.24)

    this.context.save()
    this.context.lineCap = 'round'
    this.context.lineJoin = 'round'

    const traceParen = (x: number, top: number, bottom: number, side: 'left' | 'right') => {
      const height = bottom - top
      const width = Math.max(4.5 * this.layout.worldScale, height * 0.13)
      const direction = side === 'left' ? 1 : -1
      this.context.beginPath()
      this.context.moveTo(x + direction * width, top)
      this.context.bezierCurveTo(
        x - direction * width * 0.75,
        top + height * 0.18,
        x - direction * width * 0.75,
        bottom - height * 0.18,
        x + direction * width,
        bottom,
      )
      this.context.stroke()
    }

    for (const range of ranges) {
      const rangeLayouts = tokenLayouts.slice(range.startIndex, range.endIndex + 1)
      const start = tokenLayouts[range.startIndex]
      const end = tokenLayouts[range.endIndex]

      if (!start || !end || rangeLayouts.length === 0) {
        continue
      }

      const minY = Math.min(...rangeLayouts.map((layout) => layout.rect.y))
      const maxY = Math.max(...rangeLayouts.map((layout) => layout.rect.y + layout.rect.height))
      const top = minY - 4 * this.layout.worldScale
      const bottom = maxY + 4 * this.layout.worldScale

      const leftX = start.rect.x - pad
      const rightX = end.rect.x + end.rect.width + pad
      this.context.strokeStyle = 'rgba(246, 237, 223, 0.82)'
      this.context.lineWidth = Math.max(2.4, this.layout.worldScale * 3.2)
      traceParen(leftX, top, bottom, 'left')
      traceParen(rightX, top, bottom, 'right')
      this.context.strokeStyle = 'rgba(45, 38, 32, 0.9)'
      this.context.lineWidth = Math.max(1.15, this.layout.worldScale * 1.55)
      traceParen(leftX, top, bottom, 'left')
      traceParen(rightX, top, bottom, 'right')
    }

    this.context.restore()
  }

  private drawSlotReplacementFlash(rect: Rect, progress: number): void {
    const eased = easeOutCubic(1 - progress)
    const pad = 7 * this.layout.worldScale * eased
    const flashRect = {
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    }

    this.context.save()
    this.context.globalAlpha = 0.32 * eased
    fillRoundedRect(this.context, flashRect, rect.width * 0.26, 'rgba(238, 149, 87, 0.24)')
    this.context.strokeStyle = 'rgba(238, 149, 87, 0.72)'
    this.context.lineWidth = Math.max(1.2, 2.1 * this.layout.worldScale)
    roundRectPath(this.context, flashRect, rect.width * 0.26)
    this.context.stroke()
    this.context.restore()
  }

  private variableGlyph(value: string | null | undefined): string | null {
    if (value === 'x' || value === 'y' || value === 'r') {
      return value
    }

    if (this.valueIsTheta(value)) {
      return 'θ'
    }

    return null
  }

  private drawVariableGlyph(
    value: string,
    center: Point,
    fontSize: number,
    seedKey: string,
  ): boolean {
    const glyph = this.variableGlyph(value)
    if (!glyph) {
      return false
    }

    const wobble = (seededUnit(`variable-glyph:${seedKey}`) - 0.5) * 0.035

    const displayGlyph =
      glyph === 'x'
        ? '𝑥'
        : glyph === 'y'
          ? '𝑦'
          : glyph === 'r'
            ? '𝑟'
            : '𝜃'

    this.context.save()
    this.context.fillStyle = INK
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    this.context.font = `${Math.round(fontSize * 1.08)}px 'STIX Two Math', 'Cambria Math', Georgia, 'Times New Roman', serif`
    this.context.translate(center.x, center.y)
    this.context.rotate(-0.075 + wobble)

    if (glyph === 'x') {
      this.context.scale(1.08, 1)
    } else if (glyph === 'y') {
      this.context.translate(0, -fontSize * 0.02)
      this.context.scale(1.04, 1.04)
    } else if (glyph === 'r') {
      this.context.translate(fontSize * 0.03, fontSize * 0.01)
      this.context.scale(1.04, 1)
    } else {
      this.context.translate(0, fontSize * 0.02)
      this.context.scale(0.98, 1.05)
    }

    this.context.fillText(displayGlyph, 0, fontSize * 0.03)
    this.context.restore()
    return true
  }

  private drawEquationPrefixText(prefix: 'y' | 'r', x: number, y: number, fontSize: number): void {
    const variableWidth = fontSize * 0.56
    const gap = fontSize * 0.36
    this.drawVariableGlyph(prefix, { x: x + variableWidth / 2, y }, fontSize * 1.02, `prefix:${prefix}`)
    this.context.save()
    this.context.fillStyle = INK
    this.context.font = `${Math.round(fontSize)}px 'Short Stack', cursive`
    this.context.textBaseline = 'middle'
    this.context.fillText('=', x + variableWidth + gap, y)
    this.context.restore()
  }

  private drawEquationFixedToken(value: string, rect: Rect, seedKey: string): void {
    const fontSize = Math.round(EQUATION_FONT_SIZE * this.layout.worldScale)
    const center = {
      x: rect.x + rect.width / 2 - rect.width * 0.18,
      y: rect.y + rect.height / 2,
    }

    if (this.drawVariableGlyph(value, center, fontSize * 1.08, seedKey)) {
      return
    }

    this.context.font = `${fontSize}px 'Short Stack', cursive`
    this.context.fillText(value, center.x, center.y)
  }

  private drawTile(
    rect: Rect,
    tile: TileDefinition,
    active: boolean,
    seedKey: string,
    options: TileDrawOptions = {},
  ): void {
    const context = this.context
    const radius = rect.width * 0.22

    context.save()
    if (options.scale || options.rotation) {
      const centerX = rect.x + rect.width / 2
      const centerY = rect.y + rect.height / 2
      context.translate(centerX, centerY)
      context.rotate(options.rotation ?? 0)
      context.scale(options.scale ?? 1, options.scale ?? 1)
      context.translate(-centerX, -centerY)
    }
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

    if (active && options.showHighlight !== false) {
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
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    if (tile.role === 'variable') {
      this.drawVariableGlyph(
        tile.label,
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 + 1 },
        rect.height * 0.58,
        `tile:${seedKey}:label`,
      )
    } else {
      context.font = `${Math.round(rect.height * 0.46)}px 'Short Stack', cursive`
      context.fillText(tile.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1)
    }
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

    if (runtime.plotResult && runtime.plotResult.points.length > 1) {
      const progress = runtime.animating ? runtime.plotProgress : 1
      const plotSegments =
        runtime.plotResult.segments && runtime.plotResult.segments.length > 0
          ? runtime.plotResult.segments
          : [runtime.plotResult.points]
      const screenSegments = plotSegments
        .filter((segment) => segment.length > 1)
        .map((segment) => segment.map((point) => this.graphPointToScreen(sectionId, point)))
      const visibleSegments = progressivePolylineSegments(screenSegments, progress)

      for (const visiblePoints of visibleSegments) {
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
      this.drawEquationPrefixText(
        this.equationPrefix(sectionId),
        prefixX,
        equationY,
        EQUATION_FONT_SIZE * this.layout.worldScale,
      )
    }

    for (const token of tokenLayouts) {
      if (token.part.type === 'fixed') {
        this.drawEquationFixedToken(
          token.part.value,
          token.rect,
          `fixed:${sectionId}:${token.part.value}:${token.rect.x.toFixed(1)}`,
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
        const placedRect = this.slottedTileRect(token.part.slotId, sectionId) ?? token.rect
        const animationKey = this.slotAnimationKey(sectionId, token.part.slotId)
        const settleProgress = this.timedAnimationProgress(
          this.slotSettleAnimations,
          animationKey,
          TILE_SETTLE_DURATION_MS,
        )
        const flashProgress = this.timedAnimationProgress(
          this.slotFlashAnimations,
          animationKey,
          SLOT_FLASH_DURATION_MS,
        )
        const settle = settleProgress === null ? null : easeOutCubic(1 - settleProgress)

        if (flashProgress !== null) {
          this.drawSlotReplacementFlash(placedRect, flashProgress)
        }

        this.drawTile(
          {
            x: placedRect.x,
            y: placedRect.y - (settle ?? 0) * 5 * this.layout.worldScale,
            width: placedRect.width,
            height: placedRect.height,
          },
          TILE_DEFINITIONS[placedTileId],
          false,
          `slot:${sectionId}:${token.part.slotId}`,
          {
            scale: 1 + (settle ?? 0) * 0.075,
            rotation: Math.sin((settleProgress ?? 1) * Math.PI * 3) * 0.028 * (settle ?? 0),
          },
        )
        continue
      }

      this.drawEquationSlotPlaceholder(
        token.rect,
        slotState,
        `slot:${sectionId}:${token.part.slotId}`,
      )
    }
    this.drawInferredFunctionParens(sectionId, tokenLayouts)
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
        const boosted = unlocked && !solved && fillProgress < 0.999

        if (unlocked && !solved && fillProgress < 0.999) {
          this.drawGoalGlow(section.id, goal, color)
        }

        this.drawGoalShape(
          section.id,
          goal,
          alpha,
          fillProgress,
          color,
          boosted,
        )
      }
    }
  }

  private drawTray(): void {
    const activeTileId = this.drag?.kind === 'tile' ? this.drag.tileId : this.selectedTileId
    const draggedTileId = this.drag?.kind === 'tile' ? this.drag.tileId : null

    for (const { tileId, rect } of this.trayTileRects()) {
      const lifted = tileId === activeTileId && this.drag?.kind !== 'tile'
      const hovered = tileId === this.hoveredTrayTileId && this.drag?.kind !== 'tile'
      const dimmed = this.trayTileDimmed(tileId) && tileId !== draggedTileId
      const arrivalAge = this.trayArrivalAnimations.get(tileId)
      const arrivalProgress =
        arrivalAge === undefined ? null : clamp(arrivalAge / TRAY_ARRIVAL_DURATION_MS, 0, 1)
      const unlockProgress = this.tileUnlockProgress(tileId)
      const arrivalLift =
        arrivalProgress === null ? 0 : easeOutCubic(1 - arrivalProgress) * 17 * this.layout.worldScale
      const arrivalScale =
        arrivalProgress === null ? 1 : 1 + easeOutCubic(1 - arrivalProgress) * 0.16
      const hoverLift = hovered ? TILE_HOVER_LIFT_PX : 0
      const lift = lifted ? 8 : hoverLift
      this.context.save()
      if (dimmed) {
        this.context.globalAlpha = DIMMED_TRAY_TILE_ALPHA
      }
      if (unlockProgress !== null && unlockProgress < 0.86) {
        this.context.globalAlpha = Math.min(this.context.globalAlpha, 0.2)
      }
      this.drawTile(
        {
          x: rect.x,
          y: rect.y - lift - arrivalLift,
          width: rect.width,
          height: rect.height,
        },
        TILE_DEFINITIONS[tileId],
        tileId === activeTileId || hovered || arrivalProgress !== null,
        `tray:${tileId}`,
        {
          scale: (hovered ? 1.035 : 1) * arrivalScale,
          rotation: hovered ? (((hashSeed(`tray-hover:${tileId}`) % 9) - 4) * Math.PI) / 900 : 0,
          showHighlight: arrivalProgress === null,
        },
      )
      this.context.restore()
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
        {
          scale: TILE_DRAG_SCALE,
          rotation: (((hashSeed(`drag:${this.drag.tileId}`) % 13) - 6) * Math.PI) / 420,
        },
      )
    }
  }

  private drawTileUnlockAnimations(): void {
    for (const animation of this.tileUnlockAnimations) {
      const tile = TILE_DEFINITIONS[animation.tileId]
      const progress = clamp(animation.ageMs / TILE_UNLOCK_DURATION_MS, 0, 1)
      const revealProgress = clamp(progress / TILE_UNLOCK_REVEAL_END, 0, 1)
      const flyProgress = clamp((progress - TILE_UNLOCK_REVEAL_END) / (1 - TILE_UNLOCK_REVEAL_END), 0, 1)
      const flyEase = easeInOutCubic(flyProgress)
      const source = animation.sourceScreen
      const revealCenter = {
        x: source.x + 46 * this.layout.worldScale,
        y: source.y - 34 * this.layout.worldScale,
      }
      const targetRect = this.tileUnlockTargetRect(animation.tileId)
      const targetCenter = this.rectCenter(targetRect)
      const center = {
        x: lerp(revealCenter.x, targetCenter.x, flyEase),
        y: lerp(revealCenter.y, targetCenter.y, flyEase),
      }
      const revealSize = this.layout.tileSize * (1.34 + easeOutCubic(revealProgress) * 0.16)
      const size = lerp(revealSize, targetRect.width, flyEase)
      const alpha = progress < 0.08 ? progress / 0.08 : progress > 0.94 ? (1 - progress) / 0.06 : 1
      const rect = {
        x: center.x - size / 2,
        y: center.y - size / 2,
        width: size,
        height: size,
      }

      this.context.save()
      this.context.globalAlpha = clamp(alpha, 0, 1)

      this.drawTile(rect, tile, true, `unlock:${animation.tileId}`, {
        scale: flyProgress > 0 ? 1 : 0.9 + easeOutCubic(revealProgress) * 0.1,
        rotation: lerp(-0.08, 0.04, revealProgress) * (1 - flyProgress),
        showHighlight: false,
      })
      this.context.restore()
    }
  }

  private drawGraphCompleteFlourishes(): void {
    for (const [sectionId, ageMs] of this.graphCompleteAnimations) {
      const section = this.sectionById.get(sectionId)
      if (!section) {
        continue
      }

      const progress = clamp(ageMs / GRAPH_COMPLETE_DURATION_MS, 0, 1)
      const graph = this.graphRect(sectionId)
      const color = section.accent

      this.context.save()
      this.context.globalAlpha = (1 - progress) * 0.42
      const checkStart = {
        x: graph.x + graph.width + 18 * this.layout.worldScale,
        y: graph.y + graph.height + 16 * this.layout.worldScale,
      }
      this.drawRoughPolyline(
        [
          checkStart,
          {
            x: checkStart.x + 8 * this.layout.worldScale,
            y: checkStart.y + 9 * this.layout.worldScale,
          },
          {
            x: checkStart.x + 26 * this.layout.worldScale,
            y: checkStart.y - 10 * this.layout.worldScale,
          },
        ],
        `graph-complete-check:${sectionId}`,
        {
          stroke: color,
          strokeWidth: Math.max(1.4, 2.4 * this.layout.worldScale),
          roughness: 1.05,
          bowing: 0.65,
        },
      )
      this.context.restore()
    }
  }

  private drawCelebrationConfetti(): void {
    if (this.celebrationConfetti.length === 0) {
      return
    }

    for (const burst of this.celebrationConfetti) {
      const origin = this.worldToScreen(burst.world)

      for (const [index, particle] of burst.particles.entries()) {
        const delayedAge = burst.ageMs - particle.delayMs
        if (delayedAge <= 0) {
          continue
        }

        const localProgress = clamp(
          delayedAge / Math.max(1, burst.lifetimeMs - particle.delayMs),
          0,
          1,
        )
        const seconds = delayedAge / 1000
        const fadeIn = clamp(localProgress / 0.14, 0, 1)
        const fadeOut = clamp((1 - localProgress) / 0.34, 0, 1)
        const alpha = fadeIn * fadeOut * 0.92
        if (alpha <= 0) {
          continue
        }

        const wobble = Math.sin(localProgress * Math.PI * 2 + particle.angle) *
          particle.wobble *
          localProgress
        const x = origin.x + particle.vx * seconds + wobble
        const y = origin.y + particle.vy * seconds + 0.5 * particle.gravity * seconds * seconds
        const angle = particle.angle + particle.spin * localProgress
        const size = particle.size * clamp(this.zoomLevel, 0.75, 1.08)
        const stroke = mixColors(particle.color, INK, 0.18, alpha)
        const seedKey = `${burst.id}:particle:${index}`

        if (particle.shape === 'box') {
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          const corners = [
            { x: -size * 0.55, y: -size * 0.36 },
            { x: size * 0.55, y: -size * 0.36 },
            { x: size * 0.55, y: size * 0.36 },
            { x: -size * 0.55, y: size * 0.36 },
            { x: -size * 0.55, y: -size * 0.36 },
          ].map((point) => ({
            x: x + point.x * cos - point.y * sin,
            y: y + point.x * sin + point.y * cos,
          }))
          this.drawRoughPolyline(corners, seedKey, {
            stroke,
            strokeWidth: Math.max(1, 1.25 * this.layout.worldScale),
            roughness: 1.15,
            bowing: 0.8,
          })
        } else if (particle.shape === 'spark') {
          const arm = size * 0.78
          for (let armIndex = 0; armIndex < 2; armIndex += 1) {
            const baseAngle = angle + armIndex * (Math.PI / 2)
            this.drawRoughPolyline(
              [
                { x: x + Math.cos(baseAngle) * arm, y: y + Math.sin(baseAngle) * arm },
                {
                  x: x + Math.cos(baseAngle + Math.PI) * arm,
                  y: y + Math.sin(baseAngle + Math.PI) * arm,
                },
              ],
              `${seedKey}:spark:${armIndex}`,
              {
                stroke,
                strokeWidth: Math.max(1, 1.35 * this.layout.worldScale),
                roughness: 1.1,
                bowing: 0.7,
              },
            )
          }
        } else {
          const length = size * 1.8
          this.drawRoughPolyline(
            [
              {
                x: x - Math.cos(angle) * length * 0.5,
                y: y - Math.sin(angle) * length * 0.5,
              },
              {
                x: x + Math.cos(angle) * length * 0.5,
                y: y + Math.sin(angle) * length * 0.5,
              },
            ],
            seedKey,
            {
              stroke,
              strokeWidth: Math.max(1, 1.55 * this.layout.worldScale),
              roughness: 1.2,
              bowing: 0.7,
            },
          )
        }
      }
    }
  }

  private victoryScreenRect(): Rect {
    const width = clamp(this.layout.width * 0.72, 320, 580)
    const height = clamp(this.layout.height * 0.32, 210, 290)
    return {
      x: (this.layout.width - width) / 2,
      y: (this.layout.height - height) / 2,
      width,
      height,
    }
  }

  private drawVictoryScreen(): void {
    if (!this.victoryScreenVisible) {
      return
    }

    const rect = this.victoryScreenRect()
    const width = rect.width
    const height = rect.height
    const center = this.rectCenter(rect)

    this.context.save()
    this.context.fillStyle = 'rgba(255, 250, 239, 0.72)'
    this.context.fillRect(0, 0, this.layout.width, this.layout.height)
    fillRoundedRect(this.context, rect, 14, 'rgba(255, 250, 239, 0.92)')
    this.drawRoughRoundedRect(rect, 14, 'victory-panel', {
      stroke: GOAL,
      strokeWidth: Math.max(1.4, 2.2 * this.layout.worldScale),
      roughness: 1.25,
      bowing: 0.8,
    })

    const sparkleColor = 'rgba(239, 149, 81, 0.78)'
    const starCenters = [
      { x: rect.x + width * 0.18, y: rect.y + height * 0.24 },
      { x: rect.x + width * 0.82, y: rect.y + height * 0.24 },
      { x: rect.x + width * 0.28, y: rect.y + height * 0.78 },
      { x: rect.x + width * 0.72, y: rect.y + height * 0.78 },
    ]
    for (const [index, point] of starCenters.entries()) {
      this.drawRoughPolyline(
        [
          { x: point.x, y: point.y - 12 },
          { x: point.x + 5, y: point.y - 3 },
          { x: point.x + 14, y: point.y },
          { x: point.x + 5, y: point.y + 4 },
          { x: point.x, y: point.y + 13 },
          { x: point.x - 5, y: point.y + 4 },
          { x: point.x - 14, y: point.y },
          { x: point.x - 5, y: point.y - 3 },
          { x: point.x, y: point.y - 12 },
        ],
        `victory-star:${index}`,
        {
          stroke: sparkleColor,
          strokeWidth: 1.8,
          roughness: 1.15,
          bowing: 0.8,
        },
      )
    }

    this.context.fillStyle = INK
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    this.context.font = `${Math.round(clamp(width * 0.09, 28, 46))}px 'Schoolbell', cursive`
    this.context.fillText('Graphbound complete', center.x, center.y - height * 0.16)
    this.context.font = `${Math.round(clamp(width * 0.038, 15, 21))}px 'Short Stack', cursive`
    this.context.fillText('Every puzzle solved', center.x, center.y + height * 0.08)
    this.context.fillText(`${this.completedPuzzleCount()} / ${this.sections.length}`, center.x, center.y + height * 0.25)
    this.context.restore()
  }

  private drawRewardDoodles(): void {
    for (const doodle of this.rewardDoodles) {
      const progress = clamp(doodle.ageMs / doodle.lifetimeMs, 0, 1)
      const fadeIn = clamp(progress / 0.14, 0, 1)
      const alpha = fadeIn * (1 - progress) ** 0.72 * 0.3
      const center = this.worldToScreen(doodle.world)
      const size = 17 * this.layout.worldScale
      const stroke = mixColors(doodle.color, INK, 0.58, alpha)

      this.context.save()
      this.context.globalAlpha = 1

      if (doodle.kind === 'check') {
        this.drawRoughPolyline(
          [
            { x: center.x - size * 0.72, y: center.y },
            { x: center.x - size * 0.18, y: center.y + size * 0.48 },
            { x: center.x + size * 0.82, y: center.y - size * 0.58 },
          ],
          doodle.id,
          {
            stroke,
            strokeWidth: Math.max(1, 1.8 * this.layout.worldScale),
            roughness: 1.25,
            bowing: 0.9,
          },
        )
      } else if (doodle.kind === 'flower') {
        for (let index = 0; index < 5; index += 1) {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5
          this.roughCanvas.circle(
            center.x + Math.cos(angle) * size * 0.46,
            center.y + Math.sin(angle) * size * 0.46,
            size * 0.54,
            seeded(`${doodle.id}:petal:${index}`, {
              stroke,
              strokeWidth: Math.max(1, 1.35 * this.layout.worldScale),
              roughness: 1.25,
              bowing: 0.9,
            }),
          )
        }
        this.roughCanvas.circle(center.x, center.y, size * 0.36, seeded(`${doodle.id}:center`, {
          stroke,
          strokeWidth: Math.max(1, 1.15 * this.layout.worldScale),
          roughness: 1.1,
          bowing: 0.8,
        }))
      } else if (doodle.kind === 'spark') {
        const arms = [
          [{ x: 0, y: -1 }, { x: 0, y: 1 }],
          [{ x: -1, y: 0 }, { x: 1, y: 0 }],
          [{ x: -0.7, y: -0.7 }, { x: 0.7, y: 0.7 }],
          [{ x: -0.7, y: 0.7 }, { x: 0.7, y: -0.7 }],
        ]
        for (const [index, arm] of arms.entries()) {
          this.drawRoughPolyline(
            arm.map((point) => ({
              x: center.x + point.x * size * 0.72,
              y: center.y + point.y * size * 0.72,
            })),
            `${doodle.id}:spark:${index}`,
            {
              stroke,
              strokeWidth: Math.max(1, 1.35 * this.layout.worldScale),
              roughness: 1.2,
              bowing: 0.7,
            },
          )
        }
      } else if (doodle.kind === 'spiral') {
        const points: Point[] = []
        for (let index = 0; index < 24; index += 1) {
          const t = index / 23
          const angle = t * Math.PI * 3.2
          const radius = size * 0.76 * t
          points.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
          })
        }
        this.drawRoughPolyline(points, `${doodle.id}:spiral`, {
          stroke,
          strokeWidth: Math.max(1, 1.45 * this.layout.worldScale),
          roughness: 1.1,
          bowing: 0.7,
        })
      } else if (doodle.kind === 'pie') {
        this.roughCanvas.circle(center.x, center.y, size * 1.15, seeded(`${doodle.id}:pie`, {
          stroke,
          strokeWidth: Math.max(1, 1.45 * this.layout.worldScale),
          roughness: 1.15,
          bowing: 0.8,
        }))
        this.drawRoughPolyline(
          [
            center,
            { x: center.x + size * 0.52, y: center.y - size * 0.45 },
            { x: center.x + size * 0.72, y: center.y + size * 0.2 },
            center,
          ],
          `${doodle.id}:slice`,
          {
            stroke,
            strokeWidth: Math.max(1, 1.25 * this.layout.worldScale),
            roughness: 1.05,
            bowing: 0.6,
          },
        )
      } else {
        this.drawRoughPolyline(
          [
            { x: center.x - size * 0.86, y: center.y - size * 0.5 },
            { x: center.x - size * 0.22, y: center.y - size * 0.08 },
            { x: center.x - size * 0.74, y: center.y + size * 0.46 },
            { x: center.x + size * 0.72, y: center.y + size * 0.08 },
          ],
          `${doodle.id}:crease`,
          {
            stroke,
            strokeWidth: Math.max(1, 1.35 * this.layout.worldScale),
            roughness: 1.2,
            bowing: 0.85,
          },
        )
      }

      this.context.restore()
    }
  }

  private drawGraphiteDust(): void {
    if (this.graphiteDust.length === 0) {
      return
    }

    this.context.save()
    this.context.fillStyle = 'rgba(45, 38, 32, 0.18)'

    for (const dust of this.graphiteDust) {
      const progress = clamp(dust.ageMs / dust.lifetimeMs, 0, 1)
      const center = this.worldToScreen(dust.world)
      this.context.globalAlpha = (1 - progress) ** 1.4 * 0.42
      this.context.beginPath()
      this.context.arc(center.x, center.y, dust.radius * (1 - progress * 0.35), 0, Math.PI * 2)
      this.context.fill()
    }

    this.context.restore()
  }

  private render(): void {
    this.syncZoomButton()
    this.syncSelectedSectionToCenter()
    this.syncTileFocusSelection()
    this.drawBackground()
    this.drawRewardDoodles()
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
    this.drawGraphiteDust()
    this.drawWorldLinksOverlay()
    this.drawGraphCompleteFlourishes()
    this.drawCelebrationConfetti()
    this.drawTray()
    this.drawTileUnlockAnimations()
    this.drawInspectedGoalOverlay()
    this.drawVictoryScreen()
  }

  private renderGameToText(): string {
    this.syncSelectedSectionToCenter()
    this.syncTileFocusSelection()
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
          celebrationProgress: Number((runtime?.targetCelebrationProgress ?? 0).toFixed(2)),
          plot: runtime?.plotResult?.screenLabel ?? null,
        }
      })
    const runtimeAnimating = [...this.sectionRuntimes.values()].some((runtime) => runtime.animating)

    return JSON.stringify({
      mode:
        this.victoryScreenVisible
          ? 'victory'
          : this.cameraTween ||
              runtimeAnimating ||
              this.celebrationConfetti.length > 0 ||
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
      victory: this.victoryScreenVisible,
      victoryScreenShown: this.victoryScreenShown,
      completedPuzzles: this.completedPuzzleCount(),
      totalPuzzles: this.sections.length,
      unlockedTiles: [...this.unlockedTiles],
      trayTiles: this.trayTileRects().map(({ tileId }) => tileId),
      selectedTile: this.selectedTileId,
      selectedPuzzle: this.tileFocusSectionId,
      startLevelOverride: this.startLevelOverride,
      confettiBursts: this.celebrationConfetti.length,
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
      previewIntendedSolution: (sectionId: string, goalId: string) => IntendedPreviewResult
      getState: () => unknown
      getInteractionRects: () => unknown
      getLayoutIssues: () => Array<{ kind: string; a: string; b: string }>
    }
  }
}
