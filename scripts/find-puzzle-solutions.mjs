#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOLERANCE = 0.5
const MIN_TILE_USAGE = 3
const MIN_AXIS_SPAN = 5
const MAX_AXIS_SPAN = 20
const BLANK = '\u25a1'
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PUZZLES_PATH = path.join(ROOT_DIR, 'puzzles.json')

const TILE_ORDER = ['x', '2', '+', '5', '-', '(', '/', '^', ')', '0', 'y', '=', 'theta', 'sin', 'pi']
const INITIAL_TILES = ['x']

const TILE_DEFINITIONS = {
  x: { label: 'x', unlockNames: ['x'] },
  '2': { label: '2', unlockNames: ['2'] },
  '+': { label: '+', unlockNames: ['+'] },
  '5': { label: '5', unlockNames: ['5'] },
  '-': { label: '-', unlockNames: ['-'] },
  '(': { label: '(', unlockNames: ['left parenthesis', '('] },
  '/': { label: '/', unlockNames: ['/'] },
  '^': { label: '^', unlockNames: ['^'] },
  ')': { label: ')', unlockNames: ['right parenthesis', ')'] },
  '0': { label: '0', unlockNames: ['0'] },
  y: { label: 'y', unlockNames: ['y'] },
  '=': { label: '=', unlockNames: ['=', 'equals'] },
  theta: { label: 'theta', unlockNames: ['theta', '\u03b8', '\u0398'] },
  sin: { label: 'sin', unlockNames: ['sin'] },
  pi: { label: 'pi', unlockNames: ['pi', '\u03c0'] },
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
  console.log(`Usage: node scripts/find-puzzle-solutions.mjs [--file puzzles.json] [--json] [row-id ...]

Reads Graphbound puzzle data from puzzles.json, simulates tile unlocks in data
order, groups lettered rows by puzzle number, and prints every unique
unlocked-tile equation that lands within ${TOLERANCE} graph units of any target
in that puzzle group. The first row in each puzzle group supplies the equation
template; later lettered rows are treated as additional intended
solutions/targets for that same puzzle. Pass one or more puzzle ids or row ids,
such as 8 or 20a, to print only those puzzle groups after simulating the full
unlock path up to them.`)
}

function puzzleIdFromRowId(rowId) {
  const match = rowId.match(/^(\d+)/)
  return match ? match[1] : rowId.toLowerCase()
}

function normalizePuzzleSelector(value) {
  return puzzleIdFromRowId(value.toLowerCase())
}

function parseArgs(args) {
  const options = {
    file: DEFAULT_PUZZLES_PATH,
    json: false,
    rowIds: [],
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

    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}`)
    }

    options.rowIds.push(arg.toLowerCase())
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
      puzzleId: puzzleIdFromRowId(id),
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

function loadPuzzleRows(filePath, source) {
  if (path.extname(filePath).toLowerCase() === '.json') {
    return parsePuzzleJson(JSON.parse(source), filePath)
  }

  return parsePuzzleRows(source)
}

function parsePuzzleJson(data, filePath) {
  const sourceRows = Array.isArray(data) ? data : data.rows

  if (!Array.isArray(sourceRows)) {
    throw new Error(`${filePath} must contain a top-level rows array`)
  }

  return sourceRows.map((row, index) => normalizeJsonPuzzleRow(row, index, filePath))
}

function normalizeJsonPuzzleRow(row, index, filePath) {
  if (!row || typeof row !== 'object') {
    throw new Error(`${filePath} row ${index + 1} must be an object`)
  }

  const id = requiredString(row.id, `row ${index + 1}.id`)
  const name = requiredString(row.name ?? row.puzzleName, `${id}.name`)
  const equation = requiredString(row.equation, `${id}.equation`)
  const intendedSolution = requiredString(
    row.intendedSolution ?? row.solution,
    `${id}.intendedSolution`,
  )

  return {
    id,
    puzzleId: row.puzzleId ? String(row.puzzleId) : puzzleIdFromRowId(id),
    name,
    equation,
    intendedSolution,
    unlocksPuzzle: optionalString(row.unlocksPuzzle, 'none'),
    unlocksTile: optionalString(row.unlocksTile, 'none'),
    axes: {
      x: normalizeJsonAxis(row.axes?.x, `${id}.axes.x`),
      y: normalizeJsonAxis(row.axes?.y, `${id}.axes.y`),
    },
    target: normalizeJsonTarget(row.target, `${id}.target`),
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }

  return value
}

function optionalString(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value !== 'string') {
    throw new Error(`Expected string value, received ${typeof value}`)
  }

  return value
}

function normalizeJsonAxis(axis, label) {
  if (!axis || typeof axis !== 'object') {
    throw new Error(`${label} must be an object with min and max`)
  }

  return {
    min: finiteNumber(axis.min, `${label}.min`),
    max: finiteNumber(axis.max, `${label}.max`),
  }
}

function normalizeJsonTarget(target, label) {
  if (!target || typeof target !== 'object') {
    throw new Error(`${label} must be an object with x and y`)
  }

  return {
    x: finiteNumber(target.x, `${label}.x`),
    y: finiteNumber(target.y, `${label}.y`),
  }
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }

  return value
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

function blankOnlyRightSide(equation) {
  const match = equation.match(/^\s*(?:y|r)\s*=\s*(.*?)\s*$/i)
  return Boolean(match && match[1].replace(/\s+/g, '').replaceAll(BLANK, '') === '')
}

function allTokensBlank(equation) {
  return equation.replace(/\s+/g, '').replaceAll(BLANK, '') === ''
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

function normalizeEquationForCompare(equation) {
  return prettifyEquation(equation)
    .replace(/\s+/g, '')
    .replace(/\u03b8/g, 'theta')
    .replace(/\u0398/g, 'theta')
    .toLowerCase()
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

function* slotPermutations(candidateLists, prefix = [], used = new Set()) {
  if (prefix.length === candidateLists.length) {
    yield prefix
    return
  }

  for (const item of candidateLists[prefix.length]) {
    if (used.has(item)) {
      continue
    }

    used.add(item)
    prefix.push(item)
    yield* slotPermutations(candidateLists, prefix, used)
    prefix.pop()
    used.delete(item)
  }
}

function inferredIntendedTiles(row) {
  const count = blankCount(row.equation)

  if (count === 0) {
    return []
  }

  const directTiles = directlyInferredIntendedTiles(row)
  if (directTiles) {
    return directTiles
  }

  const expected = normalizeEquationForCompare(row.intendedSolution)

  for (const tileIds of permutations(TILE_ORDER, count)) {
    if (normalizeEquationForCompare(fillEquation(row.equation, tileIds)) === expected) {
      return tileIds
    }
  }

  return null
}

function directlyInferredIntendedTiles(row) {
  const count = blankCount(row.equation)
  const intendedTokens = tokenize(row.intendedSolution)
  let fillTokens = null

  if (allTokensBlank(row.equation)) {
    fillTokens = intendedTokens
  } else if (blankOnlyRightSide(row.equation)) {
    const equalsIndex = intendedTokens.findIndex(
      (token) => token.type === 'operator' && token.value === '=',
    )
    if (equalsIndex >= 0) {
      fillTokens = intendedTokens.slice(equalsIndex + 1)
    }
  }

  if (!fillTokens || fillTokens.length !== count) {
    return null
  }

  const tileIds = fillTokens.map(tileIdForToken)

  if (tileIds.some((tileId) => tileId === null)) {
    return null
  }

  return tileIds
}

function tileIdForToken(token) {
  if (token.type === 'number') {
    return TILE_DEFINITIONS[token.value] ? token.value : null
  }

  if (token.type === 'identifier') {
    if (token.value === 'theta') {
      return 'theta'
    }

    if (TILE_DEFINITIONS[token.value]) {
      return token.value
    }

    return null
  }

  if (token.type === 'operator') {
    return TILE_DEFINITIONS[token.value] ? token.value : null
  }

  return null
}

function slotCandidateLists(row, availableTiles, intendedRows = [row]) {
  const count = blankCount(row.equation)

  if (count === 0) {
    return []
  }

  if (count === 1 || blankOnlyRightSide(row.equation) || allTokensBlank(row.equation)) {
    return Array.from({ length: count }, () => availableTiles)
  }

  const candidateSets = Array.from({ length: count }, () => new Set())

  for (const intendedRow of intendedRows) {
    const intendedTiles = inferredIntendedTiles({
      ...intendedRow,
      equation: row.equation,
    })

    if (!intendedTiles) {
      continue
    }

    intendedTiles.forEach((tileId, index) => {
      if (availableTiles.includes(tileId)) {
        candidateSets[index].add(tileId)
      }
    })
  }

  if (candidateSets.some((candidates) => candidates.size === 0)) {
    return Array.from({ length: count }, () => availableTiles)
  }

  return candidateSets.map((candidates) => [...candidates])
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

class AstParser {
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
        expression = makeAdd([expression, this.parseMultiplicative()])
        continue
      }

      if (this.matchOperator('-')) {
        expression = makeAdd([expression, makeNeg(this.parseMultiplicative())])
        continue
      }

      return expression
    }
  }

  parseMultiplicative() {
    let expression = this.parsePower()

    while (true) {
      if (this.matchOperator('/')) {
        expression = makeMul([expression, { type: 'inv', value: this.parsePower() }])
        continue
      }

      if (this.matchOperator('*')) {
        expression = makeMul([expression, this.parsePower()])
        continue
      }

      if (isPrimaryStart(this.current())) {
        expression = makeMul([expression, this.parsePower()])
        continue
      }

      return expression
    }
  }

  parsePower() {
    let expression = this.parseUnary()

    while (this.matchOperator('^')) {
      expression = { type: 'pow', base: expression, exponent: this.parseUnary() }
    }

    return expression
  }

  parseUnary() {
    if (this.matchOperator('+')) {
      return this.parseUnary()
    }

    if (this.matchOperator('-')) {
      return makeNeg(this.parseUnary())
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
      return expression
    }

    if (this.matchOperator('|')) {
      const expression = this.parseAdditive()
      this.expectOperator('|')
      return { type: 'fn', name: 'abs', arg: expression }
    }

    for (const name of ['sin', 'cos', 'ln', 'log']) {
      if (this.matchIdentifier(name)) {
        this.expectOperator('(')
        const expression = this.parseAdditive()
        this.expectOperator(')')
        return { type: 'fn', name, arg: expression }
      }
    }

    if (token.type === 'identifier') {
      if (['x', 'y', 'r', 'theta'].includes(token.value)) {
        this.consume()
        return { type: 'var', name: token.value }
      }

      if (token.value === 'e' || token.value === 'pi') {
        this.consume()
        return { type: 'const', name: token.value }
      }
    }

    if (token.type === 'number') {
      let digits = this.consume().value

      while (isIntegerToken(this.current()) && /^\d+$/.test(digits)) {
        digits += this.consume().value
      }

      return { type: 'num', value: Number(digits) }
    }

    throw new Error(`Unsupported token: ${token.value}`)
  }
}

function makeAdd(values) {
  return { type: 'add', values }
}

function makeMul(values) {
  return { type: 'mul', values }
}

function makeNeg(value) {
  return { type: 'neg', value }
}

function parseExpressionAst(tokens) {
  return new AstParser(tokens).parseExpression()
}

function canonicalExpressionKey(node) {
  switch (node.type) {
    case 'num':
      return `num:${node.value}`
    case 'var':
      return `var:${node.name}`
    case 'const':
      return `const:${node.name}`
    case 'neg':
      return `neg(${canonicalExpressionKey(node.value)})`
    case 'inv':
      return `inv(${canonicalExpressionKey(node.value)})`
    case 'fn':
      return `fn:${node.name}(${canonicalExpressionKey(node.arg)})`
    case 'pow':
      return `pow(${canonicalExpressionKey(node.base)},${canonicalExpressionKey(node.exponent)})`
    case 'add':
      return `add(${flattenCanonicalParts(node, 'add').sort().join(',')})`
    case 'mul':
      return `mul(${flattenCanonicalParts(node, 'mul').sort().join(',')})`
    default:
      throw new Error(`Unsupported AST node: ${node.type}`)
  }
}

function simplifyAst(node) {
  switch (node.type) {
    case 'num':
    case 'var':
    case 'const':
      return node
    case 'neg': {
      const value = simplifyAst(node.value)
      if (value.type === 'num') {
        return { type: 'num', value: -value.value }
      }
      if (value.type === 'neg') {
        return simplifyAst(value.value)
      }
      return { type: 'neg', value }
    }
    case 'inv': {
      const value = simplifyAst(node.value)
      if (value.type === 'num' && value.value !== 0) {
        return { type: 'num', value: 1 / value.value }
      }
      return { type: 'inv', value }
    }
    case 'fn':
      return { ...node, arg: simplifyAst(node.arg) }
    case 'pow': {
      const base = simplifyAst(node.base)
      const exponent = simplifyAst(node.exponent)
      if (exponent.type === 'num') {
        if (exponent.value === 0) {
          return { type: 'num', value: 1 }
        }
        if (exponent.value === 1) {
          return base
        }
      }
      if (base.type === 'num' && exponent.type === 'num') {
        const value = Math.pow(base.value, exponent.value)
        if (Number.isFinite(value)) {
          return { type: 'num', value }
        }
      }
      return { type: 'pow', base, exponent }
    }
    case 'add':
      return simplifyAdd(node.values)
    case 'mul':
      return simplifyMul(node.values)
    default:
      throw new Error(`Unsupported AST node: ${node.type}`)
  }
}

function simplifyAdd(values) {
  const parts = []
  let numericSum = 0

  for (const value of values.map(simplifyAst)) {
    const flattened = value.type === 'add' ? value.values.map(simplifyAst) : [value]

    for (const part of flattened) {
      if (part.type === 'num') {
        numericSum += part.value
      } else {
        parts.push(part)
      }
    }
  }

  if (numericSum !== 0) {
    parts.push({ type: 'num', value: numericSum })
  }

  if (parts.length === 0) {
    return { type: 'num', value: 0 }
  }

  if (parts.length === 1) {
    return parts[0]
  }

  return { type: 'add', values: parts }
}

function simplifyMul(values) {
  const parts = []
  let numericProduct = 1

  for (const value of values.map(simplifyAst)) {
    const flattened = value.type === 'mul' ? value.values.map(simplifyAst) : [value]

    for (const part of flattened) {
      if (part.type === 'num') {
        numericProduct *= part.value
      } else {
        parts.push(part)
      }
    }
  }

  if (numericProduct === 0) {
    return { type: 'num', value: 0 }
  }

  if (numericProduct !== 1 || parts.length === 0) {
    parts.push({ type: 'num', value: numericProduct })
  }

  if (parts.length === 1) {
    return parts[0]
  }

  return { type: 'mul', values: parts }
}

function flattenCanonicalParts(node, type) {
  if (node.type !== type) {
    return [canonicalExpressionKey(node)]
  }

  return node.values.flatMap((value) => flattenCanonicalParts(value, type))
}

function isSingleVariable(tokens, variable) {
  return tokens.length === 1 && tokens[0].type === 'identifier' && tokens[0].value === variable
}

function tokenIncludesPolarVariable(token) {
  return token.type === 'identifier' && (token.value === 'r' || token.value === 'theta')
}

function tokenIncludesOutputVariable(token) {
  return token.type === 'identifier' && (token.value === 'y' || token.value === 'r')
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
  const leftAst = simplifyAst(parseExpressionAst(leftTokens))
  const rightAst = simplifyAst(parseExpressionAst(rightTokens))
  const relation = `((${left}) - (${right}))`
  const relationFn = makeEvaluator(relation)
  const rightFn = makeEvaluator(right)
  const usesPolar = [...leftTokens, ...rightTokens].some(tokenIncludesPolarVariable)

  let kind = 'implicit-cartesian'

  const rightUsesOutputVariable = rightTokens.some(tokenIncludesOutputVariable)

  if (isSingleVariable(leftTokens, 'y') && !rightUsesOutputVariable) {
    kind = 'explicit-y'
  } else if (isSingleVariable(leftTokens, 'r') && !rightUsesOutputVariable) {
    kind = 'explicit-r'
  } else if (usesPolar) {
    kind = 'implicit-polar'
  }

  return {
    kind,
    canonicalKey: `eq(${canonicalExpressionKey(leftAst)},${canonicalExpressionKey(rightAst)})`,
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

function matchesExplicitY(parsed, row) {
  const { target } = row
  let targetValue = null

  try {
    targetValue = parsed.rightFn(target.x, target.y, Math.hypot(target.x, target.y), target.x)
  } catch {
    targetValue = null
  }

  if (target.x === 0 && target.y === row.axes.y.max && targetValue === Infinity) {
    return true
  }

  if (target.x === 0 && target.y === row.axes.y.min && targetValue === -Infinity) {
    return true
  }

  const sampleSteps = 40
  let previousPoint = null

  for (let index = 0; index <= sampleSteps; index += 1) {
    const x = target.x - TOLERANCE + (2 * TOLERANCE * index) / sampleSteps
    const y = parsed.rightFn(x, target.y, Math.hypot(x, target.y), x)

    if (!finiteValue(y)) {
      previousPoint = null
      continue
    }

    const point = { x, y }

    if (distance(point, target) <= TOLERANCE) {
      return true
    }

    if (previousPoint && distanceToSegment(target, previousPoint, point) <= TOLERANCE) {
      return true
    }

    previousPoint = point
  }

  return false
}

function matchesExplicitR(parsed, target) {
  const polar = targetPolar(target)
  const thetaSpread = polar.r > 0 ? Math.asin(Math.min(1, TOLERANCE / polar.r)) + 0.08 : Math.PI
  const sampleSteps = 48
  let previousPoint = null

  for (let index = 0; index <= sampleSteps; index += 1) {
    const theta = polar.theta - thetaSpread + (2 * thetaSpread * index) / sampleSteps
    const radius = parsed.rightFn(theta, 0, polar.r, theta)

    if (!finiteValue(radius)) {
      previousPoint = null
      continue
    }

    const point = {
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
    }

    if (distance(point, target) <= TOLERANCE) {
      return true
    }

    if (previousPoint && distanceToSegment(target, previousPoint, point) <= TOLERANCE) {
      return true
    }

    previousPoint = point
  }

  return false
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
    return matchesExplicitY(parsed, row)
  }

  if (parsed.kind === 'explicit-r') {
    return matchesExplicitR(parsed, row.target)
  }

  if (parsed.kind === 'implicit-polar') {
    return matchesImplicitPolar(parsed, row.target)
  }

  return matchesImplicitCartesian(parsed, row.target)
}

function solveRow(row, availableTiles, intendedRows = [row]) {
  const candidateLists = slotCandidateLists(row, availableTiles, intendedRows)
  const solutionsByKey = new Map()
  const seen = new Set()
  const allBlankEquation = allTokensBlank(row.equation)

  if (candidateLists.some((candidates) => candidates.length === 0)) {
    return []
  }

  for (const tileIds of slotPermutations(candidateLists)) {
    if (allBlankEquation && !hasViableAllBlankEquationSequence(tileIds)) {
      continue
    }

    const equation = fillEquation(row.equation, tileIds)

    if (seen.has(equation)) {
      continue
    }

    try {
      if (!hasValidOperatorPlacement(equation, row)) {
        continue
      }

      if (!hasMatchedParentheses(equation)) {
        continue
      }

      const parsed = parseEquation(equation)

      if (matchesTarget(parsed, row)) {
        seen.add(equation)
        const variant = {
          equation,
          tiles: [...tileIds],
        }
        const existing = solutionsByKey.get(parsed.canonicalKey)

        if (existing) {
          existing.variants.push(variant)
          existing.variantCount = existing.variants.length
        } else {
          solutionsByKey.set(parsed.canonicalKey, {
            ...variant,
            canonicalKey: parsed.canonicalKey,
            variantCount: 1,
            variants: [variant],
          })
        }
      }
    } catch {
      continue
    }
  }

  return [...solutionsByKey.values()]
}

function hasViableAllBlankEquationSequence(tileIds) {
  const equalsIndex = tileIds.indexOf('=')
  const yIndex = tileIds.indexOf('y')

  if (equalsIndex <= 0 || equalsIndex >= tileIds.length - 1 || yIndex < 0 || yIndex > equalsIndex) {
    return false
  }

  const leftTiles = tileIds.slice(0, equalsIndex)
  const leftIsY = leftTiles.length === 1 && leftTiles[0] === 'y'
  const leftIsScaledY = leftTiles.length === 2 && /^\d+$/.test(leftTiles[0]) && leftTiles[1] === 'y'

  return leftIsY || leftIsScaledY
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

function tokenIsNumber(token) {
  return token?.type === 'number'
}

function tokenIsIdentifier(token, value) {
  return token?.type === 'identifier' && token.value === value
}

function tokensWithoutSolvedOutputVariable(tokens) {
  const equalsIndex = tokens.findIndex((token) => token.type === 'operator' && token.value === '=')
  if (equalsIndex <= 0) {
    return tokens
  }

  const leftTokens = tokens.slice(0, equalsIndex)
  const leftIsOutput =
    (leftTokens.length === 1 && (tokenIsIdentifier(leftTokens[0], 'y') || tokenIsIdentifier(leftTokens[0], 'r'))) ||
    (leftTokens.length === 2 &&
      tokenIsNumber(leftTokens[0]) &&
      (tokenIsIdentifier(leftTokens[1], 'y') || tokenIsIdentifier(leftTokens[1], 'r')))

  return leftIsOutput ? tokens.slice(equalsIndex + 1) : tokens
}

function tokensFormSolvedOutputVariable(tokens) {
  return (
    (tokens.length === 1 && (tokenIsIdentifier(tokens[0], 'y') || tokenIsIdentifier(tokens[0], 'r'))) ||
    (tokens.length === 2 &&
      tokenIsNumber(tokens[0]) &&
      (tokenIsIdentifier(tokens[1], 'y') || tokenIsIdentifier(tokens[1], 'r')))
  )
}

function hasRequiredVariablePairs(equation) {
  const relevantTokens = tokensWithoutSolvedOutputVariable(tokenize(equation))
  const hasX = relevantTokens.some((token) => tokenIsIdentifier(token, 'x'))
  const hasY = relevantTokens.some((token) => tokenIsIdentifier(token, 'y'))
  const hasR = relevantTokens.some((token) => tokenIsIdentifier(token, 'r'))
  const hasTheta = relevantTokens.some((token) => tokenIsIdentifier(token, 'theta'))

  return (!hasY || hasX) && (!hasR || hasTheta)
}

function isExpressionOperator(token) {
  return token?.type === 'operator' && ['+', '-', '/', '^', '='].includes(token.value)
}

function isStrictBinaryOperator(token) {
  return token?.type === 'operator' && ['+', '/', '^', '='].includes(token.value)
}

function tokenIsVariable(token) {
  return token?.type === 'identifier' && ['x', 'y', 'r', 'theta'].includes(token.value)
}

function tokenCanStartSinArgument(token) {
  if (!token) {
    return false
  }

  if (token.type === 'number') {
    return true
  }

  if (token.type === 'identifier') {
    return ['x', 'y', 'r', 'theta', 'pi'].includes(token.value)
  }

  return token.type === 'operator' && token.value === '('
}

function tokenCanStartUnaryOperand(token) {
  if (!token) {
    return false
  }

  if (token.type === 'number') {
    return true
  }

  if (token.type === 'identifier') {
    return ['x', 'y', 'r', 'theta', 'sin', 'pi'].includes(token.value)
  }

  return token.type === 'operator' && token.value === '('
}

function sinArgumentStartToken(tokens, sinIndex) {
  const next = tokens[sinIndex + 1]
  return next?.type === 'operator' && next.value === '(' ? tokens[sinIndex + 2] : next
}

function tokenIsUnarySign(tokens, index) {
  const token = tokens[index]
  if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
    return false
  }

  const previous = tokens[index - 1]
  return (
    previous?.type === 'operator' &&
    previous.value === '=' &&
    !tokensFormSolvedOutputVariable(tokens.slice(0, index - 1))
  )
}

function hasValidOperatorPlacement(equation, row) {
  const tokens = tokenize(equation)
  const equalsIndexes = tokens
    .map((token, index) => (token.type === 'operator' && token.value === '=' ? index : -1))
    .filter((index) => index >= 0)

  if (equalsIndexes.length !== 1 || equalsIndexes[0] === 0 || equalsIndexes[0] === tokens.length - 1) {
    return false
  }

  if (!hasRequiredVariablePairs(equation)) {
    return false
  }

  const equalsIndex = equalsIndexes[0]
  const yIndexes = tokens
    .map((token, index) => (token.type === 'identifier' && token.value === 'y' ? index : -1))
    .filter((index) => index >= 0)
  const hasPolarVariable = tokens.some(
    (token) => token.type === 'identifier' && (token.value === 'r' || token.value === 'theta'),
  )

  if (!hasPolarVariable) {
    if (yIndexes.length < 1 || !yIndexes.some((index) => index < equalsIndex)) {
      return false
    }

    if (allTokensBlank(row.equation)) {
      const leftTokens = tokens.slice(0, equalsIndex)
      const leftIsY =
        leftTokens.length === 1 && leftTokens[0].type === 'identifier' && leftTokens[0].value === 'y'
      const leftIsScaledY =
        leftTokens.length === 2 &&
        leftTokens[0].type === 'number' &&
        leftTokens[1].type === 'identifier' &&
        leftTokens[1].value === 'y'

      if (!leftIsY && !leftIsScaledY) {
        return false
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (token.type === 'identifier' && token.value === 'sin' && !tokenCanStartSinArgument(sinArgumentStartToken(tokens, index))) {
      return false
    }

    if (tokenIsVariable(token) && tokenIsVariable(tokens[index + 1])) {
      return false
    }

    if (token.type !== 'operator') {
      continue
    }

    const previous = tokens[index - 1]
    const next = tokens[index + 1]
    const unarySign = tokenIsUnarySign(tokens, index)

    if (unarySign && !tokenCanStartUnaryOperand(next)) {
      return false
    }

    if (!unarySign && ['+', '/', '^', '='].includes(token.value) && (index === 0 || index === tokens.length - 1)) {
      return false
    }

    if (token.value === '-' && index === tokens.length - 1) {
      return false
    }

    if (token.value === '^' || token.value === '=') {
      if (isExpressionOperator(previous) || (isExpressionOperator(next) && !tokenIsUnarySign(tokens, index + 1))) {
        return false
      }
    }

    if (!unarySign && isStrictBinaryOperator(token) && isExpressionOperator(previous)) {
      return false
    }

    if (!unarySign && token.value === '+' && isExpressionOperator(next)) {
      return false
    }
  }

  return true
}

function rowUnlockContexts(rows) {
  const unlockedTiles = new Set(INITIAL_TILES)
  const contexts = new Map()

  for (const row of rows) {
    contexts.set(row.id, {
      row,
      unlockedTiles: new Set(unlockedTiles),
    })

    const tileId = unlockedTileId(row.unlocksTile)
    if (tileId) {
      unlockedTiles.add(tileId)
    }
  }

  return contexts
}

function puzzleGroups(rows) {
  const groups = new Map()

  for (const row of rows) {
    if (!groups.has(row.puzzleId)) {
      groups.set(row.puzzleId, {
        id: row.puzzleId,
        rows: [],
      })
    }

    groups.get(row.puzzleId).rows.push(row)
  }

  return [...groups.values()]
}

function canonicalKeyForEquation(equation) {
  try {
    return parseEquation(equation).canonicalKey
  } catch {
    return null
  }
}

function mergeGroupSolution(solutionsByKey, solution, targetRow) {
  let existing = solutionsByKey.get(solution.canonicalKey)

  if (!existing) {
    existing = {
      equation: solution.equation,
      tiles: [...solution.tiles],
      canonicalKey: solution.canonicalKey,
      variantCount: 0,
      variants: [],
      variantKeys: new Set(),
      matchedRows: [],
    }
    solutionsByKey.set(solution.canonicalKey, existing)
  }

  for (const variant of solution.variants) {
    const variantKey = `${variant.equation}\0${variant.tiles.join(',')}`

    if (existing.variantKeys.has(variantKey)) {
      continue
    }

    existing.variantKeys.add(variantKey)
    existing.variants.push({
      equation: variant.equation,
      tiles: [...variant.tiles],
    })
  }

  if (!existing.matchedRows.some((row) => row.id === targetRow.id)) {
    existing.matchedRows.push({
      id: targetRow.id,
      target: targetRow.target,
      intendedSolution: targetRow.intendedSolution,
    })
  }

  existing.variantCount = existing.variants.length
}

function finalizeGroupSolution(solution, intendedRowsByKey) {
  const { variantKeys, ...publicSolution } = solution
  const intendedRows = intendedRowsByKey.get(solution.canonicalKey) ?? []

  return {
    ...publicSolution,
    intended: intendedRows.length > 0,
    intendedRows,
  }
}

function solvePuzzleGroup(group, rowContexts) {
  const representative = group.rows[0]
  const representativeEquation = representative.equation
  const allowedNonIntendedCount =
    representative.name === 'Finale' && allTokensBlank(representativeEquation) ? 2 : 1
  const equationIssues = group.rows
    .filter((row) => row.equation.trim() !== representativeEquation.trim())
    .map((row) => ({
      id: row.id,
      equation: row.equation,
    }))
  const intendedRowsByKey = new Map()
  const intendedRows = group.rows.map((row) => {
    const canonicalKey = canonicalKeyForEquation(row.intendedSolution)
    const intended = {
      id: row.id,
      solution: row.intendedSolution,
      canonicalKey,
      target: row.target,
    }

    if (canonicalKey) {
      const rowsForKey = intendedRowsByKey.get(canonicalKey) ?? []
      rowsForKey.push({
        id: row.id,
        solution: row.intendedSolution,
      })
      intendedRowsByKey.set(canonicalKey, rowsForKey)
    }

    return intended
  })
  const duplicateIntendedRows = [...intendedRowsByKey.values()].filter((rowsForKey) => rowsForKey.length > 1)
  const solutionsByKey = new Map()
  const availableByRow = []

  for (const targetRow of group.rows) {
    const context = rowContexts.get(targetRow.id)
    const availableTiles = TILE_ORDER.filter(
      (tileId) => context.unlockedTiles.has(tileId) && tileAllowedForPuzzleMode(tileId, representative),
    )
    const solverRow = {
      ...targetRow,
      equation: representativeEquation,
    }
    const rowSolutions = solveRow(solverRow, availableTiles, group.rows)

    availableByRow.push({
      id: targetRow.id,
      availableTiles,
    })

    for (const solution of rowSolutions) {
      mergeGroupSolution(solutionsByKey, solution, targetRow)
    }
  }

  const solutions = [...solutionsByKey.values()].map((solution) =>
    finalizeGroupSolution(solution, intendedRowsByKey),
  )
  const nonIntendedSolutions = solutions.filter((solution) => !solution.intended)
  const foundCanonicalKeys = new Set(solutions.map((solution) => solution.canonicalKey))
  const missingIntendedRows = intendedRows.filter(
    (row) => row.canonicalKey && !foundCanonicalKeys.has(row.canonicalKey),
  )

  return {
    id: group.id,
    rowIds: group.rows.map((row) => row.id),
    name: representative.name,
    equationTemplate: representativeEquation,
    intendedSolutions: intendedRows,
    representativeRowId: representative.id,
    availableByRow,
    solutions,
    nonIntendedSolutions,
    missingIntendedRows,
    issues: {
      differentEquations: equationIssues,
      duplicateIntendedSolutions: duplicateIntendedRows,
    },
    requirement: {
      intendedCount: group.rows.length,
      uniqueIntendedCount: intendedRowsByKey.size,
      solutionCount: solutions.length,
      nonIntendedCount: nonIntendedSolutions.length,
      expectedMinimum: group.rows.length,
      expectedMaximum: group.rows.length + allowedNonIntendedCount,
      allowedNonIntendedCount,
      passes:
        equationIssues.length === 0 &&
        duplicateIntendedRows.length === 0 &&
        missingIntendedRows.length === 0 &&
        nonIntendedSolutions.length <= allowedNonIntendedCount &&
        solutions.length >= group.rows.length &&
        solutions.length <= group.rows.length + allowedNonIntendedCount,
    },
  }
}

function solveAll(rows) {
  const rowContexts = rowUnlockContexts(rows)
  const results = []

  for (const group of puzzleGroups(rows)) {
    results.push(solvePuzzleGroup(group, rowContexts))
  }

  return results
}

function tileAllowedForPuzzleMode(tileId, row) {
  const polar = /^\s*r\b/i.test(row.equation)
  const fixedTokens = tokenize(row.equation.replaceAll(BLANK, ''))
  const hasFixedEquals = fixedTokens.some((token) => token.type === 'operator' && token.value === '=')

  if (tileId === '=' && hasFixedEquals) {
    return false
  }

  if (polar) {
    return tileId !== 'x' && tileId !== 'y'
  }

  return tileId !== 'theta'
}

function formatTileList(tileIds) {
  return tileIds.map((tileId) => TILE_DEFINITIONS[tileId].label).join(', ')
}

function intendedTileUsage(rows) {
  const counts = Object.fromEntries(TILE_ORDER.map((tileId) => [tileId, 0]))
  const rowsByTile = Object.fromEntries(TILE_ORDER.map((tileId) => [tileId, []]))
  const misses = []

  for (const row of rows) {
    const tileIds = inferredIntendedTiles(row)

    if (!tileIds) {
      misses.push(row.id)
      continue
    }

    for (const tileId of tileIds) {
      counts[tileId] += 1
      rowsByTile[tileId].push(row.id)
    }
  }

  const shortages = TILE_ORDER
    .filter((tileId) => counts[tileId] < MIN_TILE_USAGE)
    .map((tileId) => ({
      tileId,
      count: counts[tileId],
      rows: rowsByTile[tileId],
    }))

  return {
    minimum: MIN_TILE_USAGE,
    counts,
    rowsByTile,
    misses,
    shortages,
  }
}

function axisSpan(axis) {
  return axis.max - axis.min
}

function axisIncludesZero(axis) {
  return axis.min <= 0 && axis.max >= 0
}

function axisHasAllowedEndpoints(axis) {
  return ![axis.min, axis.max].some((value) => Math.abs(Math.abs(value) - 1) < 1e-9)
}

function isRoundedToHalf(value) {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
}

function targetIsNearGraphEdge(row) {
  const { target, axes } = row
  return (
    Math.abs(target.x - axes.x.min) <= TOLERANCE ||
    Math.abs(target.x - axes.x.max) <= TOLERANCE ||
    Math.abs(target.y - axes.y.min) <= TOLERANCE ||
    Math.abs(target.y - axes.y.max) <= TOLERANCE
  )
}

function targetIsInsideAxes(row) {
  const { target, axes } = row
  return (
    target.x >= axes.x.min - 1e-9 &&
    target.x <= axes.x.max + 1e-9 &&
    target.y >= axes.y.min - 1e-9 &&
    target.y <= axes.y.max + 1e-9
  )
}

function countedTokenSummary(equation) {
  const blanks = blankCount(equation)
  const fixedEquation = equation.replaceAll(BLANK, ' ')
  const fixedTokens = tokenize(fixedEquation)
  let fixedCount = 0

  for (const token of fixedTokens) {
    if (token.type === 'number') {
      fixedCount += 1
      continue
    }

    if (token.type === 'identifier') {
      if (!['y', 'r'].includes(token.value)) {
        fixedCount += 1
      }
      continue
    }

    if (token.type === 'operator' && !['=', '(', ')', '|', '^'].includes(token.value)) {
      fixedCount += 1
    }
  }

  return {
    blanks,
    fixedCount,
    total: blanks + fixedCount,
  }
}

function authoringAudit(rows) {
  const issues = []
  const allBlankRows = rows.filter((row) => allTokensBlank(row.equation))
  const intendedSolutionsByKey = new Map()

  for (const row of rows) {
    const canonicalKey = canonicalKeyForEquation(row.intendedSolution)

    if (!canonicalKey) {
      issues.push(`${row.id}: intended solution "${row.intendedSolution}" could not be parsed`)
      continue
    }

    if (!hasRequiredVariablePairs(row.intendedSolution)) {
      issues.push(`${row.id}: intended solution "${row.intendedSolution}" is missing its paired variable`)
      continue
    }

    const duplicate = intendedSolutionsByKey.get(canonicalKey)
    if (duplicate) {
      issues.push(
        `${row.id}: intended solution "${row.intendedSolution}" duplicates ${duplicate.id}: ${duplicate.solution}`,
      )
      continue
    }

    intendedSolutionsByKey.set(canonicalKey, {
      id: row.id,
      solution: row.intendedSolution,
    })
  }

  for (const row of rows) {
    if (!row.equation.includes(BLANK) && !hasRequiredVariablePairs(row.equation)) {
      issues.push(`${row.id}: equation template "${row.equation}" is missing a required variable pair`)
    }

    for (const [axisName, axis] of Object.entries(row.axes)) {
      const span = axisSpan(axis)

      if (span < MIN_AXIS_SPAN || span > MAX_AXIS_SPAN) {
        issues.push(`${row.id}: ${axisName}-axis span ${span} is outside ${MIN_AXIS_SPAN}-${MAX_AXIS_SPAN}`)
      }

      if (!axisIncludesZero(axis)) {
        issues.push(`${row.id}: ${axisName}-axis ${axis.min} to ${axis.max} does not include 0`)
      }

      if (!axisHasAllowedEndpoints(axis)) {
        issues.push(`${row.id}: ${axisName}-axis ${axis.min} to ${axis.max} ends at 1 or -1`)
      }
    }

    if (!isRoundedToHalf(row.target.x) || !isRoundedToHalf(row.target.y)) {
      issues.push(`${row.id}: target (${row.target.x}, ${row.target.y}) is not rounded to the nearest 0.5`)
    }

    if (!targetIsNearGraphEdge(row)) {
      issues.push(`${row.id}: target (${row.target.x}, ${row.target.y}) is not within ${TOLERANCE} of a graph edge`)
    }

    if (!targetIsInsideAxes(row)) {
      issues.push(`${row.id}: target (${row.target.x}, ${row.target.y}) is outside its graph axes`)
    }

    const tokenSummary = countedTokenSummary(row.equation)
    if (tokenSummary.blanks < tokenSummary.total / 3) {
      issues.push(
        `${row.id}: ${tokenSummary.blanks} empty slots for ${tokenSummary.total} counted tokens ` +
          `(needs at least ${tokenSummary.total / 3})`,
      )
    }

    const unlocksPuzzle = normalizeCell(row.unlocksPuzzle) !== 'none'
    const unlocksTile = unlockedTileId(row.unlocksTile) !== null
    const unlockCount = Number(unlocksPuzzle) + Number(unlocksTile)
    const onboarding = row.id === '1a' || row.id === '2a'

    if (onboarding && unlockCount !== 2) {
      issues.push(`${row.id}: onboarding solution must unlock both one puzzle and one tile`)
    } else if (!onboarding && unlockCount !== 1) {
      issues.push(`${row.id}: solution must unlock exactly one thing; found ${unlockCount}`)
    }
  }

  if (allBlankRows.length !== 1 || allBlankRows[0]?.name !== 'Finale') {
    const labels = allBlankRows.map((row) => `${row.id} ${row.name}`).join(', ') || 'none'
    issues.push(`Finale all-empty-template requirement failed; all-empty rows: ${labels}`)
  } else if (blankCount(allBlankRows[0].equation) !== 7) {
    issues.push(`Finale must have exactly 7 empty slots; found ${blankCount(allBlankRows[0].equation)}`)
  }

  return {
    rowCount: rows.length,
    issues,
  }
}

function printAuthoringAudit(audit) {
  if (audit.issues.length === 0) {
    console.log(
      `Authoring audit: pass (${audit.rowCount} rows; axis span/endpoints/zero, ` +
        'target rounding/edge placement, token density, variable pairs, unlock counts, unique intended solutions, and Finale blank-template checks)',
    )
    return
  }

  console.log('Authoring audit requirement failures:')
  for (const issue of audit.issues) {
    console.log(`  - ${issue}`)
  }
}

function printTileUsage(usage) {
  const counts = TILE_ORDER
    .map((tileId) => `${TILE_DEFINITIONS[tileId].label}: ${usage.counts[tileId]}`)
    .join(', ')

  console.log(`Tile usage in intended slots (minimum ${usage.minimum}): ${counts}`)

  if (usage.shortages.length > 0) {
    console.log('Tile usage requirement failures:')
    for (const shortage of usage.shortages) {
      console.log(
        `  - ${TILE_DEFINITIONS[shortage.tileId].label}: ${shortage.count} ` +
          `(${shortage.rows.join(', ') || 'no intended-slot uses'})`,
      )
    }
  } else {
    console.log('Tile usage requirement: pass')
  }

  if (usage.misses.length > 0) {
    console.log(`Could not infer intended slot tiles for: ${usage.misses.join(', ')}`)
  }
}

function printText(results, rows) {
  let totalSolutions = 0
  let failingGroups = 0

  for (const result of results) {
    totalSolutions += result.solutions.length
    if (!result.requirement.passes) {
      failingGroups += 1
    }

    console.log(`${result.id} ${result.name} (${result.rowIds.join(', ')})`)
    console.log(`  equation: ${result.equationTemplate}    [from ${result.representativeRowId}]`)
    console.log(`  intended solutions (${result.intendedSolutions.length}):`)

    for (const intended of result.intendedSolutions) {
      const keyStatus = intended.canonicalKey ? '' : '    (could not parse)'
      console.log(`    - ${intended.id}: ${intended.solution}${keyStatus}`)
    }

    console.log('  unlocked tiles by row:')
    for (const row of result.availableByRow) {
      console.log(`    - ${row.id}: ${formatTileList(row.availableTiles)}`)
    }

    if (result.issues.differentEquations.length > 0) {
      console.log('  requirement issue: lettered rows use different equation templates')
      for (const issue of result.issues.differentEquations) {
        console.log(`    - ${issue.id}: ${issue.equation}`)
      }
    }

    if (result.issues.duplicateIntendedSolutions.length > 0) {
      console.log('  requirement issue: duplicate intended solutions')
      for (const rowsForKey of result.issues.duplicateIntendedSolutions) {
        console.log(`    - ${rowsForKey.map((row) => `${row.id}: ${row.solution}`).join('; ')}`)
      }
    }

    if (result.missingIntendedRows.length > 0) {
      console.log('  requirement issue: intended solutions not found by the shared equation template')
      for (const row of result.missingIntendedRows) {
        console.log(`    - ${row.id}: ${row.solution}`)
      }
    }

    if (result.solutions.length === 0) {
      console.log('  solutions: none found')
    } else {
      console.log(
        `  solutions (${result.solutions.length}; ${result.nonIntendedSolutions.length} non-intended):`,
      )

      for (const solution of result.solutions) {
        const variants = solution.variantCount > 1 ? `    (${solution.variantCount} variants)` : ''
        const intended = solution.intended
          ? `intended ${solution.intendedRows.map((row) => row.id).join(', ')}`
          : 'non-intended'
        const targets = solution.matchedRows.map((row) => row.id).join(', ')
        console.log(
          `    - ${solution.equation}    [${formatTileList(solution.tiles)}]    ${intended}; hits ${targets}${variants}`,
        )
      }
    }

    console.log(
      `  requirement: ${result.requirement.passes ? 'pass' : 'FAIL'} ` +
        `(expected ${result.requirement.expectedMinimum}-${result.requirement.expectedMaximum} total unique, ` +
        `found ${result.requirement.solutionCount}; ` +
        `${result.requirement.nonIntendedCount} non-intended)`,
    )
    console.log('')
  }

  console.log(
    `Found ${totalSolutions} total unique solutions across ${results.length} puzzle groups; ` +
      `${failingGroups} groups currently fail the per-puzzle requirement.`,
  )
  printTileUsage(intendedTileUsage(rows))
  printAuthoringAudit(authoringAudit(rows))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const source = readFileSync(options.file, 'utf8')
  const rows = loadPuzzleRows(options.file, source)
  const results = filterResults(solveAll(rows), options.rowIds)

  if (options.json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  printText(results, rows)
}

function filterResults(results, rowIds) {
  if (rowIds.length === 0) {
    return results
  }

  const wanted = new Set(rowIds.map(normalizePuzzleSelector))
  const filtered = results.filter((result) => wanted.has(result.id.toLowerCase()))

  for (const puzzleId of wanted) {
    if (!results.some((result) => result.id.toLowerCase() === puzzleId)) {
      throw new Error(`Unknown puzzle id or row id: ${puzzleId}`)
    }
  }

  return filtered
}

main()
