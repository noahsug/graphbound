import { AXIS_MAX, TILE_DEFINITIONS } from './content'
import type {
  BoundaryHit,
  EquationPart,
  GoalDefinition,
  GoalEdge,
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

function pointEdges(point: PlotPoint): GoalEdge[] {
  const edges: GoalEdge[] = []

  if (Math.abs(point.y - AXIS_MAX) <= EDGE_EPSILON) {
    edges.push('top')
  }
  if (Math.abs(point.x - AXIS_MAX) <= EDGE_EPSILON) {
    edges.push('right')
  }
  if (Math.abs(point.y) <= EDGE_EPSILON) {
    edges.push('bottom')
  }
  if (Math.abs(point.x) <= EDGE_EPSILON) {
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

function buildExpressionString(
  parts: EquationPart[],
  placements: Record<string, TileId | null>,
): string | null {
  const tokens: string[] = []

  for (const part of parts) {
    if (part.type === 'fixed') {
      tokens.push(part.value)
      continue
    }

    const tileId = placements[part.slotId]
    if (!tileId) {
      return null
    }

    tokens.push(TILE_DEFINITIONS[tileId].label)
  }

  return tokens.join(' ')
}

function visiblePoints(expression: string): PlotPoint[] {
  const evaluator = new Function('x', `return ${safeExpression(expression)}`) as (x: number) => number
  const points: PlotPoint[] = []

  for (let x = 0; x <= AXIS_MAX + 0.001; x += SAMPLE_STEP) {
    const roundedX = Number(x.toFixed(3))
    const y = evaluator(roundedX)

    if (!Number.isFinite(y)) {
      continue
    }

    if (y < -EDGE_EPSILON || y > AXIS_MAX + EDGE_EPSILON) {
      continue
    }

    points.push({
      x: roundedX,
      y: clamp(y, 0, AXIS_MAX),
    })
  }

  if (points.length === 0) {
    return points
  }

  const first = points[0]
  const last = points[points.length - 1]

  points[0] = {
    x: clamp(first.x, 0, AXIS_MAX),
    y: clamp(first.y, 0, AXIS_MAX),
  }
  points[points.length - 1] = {
    x: clamp(last.x, 0, AXIS_MAX),
    y: clamp(last.y, 0, AXIS_MAX),
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

  const points = visiblePoints(expression)
  const hits: BoundaryHit[] = []

  if (points.length > 0) {
    const start = points[0]
    const end = points[points.length - 1]
    const startEdges = pointEdges(start)
    const endEdges = pointEdges(end)

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
