#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOLERANCE = 0.5
const BLANK = '\u25a1'
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PUZZLES_PATH = path.join(ROOT_DIR, 'PUZZLES.md')

const TILE_ORDER = ['x', '2', '+', '5', '-', '(', '1', '/', '^', ')', '0', 'theta', 'sin']
const INITIAL_TILES = ['x']

const TILE_DEFINITIONS = {
  x: { label: 'x', unlockNames: ['x'] },
  '2': { label: '2', unlockNames: ['2'] },
  '+': { label: '+', unlockNames: ['+'] },
  '5': { label: '5', unlockNames: ['5'] },
  '-': { label: '-', unlockNames: ['-'] },
  '(': { label: '(', unlockNames: ['left parenthesis', '('] },
  '1': { label: '1', unlockNames: ['1'] },
  '/': { label: '/', unlockNames: ['/'] },
  '^': { label: '^', unlockNames: ['^'] },
  ')': { label: ')', unlockNames: ['right parenthesis', ')'] },
  '0': { label: '0', unlockNames: ['0'] },
  theta: { label: 'theta', unlockNames: ['theta', '\u03b8', '\u0398'] },
  sin: { label: 'sin', unlockNames: ['sin'] },
}

const UNLOCK_NAME_TO_TILE_ID = new Map(
  Object.entries(TILE_DEFINITIONS).flatMap(([tileId, definition]) =>
    definition.unlockNames.map((name) => [normalizeCell(name), tileId]),
  ),
)

function normalizeCell(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function printUsage() {
  console.log(`Usage: node scripts/find-puzzle-solutions.mjs [--file PUZZLES.md] [--json]

Reads the Graphbound puzzle table, simulates tile unlocks in table order, and
prints every unique unlocked-tile equation that lands within ${TOLERANCE} graph
units of each row's target coordinate.`)
}

function parseArgs(args) {
  const options = {
    file: DEFAULT_PUZZLES_PATH,
    json: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--json') {
      options.json = true
      continue
    }

    if (arg === '--file') {
      const file = args[index + 1]
      if (!file) {
        throw new Error('--file needs a path')
      }
      options.file = path.resolve(process.cwd(), file)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function splitMarkdownTableRow(line) {
  const cells = []
  let cell = ''
  let escaping = false

  for (const character of line) {
    if (escaping) {
      cell += character
      escaping = false
      continue
    }

    if (character === '\\') {
      escaping = true
      continue
    }

    if (character === '|') {
      cells.push(cell.trim())
      cell = ''
      continue
    }

    cell += character
  }

  cells.push(cell.trim())

  if (cells[0] === '') {
    cells.shift()
  }
  if (cells.at(-1) === '') {
    cells.pop()
  }

  return cells
}

function headerKey(value) {
  return value.trim().toLowerCase()
}

function parseAxis(text, columnName, rowId) {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)/i)

  if (!match) {
    throw new Error(`Could not parse ${columnName} for ${rowId}: ${text}`)
  }

  return {
    min: Number(match[1]),
    max: Number(match[2]),
  }
}

function parseTarget(text, rowId) {
  const match = text.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/)

  if (!match) {
    throw new Error(`Could not parse target coordinate for ${rowId}: ${text}`)
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  }
}

function parsePuzzleRows(markdown) {
  const tableLines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))

  if (tableLines.length < 3) {
    throw new Error('PUZZLES.md does not contain a markdown table')
  }

  const headers = splitMarkdownTableRow(tableLines[0]).map(headerKey)
  const rows = []

  for (const line of tableLines.slice(2)) {
    const cells = splitMarkdownTableRow(line)
    if (cells.length !== headers.length) {
      throw new Error(`Table row has ${cells.length} cells, expected ${headers.length}: ${line}`)
    }

    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
    const id = row['#']

    rows.push({
      id,
      name: row['puzzle name'],
      equation: row.equation,
      intendedSolution: row.solution,
      unlocksPuzzle: row['unlocks puzzle'],
      unlocksTile: row['unlocks tile'],
      axes: {
        x: parseAxis(row['x-axis'], 'x-axis', id),
        y: parseAxis(row['y-axis'], 'y-axis', id),
      },
      target: parseTarget(row['target coordinate'], id),
    })
  }

  return rows
}

function unlockedTileId(unlockName) {
  const normalized = normalizeCell(unlockName)

  if (!normalized || normalized === 'none' || normalized === 'victory') {
    return null
  }

  const tileId = UNLOCK_NAME_TO_TILE_ID.get(normalized)

  if (!tileId) {
    throw new Error(`Unknown unlock tile: ${unlockName}`)
  }

  return tileId
}

function blankCount(equation) {
  return [...equation].filter((character) => character === BLANK).length
}

function fillEquation(template, tileIds) {
  let tileIndex = 0

  const filled = template.replaceAll(BLANK, () => {
    const tileId = tileIds[tileIndex]
    tileIndex += 1
    return ` ${TILE_DEFINITIONS[tileId].label} `
  })

  return prettifyEquation(filled)
}

function prettifyEquation(equation) {
  return equation
    .replace(/\u03b8/g, 'theta')
    .replace(/\u0398/g, 'theta')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\|\s+/g, '|')
    .replace(/\s+\|/g, '|')
    .replace(/=\|/g, '= |')
    .replace(/sin\s+\(/g, 'sin(')
    .replace(/cos\s+\(/g, 'cos(')
    .replace(/ln\s+\(/g, 'ln(')
    .replace(/log\s+\(/g, 'log(')
    .replace(/\s+\^\s+/g, ' ^ ')
    .replace(/\s+\/\s+/g, ' / ')
    .replace(/\s+=\s+/g, ' = ')
    .trim()
}

function* permutations(items, length, prefix = [], used = new Set()) {
  if (prefix.length === length) {
    yield prefix
    return
  }

  for (const item of items) {
    if (used.has(item)) {
      continue
    }

    used.add(item)
    prefix.push(item)
    yield* permutations(items, length, prefix, used)
    prefix.pop()
    used.delete(item)
  }
}

function normalizeEquationInput(input) {
  return input
    .replace(/\u03b8/g, 'theta')
    .replace(/\u0398/g, 'theta')
    .replace(/\u00b2/g, '^2')
    .replace(/\u03c0/g, 'pi')
    .replace(/\u2212/g, '-')
}

function tokenize(input) {
  const source = normalizeEquationInput(input)
  const tokens = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (/\d|\./.test(character)) {
      let end = index + 1
      while (end < source.length && /[\d.]/.test(source[end])) {
        end += 1
      }
      const value = source.slice(index, end)
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
        throw new Error(`Invalid number: ${value}`)
      }
      tokens.push({ type: 'number', value })
      index = end
      continue
    }

    if (/[A-Za-z]/.test(character)) {
      let end = index + 1
      while (end < source.length && /[A-Za-z]/.test(source[end])) {
        end += 1
      }
      tokens.push({ type: 'identifier', value: source.slice(index, end).toLowerCase() })
      index = end
      continue
    }

    if (source.startsWith('<=', index) || source.startsWith('>=', index)) {
      tokens.push({ type: 'operator', value: source.slice(index, index + 2) })
      index += 2
      continue
    }

    if ('+-*/^=()|<>;'.includes(character)) {
      tokens.push({ type: 'operator', value: character })
      index += 1
      continue
    }

    throw new Error(`Unexpected character: ${character}`)
  }

  return tokens
}

function isIntegerToken(token) {
  return token?.type === 'number' && /^\d+$/.test(token.value)
}

function isPrimaryStart(token) {
  if (!token) {
    return false
  }

  if (token.type === 'number') {
    return true
  }

  if (token.type === 'identifier') {
    return ['x', 'y', 'r', 'theta', 'sin', 'cos', 'ln', 'log', 'e', 'pi'].includes(token.value)
  }

  return token.type === 'operator' && token.value === '('
}

class TokenParser {
  constructor(tokens) {
    this.tokens = tokens
    this.index = 0
  }

  parseExpression() {
    const expression = this.parseAdditive()

    if (this.current()) {
      throw new Error(`Unexpected token: ${this.current().value}`)
    }

    return expression
  }

  current() {
    return this.tokens[this.index]
  }

  consume() {
    const token = this.current()
    if (!token) {
      throw new Error('Unexpected end of expression')
    }
    this.index += 1
    return token
  }

  matchOperator(value) {
    const token = this.current()
    if (token?.type !== 'operator' || token.value !== value) {
      return false
    }
    this.index += 1
    return true
  }

  expectOperator(value) {
    if (!this.matchOperator(value)) {
      throw new Error(`Expected ${value}`)
    }
  }

  matchIdentifier(value) {
    const token = this.current()
    if (token?.type !== 'identifier' || token.value !== value) {
      return false
    }
    this.index += 1
    return true
  }

  parseAdditive() {
    let expression = this.parseMultiplicative()

    while (true) {
      if (this.matchOperator('+')) {
        expression = `((${expression}) + (${this.parseMultiplicative()}))`
        continue
      }

      if (this.matchOperator('-')) {
        expression = `((${expression}) - (${this.parseMultiplicative()}))`
        continue
      }

      return expression
    }
  }

  parseMultiplicative() {
    let expression = this.parsePower()

    while (true) {
      if (this.matchOperator('/')) {
        expression = `((${expression}) / (${this.parsePower()}))`
        continue
      }

      if (this.matchOperator('*')) {
        expression = `((${expression}) * (${this.parsePower()}))`
        continue
      }

      if (isPrimaryStart(this.current())) {
        expression = `((${expression}) * (${this.parsePower()}))`
        continue
      }

      return expression
    }
  }

  parsePower() {
    let expression = this.parseUnary()

    while (this.matchOperator('^')) {
      expression = `Math.pow(${expression}, ${this.parseUnary()})`
    }

    return expression
  }

  parseUnary() {
    if (this.matchOperator('+')) {
      return this.parseUnary()
    }

    if (this.matchOperator('-')) {
      return `(-(${this.parseUnary()}))`
    }

    return this.parsePrimary()
  }

  parsePrimary() {
    const token = this.current()

    if (!token) {
      throw new Error('Missing primary expression')
    }

    if (this.matchOperator('(')) {
      const expression = this.parseAdditive()
      this.expectOperator(')')
      return `(${expression})`
    }

    if (this.matchOperator('|')) {
      const expression = this.parseAdditive()
      this.expectOperator('|')
      return `Math.abs(${expression})`
    }

    if (this.matchIdentifier('sin')) {
      this.expectOperator('(')
      const expression = this.parseAdditive()
      this.expectOperator(')')
      return `Math.sin(${expression})`
    }

    if (this.matchIdentifier('cos')) {
      this.expectOperator('(')
      const expression = this.parseAdditive()
      this.expectOperator(')')
      return `Math.cos(${expression})`
    }

    if (this.matchIdentifier('ln')) {
      this.expectOperator('(')
      const expression = this.parseAdditive()
      this.expectOperator(')')
      return `Math.log(${expression})`
    }

    if (this.matchIdentifier('log')) {
      this.expectOperator('(')
      const expression = this.parseAdditive()
      this.expectOperator(')')
      return `Math.log10(${expression})`
    }

    if (token.type === 'identifier') {
      if (['x', 'y', 'r', 'theta'].includes(token.value)) {
        this.consume()
        return token.value
      }

      if (token.value === 'e') {
        this.consume()
        return 'Math.E'
      }

      if (token.value === 'pi') {
        this.consume()
        return 'Math.PI'
      }
    }

    if (token.type === 'number') {
      let digits = this.consume().value

      while (isIntegerToken(this.current()) && /^\d+$/.test(digits)) {
        digits += this.consume().value
      }

      return digits
    }

    throw new Error(`Unsupported token: ${token.value}`)
  }
}

function parseExpression(tokens) {
  return new TokenParser(tokens).parseExpression()
}

function isSingleVariable(tokens, variable) {
  return tokens.length === 1 && tokens[0].type === 'identifier' && tokens[0].value === variable
}

function tokenIncludesPolarVariable(token) {
  return token.type === 'identifier' && (token.value === 'r' || token.value === 'theta')
}

function parseEquation(equation) {
  const tokens = tokenize(equation)
  const equalsIndex = tokens.findIndex((token) => token.type === 'operator' && token.value === '=')

  if (equalsIndex <= 0 || equalsIndex >= tokens.length - 1) {
    throw new Error(`Equation needs one complete equality: ${equation}`)
  }

  if (tokens.some((token, index) => index !== equalsIndex && token.type === 'operator' && token.value === '=')) {
    throw new Error(`Equation has multiple equalities: ${equation}`)
  }

  const leftTokens = tokens.slice(0, equalsIndex)
  const rightTokens = tokens.slice(equalsIndex + 1)
  const left = parseExpression(leftTokens)
  const right = parseExpression(rightTokens)
  const relation = `((${left}) - (${right}))`
  const relationFn = makeEvaluator(relation)
  const rightFn = makeEvaluator(right)
  const usesPolar = [...leftTokens, ...rightTokens].some(tokenIncludesPolarVariable)

  let kind = 'implicit-cartesian'

  if (isSingleVariable(leftTokens, 'y')) {
    kind = 'explicit-y'
  } else if (isSingleVariable(leftTokens, 'r')) {
    kind = 'explicit-r'
  } else if (usesPolar) {
    kind = 'implicit-polar'
  }

  return {
    kind,
    relationFn,
    rightFn,
  }
}

function makeEvaluator(expression) {
  return new Function(
    'x',
    'y',
    'r',
    'theta',
    `"use strict"; return ${expression};`,
  )
}

function finiteValue(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function normalizeAngle(theta) {
  const tau = Math.PI * 2
  return ((theta % tau) + tau) % tau
}

function targetPolar(target) {
  return {
    r: Math.hypot(target.x, target.y),
    theta: normalizeAngle(Math.atan2(target.y, target.x)),
  }
}

function matchesExplicitY(parsed, target) {
  const theta = target.x
  const y = parsed.rightFn(target.x, target.y, Math.hypot(target.x, target.y), theta)

  return finiteValue(y) && Math.abs(y - target.y) <= TOLERANCE
}

function matchesExplicitR(parsed, target) {
  const polar = targetPolar(target)
  const candidateAngles = [polar.theta]

  if (polar.theta > 0) {
    candidateAngles.push(polar.theta - Math.PI * 2)
  } else {
    candidateAngles.push(polar.theta + Math.PI * 2)
  }

  return candidateAngles.some((theta) => {
    const radius = parsed.rightFn(theta, 0, polar.r, theta)

    if (!finiteValue(radius)) {
      return false
    }

    return distance(
      {
        x: radius * Math.cos(theta),
        y: radius * Math.sin(theta),
      },
      target,
    ) <= TOLERANCE
  })
}

function relationValue(parsed, x, y, r, theta) {
  try {
    const value = parsed.relationFn(x, y, r, theta)
    return finiteValue(value) ? value : null
  } catch {
    return null
  }
}

function matchesImplicitCartesian(parsed, target) {
  const gridSteps = 28
  const values = []

  for (let yIndex = 0; yIndex <= gridSteps; yIndex += 1) {
    const y = target.y - TOLERANCE + (2 * TOLERANCE * yIndex) / gridSteps
    const row = []

    for (let xIndex = 0; xIndex <= gridSteps; xIndex += 1) {
      const x = target.x - TOLERANCE + (2 * TOLERANCE * xIndex) / gridSteps
      const value = relationValue(parsed, x, y, 0, x)
      const sample = value === null ? null : { value, point: { x, y } }
      row.push(sample)

      if (
        sample &&
        Math.abs(sample.value) <= 1e-5 &&
        distance(sample.point, target) <= TOLERANCE
      ) {
        return true
      }
    }

    values.push(row)
  }

  for (let yIndex = 0; yIndex < gridSteps; yIndex += 1) {
    for (let xIndex = 0; xIndex < gridSteps; xIndex += 1) {
      const current = values[yIndex][xIndex]
      const right = values[yIndex][xIndex + 1]
      const down = values[yIndex + 1][xIndex]

      if (
        (hasSampleSignChange(current, right) &&
          distanceToSegment(target, current.point, right.point) <= TOLERANCE) ||
        (hasSampleSignChange(current, down) &&
          distanceToSegment(target, current.point, down.point) <= TOLERANCE)
      ) {
        return true
      }
    }
  }

  return false
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    return distance(point, start)
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  )

  return distance(point, {
    x: start.x + dx * t,
    y: start.y + dy * t,
  })
}

function hasSampleSignChange(left, right) {
  if (!left || !right) {
    return false
  }

  return hasSignChange(left.value, right.value)
}

function hasSignChange(left, right) {
  if (left === null || right === null) {
    return false
  }

  return (left <= 0 && right >= 0) || (left >= 0 && right <= 0)
}

function matchesImplicitPolar(parsed, target) {
  const polar = targetPolar(target)
  const radiusMin = Math.max(0, polar.r - TOLERANCE * 1.5)
  const radiusMax = polar.r + TOLERANCE * 1.5
  const thetaSpread = polar.r > 0 ? Math.asin(Math.min(1, TOLERANCE / polar.r)) + 0.08 : Math.PI
  const thetaSteps = 24
  const radiusSteps = 48

  for (let thetaIndex = 0; thetaIndex <= thetaSteps; thetaIndex += 1) {
    const theta = polar.theta - thetaSpread + (2 * thetaSpread * thetaIndex) / thetaSteps
    let previousRadius = radiusMin
    let previousValue = relationValue(parsed, theta, 0, previousRadius, theta)

    for (let radiusIndex = 1; radiusIndex <= radiusSteps; radiusIndex += 1) {
      const radius = radiusMin + ((radiusMax - radiusMin) * radiusIndex) / radiusSteps
      const value = relationValue(parsed, theta, 0, radius, theta)

      if (value !== null && Math.abs(value) <= 1e-5) {
        const point = { x: radius * Math.cos(theta), y: radius * Math.sin(theta) }
        if (distance(point, target) <= TOLERANCE) {
          return true
        }
      }

      if (hasSignChange(previousValue, value)) {
        const rootRadius = bisectPolarRadius(parsed, theta, previousRadius, radius)
        const point = { x: rootRadius * Math.cos(theta), y: rootRadius * Math.sin(theta) }
        if (distance(point, target) <= TOLERANCE) {
          return true
        }
      }

      previousRadius = radius
      previousValue = value
    }
  }

  return false
}

function bisectPolarRadius(parsed, theta, low, high) {
  let lowValue = relationValue(parsed, theta, 0, low, theta)

  for (let index = 0; index < 32; index += 1) {
    const mid = (low + high) / 2
    const midValue = relationValue(parsed, theta, 0, mid, theta)

    if (midValue === null || lowValue === null) {
      return mid
    }

    if (hasSignChange(lowValue, midValue)) {
      high = mid
    } else {
      low = mid
      lowValue = midValue
    }
  }

  return (low + high) / 2
}

function matchesTarget(parsed, row) {
  if (parsed.kind === 'explicit-y') {
    return matchesExplicitY(parsed, row.target)
  }

  if (parsed.kind === 'explicit-r') {
    return matchesExplicitR(parsed, row.target)
  }

  if (parsed.kind === 'implicit-polar') {
    return matchesImplicitPolar(parsed, row.target)
  }

  return matchesImplicitCartesian(parsed, row.target)
}

function solveRow(row, availableTiles) {
  const count = blankCount(row.equation)
  const solutions = []
  const seen = new Set()

  if (count > availableTiles.length) {
    return solutions
  }

  for (const tileIds of permutations(availableTiles, count)) {
    const equation = fillEquation(row.equation, tileIds)

    if (seen.has(equation)) {
      continue
    }

    try {
      if (!hasMatchedParentheses(equation)) {
        continue
      }

      const parsed = parseEquation(equation)

      if (matchesTarget(parsed, row)) {
        seen.add(equation)
        solutions.push({
          equation,
          tiles: [...tileIds],
        })
      }
    } catch {
      continue
    }
  }

  return solutions
}

function hasMatchedParentheses(equation) {
  const tokens = tokenize(equation)
  let balance = 0

  for (const token of tokens) {
    if (token.type !== 'operator') {
      continue
    }

    if (token.value === '(') {
      balance += 1
    } else if (token.value === ')') {
      balance -= 1
    }

    if (balance < 0) {
      return false
    }
  }

  return balance === 0
}

function solveAll(rows) {
  const unlockedTiles = new Set(INITIAL_TILES)
  const results = []

  for (const row of rows) {
    const availableTiles = TILE_ORDER.filter(
      (tileId) => unlockedTiles.has(tileId) && tileAllowedForPuzzleMode(tileId, row),
    )
    const solutions = solveRow(row, availableTiles)

    results.push({
      id: row.id,
      name: row.name,
      equationTemplate: row.equation,
      intendedSolution: row.intendedSolution,
      unlocksPuzzle: row.unlocksPuzzle,
      unlocksTile: row.unlocksTile,
      availableTiles,
      target: row.target,
      solutions,
    })

    const tileId = unlockedTileId(row.unlocksTile)
    if (tileId) {
      unlockedTiles.add(tileId)
    }
  }

  return results
}

function tileAllowedForPuzzleMode(tileId, row) {
  const polar = /^\s*r\b/i.test(row.equation)

  if (polar) {
    return tileId !== 'x'
  }

  return tileId !== 'theta'
}

function formatTileList(tileIds) {
  return tileIds.map((tileId) => TILE_DEFINITIONS[tileId].label).join(', ')
}

function printText(results) {
  let totalSolutions = 0

  for (const result of results) {
    totalSolutions += result.solutions.length
    console.log(`${result.id} ${result.name}`)
    console.log(`  unlocked tiles: ${formatTileList(result.availableTiles)}`)
    console.log(`  target: (${result.target.x}, ${result.target.y})`)
    console.log(`  intended: ${result.intendedSolution}`)

    if (result.solutions.length === 0) {
      console.log('  solutions: none found')
    } else {
      console.log(`  solutions (${result.solutions.length}):`)

      for (const solution of result.solutions) {
        console.log(`    - ${solution.equation}    [${formatTileList(solution.tiles)}]`)
      }
    }

    console.log('')
  }

  console.log(`Found ${totalSolutions} total solutions across ${results.length} puzzle rows.`)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const markdown = readFileSync(options.file, 'utf8')
  const rows = parsePuzzleRows(markdown)
  const results = solveAll(rows)

  if (options.json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  printText(results)
}

main()
