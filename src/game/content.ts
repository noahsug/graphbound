import puzzlesData from '../../puzzles.json'
import type {
  AxisDefinition,
  EquationPart,
  GoalEdge,
  GoalShapeKind,
  GraphAxes,
  Point,
  SectionDefinition,
  SectionVisualDefinition,
  TileDefinition,
  TileId,
} from './types'

export const GAME_TITLE = 'Graphbound'
export const AXIS_MAX = 10
export const PLOT_DURATION_MS = 680

export const DEFAULT_AXES: GraphAxes = {
  x: { min: 0, max: AXIS_MAX, tickStep: 1 },
  y: { min: 0, max: AXIS_MAX, tickStep: 1 },
}

export const DEFAULT_SECTION_VISUAL: Required<SectionVisualDefinition> = {
  terrainWidth: 560,
  terrainHeight: 318,
  boardX: 42,
  boardY: 20,
  boardWidth: 334,
  boardHeight: 278,
  graphX: 44,
  graphY: 18,
  graphWidth: 210,
  graphHeight: 210,
  equationY: 248,
  slotSize: 42,
  tokenGap: 10,
}

const TILE_ROLE_FILLS = {
  variable: '#d9e3ff',
  number: '#ffd3aa',
  operator: '#f2dd9c',
} as const

const PENCIL = '#48382a'
const BLANK = '□'
const GOAL_RANGE = 0.24
const TAU = Math.PI * 2
const SECTION_COLUMNS = 6
const SECTION_X_SPACING = 760
const SECTION_Y_SPACING = 780

const RUNTIME_TILE_IDS = [
  'x',
  'y',
  'θ',
  'π',
  '2',
  '5',
  '0',
  '+',
  '-',
  '/',
  '^',
  '=',
  '(',
  ')',
  'sin',
] as const

export const TILE_DEFINITIONS: Record<TileId, TileDefinition> = {
  x: { id: 'x', label: 'x', fill: TILE_ROLE_FILLS.variable, text: PENCIL, role: 'variable' },
  y: { id: 'y', label: 'y', fill: TILE_ROLE_FILLS.variable, text: PENCIL, role: 'variable' },
  'θ': { id: 'θ', label: 'θ', fill: TILE_ROLE_FILLS.variable, text: PENCIL, role: 'variable' },
  'π': { id: 'π', label: 'π', fill: TILE_ROLE_FILLS.number, text: PENCIL, role: 'number' },
  '2': { id: '2', label: '2', fill: TILE_ROLE_FILLS.number, text: PENCIL, role: 'number' },
  '5': { id: '5', label: '5', fill: TILE_ROLE_FILLS.number, text: PENCIL, role: 'number' },
  '0': { id: '0', label: '0', fill: TILE_ROLE_FILLS.number, text: PENCIL, role: 'number' },
  '+': { id: '+', label: '+', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  '-': { id: '-', label: '-', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  '/': { id: '/', label: '/', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  '^': { id: '^', label: '^', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  '=': { id: '=', label: '=', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  '(': { id: '(', label: '(', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  ')': { id: ')', label: ')', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
  sin: { id: 'sin', label: 'sin', fill: TILE_ROLE_FILLS.operator, text: PENCIL, role: 'operator' },
}

interface PuzzleJson {
  rows: PuzzleRowJson[]
}

interface PuzzleRowJson {
  id: string
  name: string
  equation: string
  intendedSolution: string
  unlocksPuzzle?: string
  unlocksTile?: string
  axes: GraphAxes
  parameterDomain?: AxisDefinition
  target: Point
}

interface PuzzleGroup {
  puzzleId: string
  rows: PuzzleRowJson[]
}

interface TokenizedEquation {
  parts: EquationPart[]
  slots: Array<{ id: string; allowedTiles: TileId[]; label: string }>
}

function puzzleIdFromRowId(rowId: string): string {
  const match = rowId.match(/^(\d+)/)
  return match ? match[1] : rowId.toLowerCase()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function puzzleNameFromUnlock(value: string | undefined): string | null {
  if (!value || ['none', 'victory'].includes(value.trim().toLowerCase())) {
    return null
  }

  return value.replace(/^\d+\s+/, '').trim()
}

function sectionIdForPuzzleName(name: string): string {
  return slugify(name)
}

function normalizeCanonicalExpression(expression: string): string {
  return expression.replace(/\s+/g, ' ').trim().toLowerCase()
}

function assertUniqueGoalSolutions(sections: SectionDefinition[]): void {
  for (const section of sections) {
    const seen = new Map<string, string>()

    for (const goal of section.goals) {
      if (!goal.canonicalExpression) {
        continue
      }

      const normalized = normalizeCanonicalExpression(goal.canonicalExpression)
      const duplicateGoalId = seen.get(normalized)

      if (duplicateGoalId) {
        throw new Error(
          `Duplicate canonical puzzle solution "${goal.canonicalExpression}" on ${section.id}:${goal.id}; already used by ${section.id}:${duplicateGoalId}`,
        )
      }

      seen.set(normalized, goal.id)
    }
  }
}

function groupRows(rows: PuzzleRowJson[]): PuzzleGroup[] {
  const groups = new Map<string, PuzzleGroup>()

  for (const row of rows) {
    const puzzleId = puzzleIdFromRowId(row.id)
    if (!groups.has(puzzleId)) {
      groups.set(puzzleId, { puzzleId, rows: [] })
    }
    groups.get(puzzleId)?.rows.push(row)
  }

  return [...groups.values()]
}

function isPolarEquation(row: PuzzleRowJson): boolean {
  return /^\s*r\b/i.test(row.equation) || /^\s*r\b/i.test(row.intendedSolution)
}

function normalizeFixedToken(value: string): string {
  if (value.toLowerCase() === 'theta') {
    return 'θ'
  }

  if (value.toLowerCase() === 'pi') {
    return 'π'
  }

  return value
}

function tokenizeEquationTemplate(template: string): TokenizedEquation {
  const parts: EquationPart[] = []
  const slots: TokenizedEquation['slots'] = []
  let index = 0
  let slotIndex = 1

  const pushSlot = () => {
    const slotId = `slot-${slotIndex}`
    slotIndex += 1
    parts.push({ type: 'slot', slotId })
    slots.push({
      id: slotId,
      allowedTiles: [...RUNTIME_TILE_IDS],
      label: `token ${slotIndex - 1}`,
    })
  }

  const pushFixed = (value: string) => {
    parts.push({ type: 'fixed', value: normalizeFixedToken(value) })
  }

  while (index < template.length) {
    const character = template[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (character === BLANK) {
      pushSlot()
      index += 1
      continue
    }

    if (/[A-Za-z]/.test(character)) {
      let end = index + 1
      while (end < template.length && /[A-Za-z]/.test(template[end])) {
        end += 1
      }
      pushFixed(template.slice(index, end))
      index = end
      continue
    }

    if (/\d|\./.test(character)) {
      let end = index + 1
      while (end < template.length && /[\d.]/.test(template[end])) {
        end += 1
      }
      pushFixed(template.slice(index, end))
      index = end
      continue
    }

    if ('+-*/^=()|<>;'.includes(character)) {
      pushFixed(character)
      index += 1
      continue
    }

    throw new Error(`Unexpected puzzle template character "${character}" in "${template}"`)
  }

  return { parts, slots }
}

function equationPartsForRow(row: PuzzleRowJson): {
  equation: EquationPart[]
  displayEquation?: EquationPart[]
  slots: TokenizedEquation['slots']
  equationPrefix?: 'y' | 'r'
} {
  if (row.equation.replace(/\s+/g, '').replaceAll(BLANK, '') === '') {
    const tokenized = tokenizeEquationTemplate(row.equation)
    return {
      equation: tokenized.parts,
      displayEquation: tokenized.parts,
      slots: tokenized.slots,
    }
  }

  const prefixMatch = row.equation.match(/^\s*(y|r)\s*=\s*(.*)$/i)
  if (prefixMatch) {
    const tokenized = tokenizeEquationTemplate(prefixMatch[2])
    return {
      equation: tokenized.parts,
      slots: tokenized.slots,
      equationPrefix: prefixMatch[1].toLowerCase() === 'r' ? 'r' : 'y',
    }
  }

  const tokenized = tokenizeEquationTemplate(row.equation)
  return {
    equation: tokenized.parts,
    displayEquation: tokenized.parts,
    slots: tokenized.slots,
  }
}

function runtimeTileId(value: string | undefined): TileId | null {
  const normalized = value?.trim().toLowerCase()

  if (!normalized || ['none', 'victory'].includes(normalized)) {
    return null
  }

  const aliases: Record<string, TileId> = {
    x: 'x',
    y: 'y',
    theta: 'θ',
    θ: 'θ',
    pi: 'π',
    π: 'π',
    '2': '2',
    '5': '5',
    '0': '0',
    '+': '+',
    '-': '-',
    '/': '/',
    '^': '^',
    '=': '=',
    equals: '=',
    'left parenthesis': '(',
    'right parenthesis': ')',
    '(': '(',
    ')': ')',
    sin: 'sin',
  }

  const tileId = aliases[normalized]
  if (!tileId) {
    throw new Error(`Unknown puzzle tile id "${value}"`)
  }

  return tileId
}

function normalizeSolutionText(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/theta/gi, 'θ')
    .replace(/Θ/g, 'θ')
    .replace(/pi/gi, 'π')
}

function solutionEquationBodies(row: PuzzleRowJson): { template: string; solution: string } {
  const prefixMatch = row.equation.match(/^\s*(y|r)\s*=\s*(.*)$/i)

  if (!prefixMatch) {
    return {
      template: row.equation,
      solution: row.intendedSolution,
    }
  }

  const solutionMatch = row.intendedSolution.match(/^\s*(y|r)\s*=\s*(.*)$/i)
  return {
    template: prefixMatch[2],
    solution: solutionMatch ? solutionMatch[2] : row.intendedSolution,
  }
}

function normalizedTileLabel(tileId: TileId): string {
  return normalizeSolutionText(TILE_DEFINITIONS[tileId].label)
}

function splitSolutionSegmentIntoTiles(segment: string, count: number): TileId[] | null {
  const candidates = RUNTIME_TILE_IDS
    .map((tileId) => ({ tileId, label: normalizedTileLabel(tileId) }))
    .sort((left, right) => right.label.length - left.label.length)

  const search = (offset: number, remaining: number): TileId[] | null => {
    if (remaining === 0) {
      return offset === segment.length ? [] : null
    }

    for (const candidate of candidates) {
      if (!segment.startsWith(candidate.label, offset)) {
        continue
      }

      const tail = search(offset + candidate.label.length, remaining - 1)
      if (tail) {
        return [candidate.tileId, ...tail]
      }
    }

    return null
  }

  return search(0, count)
}

function solutionTilesForRow(row: PuzzleRowJson): TileId[] {
  const bodies = solutionEquationBodies(row)
  const template = normalizeSolutionText(bodies.template)
  const solution = normalizeSolutionText(bodies.solution)
  const tiles: TileId[] = []
  let templateIndex = 0
  let solutionIndex = 0

  while (templateIndex < template.length) {
    if (template[templateIndex] !== BLANK) {
      if (solution[solutionIndex] !== template[templateIndex]) {
        throw new Error(
          `Intended solution "${row.intendedSolution}" does not match template "${row.equation}" near "${template[templateIndex]}"`,
        )
      }
      templateIndex += 1
      solutionIndex += 1
      continue
    }

    const slotStart = templateIndex
    while (templateIndex < template.length && template[templateIndex] === BLANK) {
      templateIndex += 1
    }

    const slotCount = templateIndex - slotStart
    const nextSlotIndex = template.indexOf(BLANK, templateIndex)
    const nextFixed =
      nextSlotIndex >= 0
        ? template.slice(templateIndex, nextSlotIndex)
        : template.slice(templateIndex)
    const segmentEnd =
      nextFixed.length === 0 ? solution.length : solution.indexOf(nextFixed, solutionIndex)

    if (segmentEnd < solutionIndex) {
      throw new Error(
        `Could not align intended solution "${row.intendedSolution}" with template "${row.equation}"`,
      )
    }

    const segment = solution.slice(solutionIndex, segmentEnd)
    const segmentTiles = splitSolutionSegmentIntoTiles(segment, slotCount)
    if (!segmentTiles) {
      throw new Error(
        `Could not split intended solution segment "${segment}" into ${slotCount} tiles for ${row.id}`,
      )
    }

    tiles.push(...segmentTiles)
    solutionIndex = segmentEnd
  }

  if (solutionIndex !== solution.length) {
    throw new Error(
      `Intended solution "${row.intendedSolution}" has extra text after template "${row.equation}"`,
    )
  }

  return tiles
}

function goalEdgeForTarget(row: PuzzleRowJson): GoalEdge {
  const distances: Array<{ edge: GoalEdge; distance: number }> = [
    { edge: 'top', distance: Math.abs(row.target.y - row.axes.y.max) },
    { edge: 'right', distance: Math.abs(row.target.x - row.axes.x.max) },
    { edge: 'bottom', distance: Math.abs(row.target.y - row.axes.y.min) },
    { edge: 'left', distance: Math.abs(row.target.x - row.axes.x.min) },
  ]

  distances.sort((left, right) => left.distance - right.distance)
  return distances[0].edge
}

function goalRangeForEdge(row: PuzzleRowJson, edge: GoalEdge): { min: number; max: number } {
  const coordinate = edge === 'top' || edge === 'bottom' ? row.target.x : row.target.y
  const axis = edge === 'top' || edge === 'bottom' ? row.axes.x : row.axes.y

  return {
    min: Math.max(axis.min, coordinate - GOAL_RANGE),
    max: Math.min(axis.max, coordinate + GOAL_RANGE),
  }
}

function sectionWorld(index: number): Point {
  const row = Math.floor(index / SECTION_COLUMNS)
  const column = index % SECTION_COLUMNS
  const xColumn = row % 2 === 0 ? column : SECTION_COLUMNS - 1 - column

  return {
    x: xColumn * SECTION_X_SPACING,
    y: row * SECTION_Y_SPACING,
  }
}

function sectionAccent(index: number): string {
  const accents = ['#6bb9b2', '#eb9b6f', '#9c86d6', '#8db6d9', '#d8a25d', '#cf8b8e']
  return accents[index % accents.length]
}

function goalShape(index: number): GoalShapeKind {
  const shapes: GoalShapeKind[] = [
    'heart',
    'triangle',
    'x',
    'star',
    'circle',
    'diamond',
    'square',
    'hexagon',
    'clover',
  ]
  return shapes[index % shapes.length]
}

function goalColor(index: number): string {
  const colors = ['#ef9551', '#eb7eb5', '#3f72f0', '#a764f4', '#d8a25d', '#cf8b8e']
  return colors[index % colors.length]
}

function visualForGroup(group: PuzzleGroup): SectionVisualDefinition {
  const representative = group.rows[0]
  const blankCount = [...representative.equation].filter((character) => character === BLANK).length

  return {
    terrainWidth: 620,
    terrainHeight: 422,
    boardX: 64,
    boardY: 28,
    boardWidth: 372,
    boardHeight: 334,
    graphX: 46,
    graphY: 18,
    graphWidth: 210,
    graphHeight: 210,
    equationY: 284,
    slotSize: blankCount >= 6 ? 34 : 38,
    tokenGap: blankCount >= 6 ? 7 : 9,
  }
}

function axesForGroup(group: PuzzleGroup): GraphAxes {
  return {
    x: {
      min: Math.min(...group.rows.map((row) => row.axes.x.min)),
      max: Math.max(...group.rows.map((row) => row.axes.x.max)),
      tickStep: 1,
    },
    y: {
      min: Math.min(...group.rows.map((row) => row.axes.y.min)),
      max: Math.max(...group.rows.map((row) => row.axes.y.max)),
      tickStep: 1,
    },
  }
}

function parameterDomainForGroup(group: PuzzleGroup): AxisDefinition {
  const defaultDomain = { min: 0, max: TAU, tickStep: Math.PI / 4 }
  const domains = group.rows.map((row) => row.parameterDomain ?? defaultDomain)

  return {
    min: Math.min(...domains.map((domain) => domain.min)),
    max: Math.max(...domains.map((domain) => domain.max)),
    tickStep: domains.find((domain) => domain.tickStep !== undefined)?.tickStep ?? Math.PI / 4,
  }
}

function buildSection(group: PuzzleGroup, index: number): SectionDefinition {
  const representative = group.rows[0]
  const equation = equationPartsForRow(representative)
  const sectionId = sectionIdForPuzzleName(representative.name)
  const coordinateMode = isPolarEquation(representative) ? 'polar' : 'cartesian'

  return {
    id: sectionId,
    title: representative.name,
    blurb: `Solve ${representative.name}.`,
    accent: sectionAccent(index),
    world: sectionWorld(index),
    axes: axesForGroup(group),
    coordinateMode,
    parameterDomain: coordinateMode === 'polar' ? parameterDomainForGroup(group) : undefined,
    equationPrefix: equation.equationPrefix,
    visual: visualForGroup(group),
    initialUnlocked: index === 0,
    equation: equation.equation,
    displayEquation: equation.displayEquation,
    slots: equation.slots,
    goals: group.rows.map((row, goalIndex) => {
      const edge = goalEdgeForTarget(row)
      const range = goalRangeForEdge(row, edge)
      const unlockName = puzzleNameFromUnlock(row.unlocksPuzzle)
      const rewardTileId = runtimeTileId(row.unlocksTile)

      return {
        id: `goal-${row.id}`,
        label: row.intendedSolution,
        shape: goalShape(index + goalIndex),
        edge,
        min: range.min,
        max: range.max,
        target: { ...row.target },
        unlocks: unlockName ? [sectionIdForPuzzleName(unlockName)] : [],
        rewardTileId: rewardTileId ?? undefined,
        solutionTiles: solutionTilesForRow(row),
        color: goalColor(index + goalIndex),
        canonicalExpression: row.intendedSolution,
      }
    }),
  }
}

function buildSectionsFromPuzzleData(data: PuzzleJson): SectionDefinition[] {
  return groupRows(data.rows).map(buildSection)
}

export const SECTIONS: SectionDefinition[] = buildSectionsFromPuzzleData(puzzlesData as PuzzleJson)

assertUniqueGoalSolutions(SECTIONS)
