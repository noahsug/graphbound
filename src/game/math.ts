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
const TARGET_TOLERANCE = 0.5
const IMPLICIT_GRID_STEPS = 121
const IMPLICIT_POLAR_THETA_STEPS = 320
const IMPLICIT_POLAR_RADIUS_STEPS = 140
const ZERO_EPSILON = 1e-7
const DEFAULT_POLAR_DOMAIN: AxisDefinition = {
  min: 0,
  max: Math.PI * 2,
  tickStep: Math.PI / 4,
}

interface ResolvedToken {
  text: string
  style: EquationTokenStyle
}

type BuiltExpressionKind =
  | 'explicit-cartesian'
  | 'explicit-polar'
  | 'implicit-cartesian'
  | 'implicit-polar'

interface BuiltExpression {
  kind: BuiltExpressionKind
  expression: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function distanceBetween(left: PlotPoint, right: PlotPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function distanceToSegment(point: PlotPoint, start: PlotPoint, end: PlotPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared <= ZERO_EPSILON) {
    return distanceBetween(point, start)
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  return distanceBetween(point, {
    x: start.x + dx * t,
    y: start.y + dy * t,
  })
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
  if (goal.target) {
    return false
  }

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
  const { openBefore, closeAfter } = inferredFunctionParenInsertions(tokens)

  for (const [index, token] of tokens.entries()) {
    if (openBefore.has(index)) {
      parts.push('(')
    }

    if (token.style === 'superscript' && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}^${token.text}`
      if (closeAfter.has(index)) {
        parts.push(')')
      }
      continue
    }

    if (token.style === 'subscript' && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}_${token.text}`
      if (closeAfter.has(index)) {
        parts.push(')')
      }
      continue
    }

    parts.push(token.text)

    if (closeAfter.has(index)) {
      parts.push(')')
    }
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
    token.text === 'y' ||
    token.text === 'r' ||
    token.text === 'θ' ||
    token.text === 'Θ' ||
    token.text === 'theta' ||
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

function functionPrimaryEnd(tokens: ResolvedToken[], index: number): number | null {
  const token = tokens[index]

  if (!token || (token.style === 'normal' && token.text === '(')) {
    return null
  }

  if (token.style === 'normal' && ['sin', 'cos', 'ln', 'log'].includes(token.text)) {
    return inferredFunctionArgumentRange(tokens, index)?.endIndex ?? null
  }

  return isPrimaryToken(token) ? index : null
}

function functionUnaryEnd(tokens: ResolvedToken[], startIndex: number): number | null {
  let index = startIndex

  while (
    tokens[index]?.style === 'normal' &&
    (tokens[index].text === '+' || tokens[index].text === '-')
  ) {
    index += 1
  }

  return functionPrimaryEnd(tokens, index)
}

function inferredFunctionArgumentRange(
  tokens: ResolvedToken[],
  functionIndex: number,
): { startIndex: number; endIndex: number } | null {
  const startIndex = functionIndex + 1
  const first = tokens[startIndex]

  if (!first || first.style !== 'normal' || first.text === '(') {
    return null
  }

  if (first.text === '+' || first.text === '-') {
    const endIndex = functionUnaryEnd(tokens, startIndex + 1)
    return endIndex === null ? null : { startIndex, endIndex }
  }

  const endIndex = functionUnaryEnd(tokens, startIndex)
  return endIndex === null ? null : { startIndex, endIndex }
}

function inferredFunctionParenInsertions(tokens: ResolvedToken[]): {
  openBefore: Set<number>
  closeAfter: Set<number>
} {
  const openBefore = new Set<number>()
  const closeAfter = new Set<number>()

  tokens.forEach((token, index) => {
    if (token.style !== 'normal' || !['sin', 'cos', 'ln', 'log'].includes(token.text)) {
      return
    }

    const range = inferredFunctionArgumentRange(tokens, index)
    if (!range) {
      return
    }

    openBefore.add(range.startIndex)
    closeAfter.add(range.endIndex)
  })

  return { openBefore, closeAfter }
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

function tokenIsVariable(token: ResolvedToken | undefined, variable: 'y' | 'r'): boolean {
  return Boolean(token?.style === 'normal' && token.text === variable)
}

function tokensUsePolarVariables(tokens: ResolvedToken[]): boolean {
  return tokens.some(
    (token) =>
      token.style === 'normal' &&
      (token.text === 'r' || token.text === 'θ' || token.text === 'Θ' || token.text === 'theta'),
  )
}

function tokensUseOutputVariables(tokens: ResolvedToken[]): boolean {
  return tokens.some(
    (token) => token.style === 'normal' && (token.text === 'y' || token.text === 'r'),
  )
}

function solvedVariableExpression(
  tokens: ResolvedToken[],
  variable: 'y' | 'r',
  expression: string,
): string | null {
  if (tokens.length === 1 && tokenIsVariable(tokens[0], variable)) {
    return expression
  }

  if (
    tokens.length === 2 &&
    tokens[0].style === 'normal' &&
    isNumberText(tokens[0].text) &&
    tokenIsVariable(tokens[1], variable)
  ) {
    return `((${expression}) / (${tokens[0].text}))`
  }

  return null
}

function buildFullEquationExpression(
  section: SectionDefinition,
  tokens: ResolvedToken[],
): BuiltExpression {
  const equalsIndexes = tokens
    .map((token, index) => (token.style === 'normal' && token.text === '=' ? index : -1))
    .filter((index) => index >= 0)

  if (equalsIndexes.length !== 1 || equalsIndexes[0] === 0 || equalsIndexes[0] === tokens.length - 1) {
    throw new Error('Full equations need one interior equals sign')
  }

  const equalsIndex = equalsIndexes[0]
  const leftTokens = tokens.slice(0, equalsIndex)
  const rightTokens = tokens.slice(equalsIndex + 1)
  const right = new TokenParser(rightTokens).parseExpression()
  const solvedY = solvedVariableExpression(leftTokens, 'y', right)
  const rightUsesOutputVariable = tokensUseOutputVariables(rightTokens)

  if (solvedY && !rightUsesOutputVariable) {
    return {
      kind: 'explicit-cartesian',
      expression: solvedY,
    }
  }

  const solvedR = solvedVariableExpression(leftTokens, 'r', right)

  if (solvedR && !rightUsesOutputVariable) {
    return {
      kind: 'explicit-polar',
      expression: solvedR,
    }
  }

  const left = new TokenParser(leftTokens).parseExpression()
  return {
    kind:
      section.coordinateMode === 'polar' || tokensUsePolarVariables(tokens)
        ? 'implicit-polar'
        : 'implicit-cartesian',
    expression: `((${left}) - (${right}))`,
  }
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

  private parseFunctionArgument(): string {
    if (this.matchNormal('(')) {
      const expression = this.parseAdditive()
      this.expectNormal(')')
      return expression
    }

    return this.parseUnary()
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
      const expression = this.parseFunctionArgument()
      return `Math.sin(${expression})`
    }

    if (this.matchNormal('cos')) {
      const expression = this.parseFunctionArgument()
      return `Math.cos(${expression})`
    }

    if (this.matchNormal('ln')) {
      const expression = this.parseFunctionArgument()
      return `Math.log(${expression})`
    }

    if (this.matchNormal('log')) {
      let base = '10'
      if (this.current()?.style === 'subscript') {
        base = this.parseStyledAtom('subscript')
      }
      const expression = this.parseFunctionArgument()
      return `(Math.log(${expression}) / Math.log(${base}))`
    }

    if (token.text === 'x') {
      this.consume()
      return 'x'
    }

    if (token.text === 'y') {
      this.consume()
      return 'y'
    }

    if (token.text === 'r') {
      this.consume()
      return 'r'
    }

    if (token.text === 'θ' || token.text === 'Θ') {
      this.consume()
      return 'theta'
    }

    if (token.text === 'theta') {
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

    if (token.text === 'y') {
      this.consume()
      return 'y'
    }

    if (token.text === 'r') {
      this.consume()
      return 'r'
    }

    if (token.text === 'θ' || token.text === 'Θ') {
      this.consume()
      return 'theta'
    }

    if (token.text === 'theta') {
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

function buildExpression(
  section: SectionDefinition,
  placements: Record<string, TileId | null>,
): BuiltExpression | null {
  const tokens = resolveEquationTokens(section.equation, placements, false)

  if (!tokens || tokens.length === 0) {
    return null
  }

  try {
    if (tokens.some((token) => token.style === 'normal' && token.text === '=')) {
      return buildFullEquationExpression(section, tokens)
    }

    if (tokens.some((token) => token.style === 'normal' && (token.text === 'for' || token.text === ';'))) {
      return {
        kind: section.coordinateMode === 'polar' ? 'explicit-polar' : 'explicit-cartesian',
        expression: buildPiecewiseExpression(tokens),
      }
    }

    const expression = new TokenParser(tokens).parseExpression()

    if (tokensUseOutputVariables(tokens)) {
      const outputVariable = equationPrefix(section)

      return {
        kind:
          section.coordinateMode === 'polar' || outputVariable === 'r' || tokensUsePolarVariables(tokens)
            ? 'implicit-polar'
            : 'implicit-cartesian',
        expression: `((${outputVariable}) - (${expression}))`,
      }
    }

    return {
      kind: section.coordinateMode === 'polar' ? 'explicit-polar' : 'explicit-cartesian',
      expression,
    }
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

function visibleCartesianSegments(expression: string, axes: GraphAxes): PlotPoint[][] {
  const evaluator = new Function('x', 'theta', `return ${expression}`) as (
    x: number,
    theta: number,
  ) => number
  const step = cartesianSampleStep(axes)
  const rawSegments: PlotPoint[][] = []
  let currentRawSegment: PlotPoint[] = []
  const pushRawSample = (point: PlotPoint) => {
    currentRawSegment.push(point)
  }
  const finishRawSegment = () => {
    if (currentRawSegment.length > 0) {
      rawSegments.push(currentRawSegment)
      currentRawSegment = []
    }
  }

  for (let x = axes.x.min; x <= axes.x.max + step * 0.25; x += step) {
    const roundedX = Number(x.toFixed(4))
    let y: number

    try {
      y = evaluator(roundedX, roundedX)
    } catch {
      finishRawSegment()
      continue
    }

    if (!Number.isFinite(y)) {
      const edgeX =
        Math.abs(roundedX - axes.x.min) <= EDGE_EPSILON
          ? axes.x.min
          : Math.abs(roundedX - axes.x.max) <= EDGE_EPSILON
            ? axes.x.max
            : null

      if (edgeX !== null && (y === Infinity || y === -Infinity)) {
        pushRawSample({
          x: edgeX,
          y: y === Infinity ? axes.y.max : axes.y.min,
        })
      }

      finishRawSegment()
      continue
    }

    pushRawSample({
      x: roundedX,
      y,
    })
  }

  finishRawSegment()

  if (rawSegments.length === 0) {
    return []
  }

  const inside = (point: PlotPoint) =>
    point.x >= axes.x.min - EDGE_EPSILON &&
    point.x <= axes.x.max + EDGE_EPSILON &&
    point.y >= axes.y.min - EDGE_EPSILON &&
    point.y <= axes.y.max + EDGE_EPSILON
  const edgeForOutsidePoint = (point: PlotPoint, edges: GoalEdge[]): GoalEdge | null => {
    if (edges.includes('top') && point.y > axes.y.max + EDGE_EPSILON) {
      return 'top'
    }
    if (edges.includes('right') && point.x > axes.x.max + EDGE_EPSILON) {
      return 'right'
    }
    if (edges.includes('bottom') && point.y < axes.y.min - EDGE_EPSILON) {
      return 'bottom'
    }
    if (edges.includes('left') && point.x < axes.x.min - EDGE_EPSILON) {
      return 'left'
    }
    return null
  }
  const boundaryContactGuidePoint = (
    contact: PlotPoint,
    outside: PlotPoint,
  ): PlotPoint | null => {
    const edges = pointEdges(contact, axes)
    const edge = edgeForOutsidePoint(outside, edges) ?? edges[0]
    const guideLength = Math.max(0.25, Math.min(axes.x.max - axes.x.min, axes.y.max - axes.y.min) * 0.08)

    if (edge === 'top' || edge === 'bottom') {
      const direction =
        contact.x <= axes.x.min + EDGE_EPSILON
          ? 1
          : contact.x >= axes.x.max - EDGE_EPSILON
            ? -1
            : outside.x < contact.x
              ? -1
              : 1
      const x = clamp(contact.x + direction * guideLength, axes.x.min, axes.x.max)
      if (Math.abs(x - contact.x) <= EDGE_EPSILON) {
        return null
      }
      return { x, y: edge === 'top' ? axes.y.max : axes.y.min }
    }

    if (edge === 'right' || edge === 'left') {
      const direction =
        contact.y <= axes.y.min + EDGE_EPSILON
          ? 1
          : contact.y >= axes.y.max - EDGE_EPSILON
            ? -1
            : outside.y < contact.y
              ? -1
              : 1
      const y = clamp(contact.y + direction * guideLength, axes.y.min, axes.y.max)
      if (Math.abs(y - contact.y) <= EDGE_EPSILON) {
        return null
      }
      return { x: edge === 'right' ? axes.x.max : axes.x.min, y }
    }

    return null
  }
  const fallbackBoundaryGuidePoint = (contact: PlotPoint): PlotPoint | null => {
    const edge = pointEdges(contact, axes)[0]
    const guideLength = Math.max(0.25, Math.min(axes.x.max - axes.x.min, axes.y.max - axes.y.min) * 0.08)

    if (edge === 'top' || edge === 'bottom') {
      const direction = contact.x >= axes.x.max - EDGE_EPSILON ? -1 : 1
      const x = clamp(contact.x + direction * guideLength, axes.x.min, axes.x.max)
      if (Math.abs(x - contact.x) <= EDGE_EPSILON) {
        return null
      }
      return { x, y: edge === 'top' ? axes.y.max : axes.y.min }
    }

    if (edge === 'right' || edge === 'left') {
      const direction = contact.y >= axes.y.max - EDGE_EPSILON ? -1 : 1
      const y = clamp(contact.y + direction * guideLength, axes.y.min, axes.y.max)
      if (Math.abs(y - contact.y) <= EDGE_EPSILON) {
        return null
      }
      return { x: edge === 'right' ? axes.x.max : axes.x.min, y }
    }

    return null
  }
  const clippedSegmentIsContact = (clipped: { start: PlotPoint; end: PlotPoint }) =>
    distanceBetween(clipped.start, clipped.end) <= EDGE_EPSILON

  const clipSegmentToBounds = (
    start: PlotPoint,
    end: PlotPoint,
  ): { start: PlotPoint; end: PlotPoint } | null => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    let t0 = 0
    let t1 = 1
    const checks: Array<[number, number]> = [
      [-dx, start.x - axes.x.min],
      [dx, axes.x.max - start.x],
      [-dy, start.y - axes.y.min],
      [dy, axes.y.max - start.y],
    ]

    for (const [p, q] of checks) {
      if (Math.abs(p) <= EDGE_EPSILON) {
        if (q < 0) {
          return null
        }
        continue
      }

      const ratio = q / p
      if (p < 0) {
        if (ratio > t1) {
          return null
        }
        t0 = Math.max(t0, ratio)
      } else {
        if (ratio < t0) {
          return null
        }
        t1 = Math.min(t1, ratio)
      }
    }

    return {
      start: {
        x: start.x + dx * t0,
        y: start.y + dy * t0,
      },
      end: {
        x: start.x + dx * t1,
        y: start.y + dy * t1,
      },
    }
  }
  const clippedVisibleSegments = (rawSamples: PlotPoint[]): PlotPoint[][] => {
    const segments: PlotPoint[][] = []
    const points: PlotPoint[] = []
    const pushPoint = (point: PlotPoint) => {
      const clamped = {
        x: clamp(Number(point.x.toFixed(4)), axes.x.min, axes.x.max),
        y: clamp(Number(point.y.toFixed(4)), axes.y.min, axes.y.max),
      }
      const last = points.at(-1)
      if (
        last &&
        Math.abs(last.x - clamped.x) <= EDGE_EPSILON &&
        Math.abs(last.y - clamped.y) <= EDGE_EPSILON
      ) {
        return
      }
      points.push(clamped)
    }
    const finishSegment = () => {
      if (points.length === 1 && pointEdges(points[0], axes).length > 0) {
        const guide = fallbackBoundaryGuidePoint(points[0])
        if (guide) {
          points.unshift(guide)
        }
      }

      if (points.length > 1) {
        segments.push([...points])
      }

      points.length = 0
    }
    const pushBoundaryContact = (
      contact: PlotPoint,
      outside: PlotPoint,
      contactIsEnd: boolean,
    ) => {
      const guide = boundaryContactGuidePoint(contact, outside)
      if (!guide) {
        pushPoint(contact)
        return
      }

      if (contactIsEnd) {
        pushPoint(guide)
        pushPoint(contact)
        return
      }

      pushPoint(contact)
      pushPoint(guide)
    }

    let previous = rawSamples[0]
    let previousInside = inside(previous)

    if (previousInside) {
      pushPoint(previous)
    }

    for (let index = 1; index < rawSamples.length; index += 1) {
      const current = rawSamples[index]
      const currentInside = inside(current)
      const clipped = clipSegmentToBounds(previous, current)

      if (previousInside && currentInside) {
        pushPoint(current)
      } else if (previousInside && !currentInside) {
        if (clipped) {
          pushPoint(clipped.end)
        }
        finishSegment()
      } else if (!previousInside && currentInside) {
        finishSegment()
        if (clipped) {
          pushPoint(clipped.start)
        }
        pushPoint(current)
      } else if (clipped) {
        finishSegment()
        if (clippedSegmentIsContact(clipped)) {
          pushBoundaryContact(clipped.start, previous, true)
        }
        finishSegment()
      }

      previous = current
      previousInside = currentInside
    }

    finishSegment()

    return segments
  }

  return rawSegments
    .flatMap(clippedVisibleSegments)
    .filter((points) => points.length > 1)
}

function visiblePolarSegments(
  expression: string,
  axes: GraphAxes,
  domain: AxisDefinition,
): PlotPoint[][] {
  const evaluator = new Function('x', 'theta', `return ${expression}`) as (
    x: number,
    theta: number,
  ) => number
  const segments: PlotPoint[][] = []
  const currentSegment: PlotPoint[] = []
  const step = polarSampleStep(domain)
  const inside = (point: PlotPoint) =>
    point.x >= axes.x.min - EDGE_EPSILON &&
    point.x <= axes.x.max + EDGE_EPSILON &&
    point.y >= axes.y.min - EDGE_EPSILON &&
    point.y <= axes.y.max + EDGE_EPSILON
  const pushPoint = (point: PlotPoint) => {
    const clamped = {
      x: clamp(Number(point.x.toFixed(4)), axes.x.min, axes.x.max),
      y: clamp(Number(point.y.toFixed(4)), axes.y.min, axes.y.max),
    }
    const last = currentSegment.at(-1)
    if (last && distanceBetween(last, clamped) <= EDGE_EPSILON) {
      return
    }
    currentSegment.push(clamped)
  }
  const clipSegmentToBounds = (start: PlotPoint, end: PlotPoint): PlotPoint | null => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    let t = 1
    const checks: Array<[number, number]> = [
      [-dx, start.x - axes.x.min],
      [dx, axes.x.max - start.x],
      [-dy, start.y - axes.y.min],
      [dy, axes.y.max - start.y],
    ]

    for (const [p, q] of checks) {
      if (Math.abs(p) <= EDGE_EPSILON) {
        if (q < 0) {
          return null
        }
        continue
      }

      const ratio = q / p
      if (p > 0) {
        t = Math.min(t, ratio)
      }
    }

    if (t < 0 || t > 1) {
      return null
    }

    return {
      x: start.x + dx * t,
      y: start.y + dy * t,
    }
  }
  let previous: PlotPoint | null = null
  let previousInside = false

  for (let theta = domain.min; theta <= domain.max + step * 0.25; theta += step) {
    const roundedTheta = Number(theta.toFixed(4))
    let radius: number

    try {
      radius = evaluator(roundedTheta, roundedTheta)
    } catch {
      continue
    }

    if (!Number.isFinite(radius)) {
      continue
    }

    const x = radius * Math.cos(roundedTheta)
    const y = radius * Math.sin(roundedTheta)
    const point = { x, y }
    const pointInside = inside(point)

    if (!previous) {
      if (pointInside) {
        pushPoint(point)
      }
      previous = point
      previousInside = pointInside
      continue
    }

    if (previousInside && pointInside) {
      pushPoint(point)
    } else if (previousInside && !pointInside) {
      const clipped = clipSegmentToBounds(previous, point)
      if (clipped) {
        pushPoint(clipped)
      }
      break
    } else if (!previousInside && pointInside) {
      const clipped = clipSegmentToBounds(point, previous)
      if (clipped) {
        pushPoint(clipped)
      }
      pushPoint(point)
    }

    previous = point
    previousInside = pointInside
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment)
  }

  return segments
}

type ImplicitEvaluator = (x: number, y: number, r: number, theta: number) => number

function createImplicitEvaluator(expression: string): ImplicitEvaluator {
  return new Function('x', 'y', 'r', 'theta', `return ${expression}`) as ImplicitEvaluator
}

function safeImplicitValue(
  evaluator: ImplicitEvaluator,
  x: number,
  y: number,
  r = Math.hypot(x, y),
  theta = Math.atan2(y, x),
): number | null {
  try {
    const value = evaluator(x, y, r, theta)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function interpolatedZeroPoint(
  start: PlotPoint,
  startValue: number,
  end: PlotPoint,
  endValue: number,
): PlotPoint | null {
  const startNearZero = Math.abs(startValue) <= ZERO_EPSILON
  const endNearZero = Math.abs(endValue) <= ZERO_EPSILON

  if (!startNearZero && !endNearZero && Math.sign(startValue) === Math.sign(endValue)) {
    return null
  }

  const denominator = startValue - endValue
  const t =
    Math.abs(denominator) <= ZERO_EPSILON
      ? 0.5
      : clamp(startValue / denominator, 0, 1)

  return {
    x: Number((start.x + (end.x - start.x) * t).toFixed(4)),
    y: Number((start.y + (end.y - start.y) * t).toFixed(4)),
  }
}

function pointKey(point: PlotPoint): string {
  return `${point.x.toFixed(4)}:${point.y.toFixed(4)}`
}

function visibleImplicitCartesianSegments(expression: string, axes: GraphAxes): PlotPoint[][] {
  const evaluator = createImplicitEvaluator(expression)
  const columns = IMPLICIT_GRID_STEPS
  const rows = IMPLICIT_GRID_STEPS
  const xStep = (axes.x.max - axes.x.min) / columns
  const yStep = (axes.y.max - axes.y.min) / rows
  const values: Array<Array<number | null>> = []

  for (let yIndex = 0; yIndex <= rows; yIndex += 1) {
    const y = axes.y.min + yIndex * yStep
    const row: Array<number | null> = []

    for (let xIndex = 0; xIndex <= columns; xIndex += 1) {
      const x = axes.x.min + xIndex * xStep
      row.push(safeImplicitValue(evaluator, x, y))
    }

    values.push(row)
  }

  const segments: PlotPoint[][] = []

  for (let yIndex = 0; yIndex < rows; yIndex += 1) {
    for (let xIndex = 0; xIndex < columns; xIndex += 1) {
      const x0 = axes.x.min + xIndex * xStep
      const x1 = x0 + xStep
      const y0 = axes.y.min + yIndex * yStep
      const y1 = y0 + yStep
      const corners = [
        { point: { x: x0, y: y0 }, value: values[yIndex][xIndex] },
        { point: { x: x1, y: y0 }, value: values[yIndex][xIndex + 1] },
        { point: { x: x1, y: y1 }, value: values[yIndex + 1][xIndex + 1] },
        { point: { x: x0, y: y1 }, value: values[yIndex + 1][xIndex] },
      ]
      const edgeIndexes: Array<[number, number]> = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ]
      const crossings: PlotPoint[] = []
      const crossingKeys = new Set<string>()

      for (const [startIndex, endIndex] of edgeIndexes) {
        const start = corners[startIndex]
        const end = corners[endIndex]

        if (start.value === null || end.value === null) {
          continue
        }

        const crossing = interpolatedZeroPoint(start.point, start.value, end.point, end.value)
        if (!crossing) {
          continue
        }

        const key = pointKey(crossing)
        if (crossingKeys.has(key)) {
          continue
        }

        crossingKeys.add(key)
        crossings.push(crossing)
      }

      if (crossings.length === 2) {
        segments.push(crossings)
      } else if (crossings.length >= 4) {
        segments.push([crossings[0], crossings[1]])
        segments.push([crossings[2], crossings[3]])
      }
    }
  }

  return segments
}

function graphRadiusLimit(axes: GraphAxes): number {
  return Math.max(
    Math.hypot(axes.x.min, axes.y.min),
    Math.hypot(axes.x.min, axes.y.max),
    Math.hypot(axes.x.max, axes.y.min),
    Math.hypot(axes.x.max, axes.y.max),
    1,
  )
}

function pointInsideAxes(point: PlotPoint, axes: GraphAxes): boolean {
  return (
    point.x >= axes.x.min - EDGE_EPSILON &&
    point.x <= axes.x.max + EDGE_EPSILON &&
    point.y >= axes.y.min - EDGE_EPSILON &&
    point.y <= axes.y.max + EDGE_EPSILON
  )
}

function visibleImplicitPolarSegments(
  expression: string,
  axes: GraphAxes,
  domain: AxisDefinition,
): PlotPoint[][] {
  const evaluator = createImplicitEvaluator(expression)
  const thetaStep = (domain.max - domain.min) / IMPLICIT_POLAR_THETA_STEPS
  const radiusMax = graphRadiusLimit(axes)
  const radiusStep = radiusMax / IMPLICIT_POLAR_RADIUS_STEPS
  const segments: PlotPoint[][] = []
  let currentSegment: PlotPoint[] = []

  const pushPoint = (point: PlotPoint | null) => {
    if (!point || !pointInsideAxes(point, axes)) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment)
      }
      currentSegment = []
      return
    }

    const clamped = {
      x: clamp(Number(point.x.toFixed(4)), axes.x.min, axes.x.max),
      y: clamp(Number(point.y.toFixed(4)), axes.y.min, axes.y.max),
    }
    const last = currentSegment.at(-1)
    if (!last || distanceBetween(last, clamped) > EDGE_EPSILON) {
      currentSegment.push(clamped)
    }
  }

  for (
    let theta = domain.min;
    theta <= domain.max + thetaStep * 0.25;
    theta += thetaStep
  ) {
    const roundedTheta = Number(theta.toFixed(4))
    let previousRadius = 0
    let previousValue = safeImplicitValue(evaluator, roundedTheta, 0, 0, roundedTheta)
    let foundRoot: number | null = Math.abs(previousValue ?? Number.NaN) <= ZERO_EPSILON ? 0 : null

    for (
      let radiusIndex = 1;
      radiusIndex <= IMPLICIT_POLAR_RADIUS_STEPS && foundRoot === null;
      radiusIndex += 1
    ) {
      const radius = radiusIndex * radiusStep
      const value = safeImplicitValue(evaluator, roundedTheta, 0, radius, roundedTheta)

      if (previousValue !== null && value !== null) {
        const crossing = interpolatedZeroPoint(
          { x: previousRadius, y: 0 },
          previousValue,
          { x: radius, y: 0 },
          value,
        )
        if (crossing) {
          foundRoot = Math.max(0, crossing.x)
          break
        }
      }

      previousRadius = radius
      previousValue = value
    }

    pushPoint(
      foundRoot === null
        ? null
        : {
            x: foundRoot * Math.cos(roundedTheta),
            y: foundRoot * Math.sin(roundedTheta),
          },
    )
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment)
  }

  return segments
}

function flattenSegments(segments: PlotPoint[][]): PlotPoint[] {
  return segments.flatMap((segment) => segment)
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

function targetHitForSegments(target: PlotPoint, segments: PlotPoint[][]): PlotPoint | null {
  for (const segment of segments) {
    for (const point of segment) {
      if (distanceBetween(point, target) <= TARGET_TOLERANCE) {
        return target
      }
    }

    for (let index = 1; index < segment.length; index += 1) {
      if (distanceToSegment(target, segment[index - 1], segment[index]) <= TARGET_TOLERANCE) {
        return target
      }
    }
  }

  return null
}

function matchesGoalByTarget(goal: GoalDefinition, segments: PlotPoint[][]): boolean {
  return Boolean(goal.target && targetHitForSegments(goal.target, segments))
}

function targetBoundaryContactSegment(target: PlotPoint, axes: GraphAxes): PlotPoint[] | null {
  const edges = pointEdges(target, axes)
  const edge = edges[0]
  const guideLength = Math.max(0.25, Math.min(axes.x.max - axes.x.min, axes.y.max - axes.y.min) * 0.08)

  if (!edge) {
    return null
  }

  if (edge === 'top' || edge === 'bottom') {
    const direction = target.x >= axes.x.max - EDGE_EPSILON ? -1 : 1
    const x = clamp(target.x + direction * guideLength, axes.x.min, axes.x.max)
    if (Math.abs(x - target.x) <= EDGE_EPSILON) {
      return null
    }
    return [{ x, y: target.y }, target]
  }

  const direction = target.y >= axes.y.max - EDGE_EPSILON ? -1 : 1
  const y = clamp(target.y + direction * guideLength, axes.y.min, axes.y.max)
  if (Math.abs(y - target.y) <= EDGE_EPSILON) {
    return null
  }
  return [{ x: target.x, y }, target]
}

function implicitTargetIsOnCurve(expression: string, target: PlotPoint): boolean {
  const evaluator = createImplicitEvaluator(expression)
  const value = safeImplicitValue(evaluator, target.x, target.y)
  return value !== null && Math.abs(value) <= TARGET_TOLERANCE
}

function normalizeTheta(theta: number): number {
  const tau = Math.PI * 2
  return ((theta % tau) + tau) % tau
}

function explicitPolarTargetIsOnCurve(expression: string, target: PlotPoint): boolean {
  const theta = normalizeTheta(Math.atan2(target.y, target.x))
  const evaluator = new Function('x', 'theta', `return ${expression}`) as (
    x: number,
    theta: number,
  ) => number
  let radius: number

  try {
    radius = evaluator(theta, theta)
  } catch {
    return false
  }

  if (!Number.isFinite(radius)) {
    return false
  }

  return distanceBetween(target, {
    x: radius * Math.cos(theta),
    y: radius * Math.sin(theta),
  }) <= TARGET_TOLERANCE
}

function addBoundaryTargetSegments(
  kind: BuiltExpressionKind,
  expression: string,
  axes: GraphAxes,
  goals: GoalDefinition[],
  segments: PlotPoint[][],
): PlotPoint[][] {
  const additions: PlotPoint[][] = []

  for (const goal of goals) {
    if (!goal.target || matchesGoalByTarget(goal, segments)) {
      continue
    }

    const targetIsOnCurve =
      kind === 'implicit-cartesian'
        ? implicitTargetIsOnCurve(expression, goal.target)
        : kind === 'explicit-polar'
          ? explicitPolarTargetIsOnCurve(expression, goal.target)
          : false

    if (!targetIsOnCurve) {
      continue
    }

    const contactSegment = targetBoundaryContactSegment(goal.target, axes)
    if (contactSegment) {
      additions.push(contactSegment)
    }
  }

  return additions.length > 0 ? [...segments, ...additions] : segments
}

export function evaluateSectionPlot(
  section: SectionDefinition,
  placements: Record<string, TileId | null>,
): PlotResult | null {
  const builtExpression = buildExpression(section, placements)

  if (!builtExpression) {
    return null
  }

  const axes = resolveAxes(section)
  const segments =
    builtExpression.kind === 'implicit-cartesian'
        ? visibleImplicitCartesianSegments(builtExpression.expression, axes)
        : builtExpression.kind === 'implicit-polar'
          ? visibleImplicitPolarSegments(builtExpression.expression, axes, resolveParameterDomain(section))
          : builtExpression.kind === 'explicit-polar'
            ? visiblePolarSegments(builtExpression.expression, axes, resolveParameterDomain(section))
            : visibleCartesianSegments(builtExpression.expression, axes)
  const targetAwareSegments =
    builtExpression.kind === 'implicit-cartesian' || builtExpression.kind === 'explicit-polar'
      ? addBoundaryTargetSegments(builtExpression.kind, builtExpression.expression, axes, section.goals, segments)
      : segments
  const points = flattenSegments(targetAwareSegments)
  const hits = collectBoundaryHits(points, axes)
  const achievedGoalIds = section.goals
    .filter(
      (goal) =>
        goal.target
          ? matchesGoalByTarget(goal, targetAwareSegments)
          : hits.some((hit) => matchesGoal(goal, hit)),
    )
    .map((goal) => goal.id)

  return {
    expression: builtExpression.expression,
    screenLabel: formatEquationLabel(section, placements, false),
    points,
    segments: targetAwareSegments,
    hits,
    achievedGoalIds,
    hasVisiblePath: points.length > 1,
  }
}
