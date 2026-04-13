import { DEFAULT_AXES, TILE_DEFINITIONS } from './content'
import type {
  AxisDefinition,
  BoundaryHit,
  EquationPart,
  EquationTokenStyle,
  GoalDefinition,
  GoalEdge,
  GraphAxes,
  PlotPoint,
  PlotResult,
  SectionDefinition,
  TileId,
} from './types'

const EDGE_EPSILON = 0.08
const DEFAULT_POLAR_DOMAIN: AxisDefinition = {
  min: 0,
  max: Math.PI * 2,
  tickStep: Math.PI / 4,
}

interface ResolvedToken {
  text: string
  style: EquationTokenStyle
}

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

function resolveParameterDomain(section: SectionDefinition): AxisDefinition {
  return resolveAxis(section.parameterDomain, DEFAULT_POLAR_DOMAIN)
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

function equationPrefix(section: SectionDefinition): 'y' | 'r' {
  return section.equationPrefix ?? (section.coordinateMode === 'polar' ? 'r' : 'y')
}

function equationPartsForDisplay(section: SectionDefinition): EquationPart[] {
  return section.displayEquation ?? section.equation
}

function resolveEquationTokens(
  parts: EquationPart[],
  placements: Record<string, TileId | null>,
  includePlaceholders: boolean,
): ResolvedToken[] | null {
  const tokens: ResolvedToken[] = []

  for (const part of parts) {
    if (part.type === 'fixed') {
      tokens.push({
        text: part.value,
        style: part.displayStyle ?? 'normal',
      })
      continue
    }

    const tileId = placements[part.slotId]
    if (!tileId) {
      if (!includePlaceholders) {
        return null
      }

      tokens.push({
        text: '_',
        style: part.displayStyle ?? 'normal',
      })
      continue
    }

    tokens.push({
      text: TILE_DEFINITIONS[tileId].label,
      style: part.displayStyle ?? 'normal',
    })
  }

  return tokens
}

function formatDisplayExpression(tokens: ResolvedToken[]): string {
  if (tokens.length === 0) {
    return '_'
  }

  const parts: string[] = []

  for (const token of tokens) {
    if (token.style === 'superscript' && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}^${token.text}`
      continue
    }

    if (token.style === 'subscript' && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}_${token.text}`
      continue
    }

    parts.push(token.text)
  }

  return parts
    .join(' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\|\s+/g, '|')
    .replace(/\s+\|/g, '|')
    .replace(/sin \(/g, 'sin(')
    .replace(/cos \(/g, 'cos(')
    .replace(/ln \(/g, 'ln(')
    .replace(/log_([^\s]+) \(/g, 'log_$1(')
    .replace(/\s+\/\s+/g, ' / ')
}

export function formatEquationLabel(
  section: SectionDefinition,
  placements: Record<string, TileId | null>,
  includePlaceholders = true,
): string {
  const displayParts = equationPartsForDisplay(section)
  const tokens = resolveEquationTokens(displayParts, placements, includePlaceholders)
  const expression = tokens ? formatDisplayExpression(tokens) : '_'
  return section.displayEquation ? expression : `${equationPrefix(section)} = ${expression}`
}

function isNumberText(text: string): boolean {
  return /^[0-9]+$/.test(text)
}

function isPrimaryToken(token: ResolvedToken | undefined): boolean {
  if (!token || token.style !== 'normal') {
    return false
  }

  return (
    isNumberText(token.text) ||
    token.text === 'x' ||
    token.text === 'θ' ||
    token.text === 'Θ' ||
    token.text === 'x²' ||
    token.text === '(' ||
    token.text === 'sin' ||
    token.text === 'cos' ||
    token.text === 'ln' ||
    token.text === 'log' ||
    token.text === 'e' ||
    token.text === 'π' ||
    token.text === 'pi'
  )
}

function splitPiecewiseSegments(tokens: ResolvedToken[]): ResolvedToken[][] {
  const segments: ResolvedToken[][] = [[]]

  for (const token of tokens) {
    if (token.style === 'normal' && token.text === ';') {
      segments.push([])
      continue
    }

    segments[segments.length - 1].push(token)
  }

  return segments.filter((segment) => segment.length > 0)
}

function parsePiecewiseCondition(tokens: ResolvedToken[]): string {
  const text = tokens
    .map((token) => token.text)
    .join('')
    .replace(/Θ/g, 'theta')
    .replace(/θ/g, 'theta')

  const match = text.match(/^(x|theta)(<=|>=|<|>)(-?(?:\d+(?:\.\d+)?|pi|π))$/i)
  if (!match) {
    throw new Error(`Unsupported piecewise condition: ${text}`)
  }

  const variable = match[1].toLowerCase() === 'theta' ? 'theta' : 'x'
  const operator = match[2]
  const rawValue = match[3].toLowerCase()
  const value = rawValue === 'pi' || rawValue === 'π' ? 'Math.PI' : rawValue

  return `(${variable} ${operator} ${value})`
}

function buildPiecewiseExpression(tokens: ResolvedToken[]): string {
  const segments = splitPiecewiseSegments(tokens)

  if (segments.length < 2) {
    throw new Error('Piecewise equations need at least two branches')
  }

  const branches = segments.map((segment) => {
    const forIndex = segment.findIndex((token) => token.style === 'normal' && token.text === 'for')
    if (forIndex <= 0 || forIndex >= segment.length - 1) {
      throw new Error('Each piecewise branch must be written as expression for condition')
    }

    const expression = new TokenParser(segment.slice(0, forIndex)).parseExpression()
    const condition = parsePiecewiseCondition(segment.slice(forIndex + 1))
    return { expression, condition }
  })

  let expression = 'NaN'

  for (let index = branches.length - 1; index >= 0; index -= 1) {
    expression = `((${branches[index].condition}) ? (${branches[index].expression}) : (${expression}))`
  }

  return expression
}

class TokenParser {
  private index = 0
  private readonly tokens: ResolvedToken[]

  constructor(tokens: ResolvedToken[]) {
    this.tokens = tokens
  }

  parseExpression(): string {
    const expression = this.parseAdditive()

    if (this.current()) {
      throw new Error(`Unexpected token: ${this.current()?.text}`)
    }

    return expression
  }

  private current(): ResolvedToken | undefined {
    return this.tokens[this.index]
  }

  private consume(): ResolvedToken {
    const token = this.tokens[this.index]
    if (!token) {
      throw new Error('Unexpected end of expression')
    }
    this.index += 1
    return token
  }

  private matchNormal(text: string): boolean {
    const token = this.current()
    if (!token || token.style !== 'normal' || token.text !== text) {
      return false
    }

    this.index += 1
    return true
  }

  private expectNormal(text: string): void {
    if (!this.matchNormal(text)) {
      throw new Error(`Expected ${text}`)
    }
  }

  private parseAdditive(): string {
    let expression = this.parseMultiplicative()

    while (true) {
      if (this.matchNormal('+')) {
        expression = `((${expression}) + (${this.parseMultiplicative()}))`
        continue
      }

      if (this.matchNormal('-')) {
        expression = `((${expression}) - (${this.parseMultiplicative()}))`
        continue
      }

      return expression
    }
  }

  private parseMultiplicative(): string {
    let expression = this.parsePower()

    while (true) {
      if (this.matchNormal('/')) {
        expression = `((${expression}) / (${this.parsePower()}))`
        continue
      }

      if (isPrimaryToken(this.current())) {
        expression = `((${expression}) * (${this.parsePower()}))`
        continue
      }

      return expression
    }
  }

  private parsePower(): string {
    let expression = this.parseUnary()

    while (true) {
      const token = this.current()
      if (token?.style === 'superscript') {
        const exponent = this.parseStyledAtom('superscript')
        expression = `Math.pow(${expression}, ${exponent})`
        continue
      }

      if (this.matchNormal('^')) {
        expression = `Math.pow(${expression}, ${this.parseUnary()})`
        continue
      }

      return expression
    }
  }

  private parseUnary(): string {
    if (this.matchNormal('+')) {
      return this.parseUnary()
    }

    if (this.matchNormal('-')) {
      return `(-(${this.parseUnary()}))`
    }

    return this.parsePrimary()
  }

  private parsePrimary(): string {
    const token = this.current()
    if (!token) {
      throw new Error('Missing primary expression')
    }

    if (token.style !== 'normal') {
      throw new Error(`Unexpected ${token.style} token`)
    }

    if (this.matchNormal('(')) {
      const expression = this.parseAdditive()
      this.expectNormal(')')
      return `(${expression})`
    }

    if (this.matchNormal('|')) {
      const expression = this.parseAdditive()
      this.expectNormal('|')
      return `Math.abs(${expression})`
    }

    if (this.matchNormal('sin')) {
      this.expectNormal('(')
      const expression = this.parseAdditive()
      this.expectNormal(')')
      return `Math.sin(${expression})`
    }

    if (this.matchNormal('cos')) {
      this.expectNormal('(')
      const expression = this.parseAdditive()
      this.expectNormal(')')
      return `Math.cos(${expression})`
    }

    if (this.matchNormal('ln')) {
      this.expectNormal('(')
      const expression = this.parseAdditive()
      this.expectNormal(')')
      return `Math.log(${expression})`
    }

    if (this.matchNormal('log')) {
      let base = '10'
      if (this.current()?.style === 'subscript') {
        base = this.parseStyledAtom('subscript')
      }
      this.expectNormal('(')
      const expression = this.parseAdditive()
      this.expectNormal(')')
      return `(Math.log(${expression}) / Math.log(${base}))`
    }

    if (token.text === 'x') {
      this.consume()
      return 'x'
    }

    if (token.text === 'θ' || token.text === 'Θ') {
      this.consume()
      return 'theta'
    }

    if (token.text === 'x²') {
      this.consume()
      return '(x * x)'
    }

    if (token.text === 'e') {
      this.consume()
      return 'Math.E'
    }

    if (token.text === 'π' || token.text === 'pi') {
      this.consume()
      return 'Math.PI'
    }

    if (isNumberText(token.text)) {
      let digits = this.consume().text

      while (this.current() && this.current()?.style === 'normal' && isNumberText(this.current()!.text)) {
        digits += this.consume().text
      }

      return digits
    }

    throw new Error(`Unsupported token: ${token.text}`)
  }

  private parseStyledAtom(style: EquationTokenStyle): string {
    const token = this.current()

    if (!token || token.style !== style) {
      throw new Error(`Expected ${style} token`)
    }

    if (isNumberText(token.text)) {
      let digits = this.consume().text

      while (this.current() && this.current()?.style === style && isNumberText(this.current()!.text)) {
        digits += this.consume().text
      }

      return digits
    }

    if (token.text === 'x') {
      this.consume()
      return 'x'
    }

    if (token.text === 'θ' || token.text === 'Θ') {
      this.consume()
      return 'theta'
    }

    if (token.text === 'x²') {
      this.consume()
      return '(x * x)'
    }

    throw new Error(`Unsupported ${style} token: ${token.text}`)
  }
}

function buildExpressionString(
  section: SectionDefinition,
  placements: Record<string, TileId | null>,
): string | null {
  const tokens = resolveEquationTokens(section.equation, placements, false)

  if (!tokens || tokens.length === 0) {
    return null
  }

  try {
    if (tokens.some((token) => token.style === 'normal' && (token.text === 'for' || token.text === ';'))) {
      return buildPiecewiseExpression(tokens)
    }

    return new TokenParser(tokens).parseExpression()
  } catch {
    return null
  }
}

function cartesianSampleStep(axes: GraphAxes): number {
  return Math.max(0.03, (axes.x.max - axes.x.min) / 220)
}

function polarSampleStep(domain: AxisDefinition): number {
  return Math.max(0.02, (domain.max - domain.min) / 260)
}

function visibleCartesianPoints(expression: string, axes: GraphAxes): PlotPoint[] {
  const evaluator = new Function('x', 'theta', `return ${expression}`) as (
    x: number,
    theta: number,
  ) => number
  const points: PlotPoint[] = []
  const step = cartesianSampleStep(axes)

  for (let x = axes.x.min; x <= axes.x.max + step * 0.25; x += step) {
    const roundedX = Number(x.toFixed(4))
    const y = evaluator(roundedX, roundedX)

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

  return points.sort((a, b) => (Math.abs(a.x - b.x) <= EDGE_EPSILON ? a.y - b.y : a.x - b.x))
}

function visiblePolarPoints(
  expression: string,
  axes: GraphAxes,
  domain: AxisDefinition,
): PlotPoint[] {
  const evaluator = new Function('x', 'theta', `return ${expression}`) as (
    x: number,
    theta: number,
  ) => number
  const points: PlotPoint[] = []
  const step = polarSampleStep(domain)

  for (let theta = domain.min; theta <= domain.max + step * 0.25; theta += step) {
    const roundedTheta = Number(theta.toFixed(4))
    const radius = evaluator(roundedTheta, roundedTheta)

    if (!Number.isFinite(radius)) {
      continue
    }

    const x = radius * Math.cos(roundedTheta)
    const y = radius * Math.sin(roundedTheta)

    if (
      x < axes.x.min - EDGE_EPSILON ||
      x > axes.x.max + EDGE_EPSILON ||
      y < axes.y.min - EDGE_EPSILON ||
      y > axes.y.max + EDGE_EPSILON
    ) {
      continue
    }

    points.push({
      x: clamp(Number(x.toFixed(4)), axes.x.min, axes.x.max),
      y: clamp(Number(y.toFixed(4)), axes.y.min, axes.y.max),
    })
  }

  return points
}

function collectBoundaryHits(points: PlotPoint[], axes: GraphAxes): BoundaryHit[] {
  const hits: BoundaryHit[] = []
  const seen = new Set<string>()

  for (const point of points) {
    const edges = pointEdges(point, axes)

    if (edges.length === 0) {
      continue
    }

    const key = `${edges.join(',')}:${point.x.toFixed(2)}:${point.y.toFixed(2)}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    hits.push({ point, edges })
  }

  return hits
}

export function evaluateSectionPlot(
  section: SectionDefinition,
  placements: Record<string, TileId | null>,
): PlotResult | null {
  const expression = buildExpressionString(section, placements)

  if (!expression) {
    return null
  }

  const axes = resolveAxes(section)
  const points =
    section.coordinateMode === 'polar'
      ? visiblePolarPoints(expression, axes, resolveParameterDomain(section))
      : visibleCartesianPoints(expression, axes)
  const hits = collectBoundaryHits(points, axes)
  const achievedGoalIds = section.goals
    .filter((goal) => hits.some((hit) => matchesGoal(goal, hit)))
    .map((goal) => goal.id)

  return {
    expression,
    screenLabel: formatEquationLabel(section, placements, false),
    points,
    hits,
    achievedGoalIds,
    hasVisiblePath: points.length > 1,
  }
}
