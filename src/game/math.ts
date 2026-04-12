import { DEFAULT_AXES, TILE_DEFINITIONS } from './content'
import type {
  AxisDefinition,
  BoundaryHit,
  EquationPart,
  GoalDefinition,
  GoalEdge,
  GraphAxes,
  PlotPoint,
  PlotResult,
  SectionDefinition,
  TileId,
} from './types'

const SAMPLE_STEP = 0.1
const EDGE_EPSILON = 0.08

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function uniqueEdges(edges: GoalEdge[]): GoalEdge[] {
  return [...new Set(edges)]
}

function resolveAxis(axis: AxisDefinition | undefined, fallback: AxisDefinition): AxisDefinition {
  return {
    min: axis?.min ?? fallback.min,
    max: axis?.max ?? fallback.max,
    tickStep: axis?.tickStep ?? fallback.tickStep,
  }
}

function resolveAxes(section: SectionDefinition): GraphAxes {
  return {
    x: resolveAxis(section.axes?.x, DEFAULT_AXES.x),
    y: resolveAxis(section.axes?.y, DEFAULT_AXES.y),
  }
}

function pointEdges(point: PlotPoint, axes: GraphAxes): GoalEdge[] {
  const edges: GoalEdge[] = []

  if (Math.abs(point.y - axes.y.max) <= EDGE_EPSILON) {
    edges.push('top')
  }
  if (Math.abs(point.x - axes.x.max) <= EDGE_EPSILON) {
    edges.push('right')
  }
  if (Math.abs(point.y - axes.y.min) <= EDGE_EPSILON) {
    edges.push('bottom')
  }
  if (Math.abs(point.x - axes.x.min) <= EDGE_EPSILON) {
    edges.push('left')
  }

  return uniqueEdges(edges)
}

function goalCoordinate(goal: GoalDefinition, point: PlotPoint): number {
  return goal.edge === 'top' || goal.edge === 'bottom' ? point.x : point.y
}

function matchesGoal(goal: GoalDefinition, hit: BoundaryHit): boolean {
  if (!hit.edges.includes(goal.edge)) {
    return false
  }

  const coordinate = goalCoordinate(goal, hit.point)
  return coordinate >= goal.min - EDGE_EPSILON && coordinate <= goal.max + EDGE_EPSILON
}

function safeExpression(expression: string): string {
  if (!/^[0-9x+\-*/ ().]+$/.test(expression)) {
    throw new Error(`Unsupported expression: ${expression}`)
  }

  return expression
}

function classifyToken(token: string): 'number' | 'variable' | 'operator' | 'unknown' {
  if (/^[0-9]+$/.test(token)) {
    return 'number'
  }

  if (token === '+' || token === '-') {
    return 'operator'
  }

  if (token === 'x') {
    return 'variable'
  }

  return 'unknown'
}

function buildExpressionString(
  parts: EquationPart[],
  placements: Record<string, TileId | null>,
): string | null {
  const rawTokens: string[] = []

  for (const part of parts) {
    if (part.type === 'fixed') {
      rawTokens.push(part.value)
      continue
    }

    const tileId = placements[part.slotId]
    if (!tileId) {
      return null
    }

    rawTokens.push(TILE_DEFINITIONS[tileId].label)
  }

  while (rawTokens[0] === '+' || rawTokens[0] === '-') {
    rawTokens.shift()
  }

  while (rawTokens[rawTokens.length - 1] === '+' || rawTokens[rawTokens.length - 1] === '-') {
    rawTokens.pop()
  }

  if (rawTokens.length === 0) {
    return null
  }

  const terms: string[] = []
  const factors: string[] = []
  let nextTermSign: '+' | '-' = '+'

  const flushTerm = (): void => {
    if (factors.length === 0) {
      return
    }

    const joined = factors.join(' * ')
    terms.push(nextTermSign === '-' ? `- ${joined}` : joined)
    factors.length = 0
  }

  for (const token of rawTokens) {
    const kind = classifyToken(token)

    if (kind === 'operator') {
      flushTerm()
      nextTermSign = token as '+' | '-'
      continue
    }

    if (kind === 'number') {
      const lastFactor = factors[factors.length - 1]

      if (lastFactor && /^[0-9]+$/.test(lastFactor)) {
        factors[factors.length - 1] = `${lastFactor}${token}`
      } else {
        factors.push(token)
      }
      continue
    }

    if (kind === 'variable') {
      factors.push(token)
      continue
    }

    throw new Error(`Unsupported token: ${token}`)
  }

  flushTerm()

  if (terms.length === 0) {
    return null
  }

  return terms
    .map((term, index) => {
      if (index === 0) {
        return term
      }

      return term.startsWith('- ') ? `- ${term.slice(2)}` : `+ ${term}`
    })
    .join(' ')
}

function visiblePoints(expression: string, axes: GraphAxes): PlotPoint[] {
  const evaluator = new Function('x', `return ${safeExpression(expression)}`) as (x: number) => number
  const points: PlotPoint[] = []

  for (let x = axes.x.min; x <= axes.x.max + 0.001; x += SAMPLE_STEP) {
    const roundedX = Number(x.toFixed(3))
    const y = evaluator(roundedX)

    if (!Number.isFinite(y)) {
      continue
    }

    if (y < axes.y.min - EDGE_EPSILON || y > axes.y.max + EDGE_EPSILON) {
      continue
    }

    points.push({
      x: roundedX,
      y: clamp(y, axes.y.min, axes.y.max),
    })
  }

  if (points.length === 0) {
    return points
  }

  const first = points[0]
  const last = points[points.length - 1]

  points[0] = {
    x: clamp(first.x, axes.x.min, axes.x.max),
    y: clamp(first.y, axes.y.min, axes.y.max),
  }
  points[points.length - 1] = {
    x: clamp(last.x, axes.x.min, axes.x.max),
    y: clamp(last.y, axes.y.min, axes.y.max),
  }

  return points
}

export function evaluateSectionPlot(
  section: SectionDefinition,
  placements: Record<string, TileId | null>,
): PlotResult | null {
  const expression = buildExpressionString(section.equation, placements)

  if (!expression) {
    return null
  }

  const axes = resolveAxes(section)
  const points = visiblePoints(expression, axes)
  const hits: BoundaryHit[] = []

  if (points.length > 0) {
    const start = points[0]
    const end = points[points.length - 1]
    const startEdges = pointEdges(start, axes)
    const endEdges = pointEdges(end, axes)

    if (startEdges.length > 0) {
      hits.push({ point: start, edges: startEdges })
    }
    if (
      endEdges.length > 0 &&
      (end.x !== start.x || end.y !== start.y || endEdges.some((edge) => !startEdges.includes(edge)))
    ) {
      hits.push({ point: end, edges: endEdges })
    }
  }

  const achievedGoalIds = section.goals
    .filter((goal) => hits.some((hit) => matchesGoal(goal, hit)))
    .map((goal) => goal.id)

  return {
    expression,
    screenLabel: `y = ${expression}`,
    points,
    hits,
    achievedGoalIds,
    hasVisiblePath: points.length > 1,
  }
}
