import type {
  GraphAxes,
  SectionDefinition,
  SectionVisualDefinition,
  TileDefinition,
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

export const TILE_DEFINITIONS: Record<string, TileDefinition> = {
  x: {
    id: 'x',
    label: 'x',
    fill: '#f9d36d',
    text: '#48382a',
    role: 'variable',
  },
  '2': {
    id: '2',
    label: '2',
    fill: '#ffd3aa',
    text: '#48382a',
    role: 'number',
  },
  '5': {
    id: '5',
    label: '5',
    fill: '#f3b8c6',
    text: '#48382a',
    role: 'number',
  },
  '+': {
    id: '+',
    label: '+',
    fill: '#b9e4db',
    text: '#274d48',
    role: 'operator',
  },
}

export const SECTIONS: SectionDefinition[] = [
  {
    id: 'sprout',
    title: 'Sprout',
    blurb: 'Place x to sketch the very first line and wake the next graph.',
    accent: '#6bb9b2',
    world: { x: 0, y: 24 },
    visual: {
      terrainWidth: 520,
      terrainHeight: 298,
      boardX: 30,
      boardWidth: 320,
      boardHeight: 258,
      graphX: 48,
      graphY: 18,
      graphWidth: 206,
      graphHeight: 206,
      equationY: 230,
    },
    rewardTileId: '2',
    initialUnlocked: true,
    equation: [{ type: 'slot', slotId: 'seed' }],
    slots: [
      {
        id: 'seed',
        allowedTiles: ['x'],
        label: 'variable',
      },
    ],
    goals: [
      {
        id: 'path-ridge',
        label: 'Wake the ridge path',
        edge: 'top',
        min: 9.5,
        max: 10,
        unlocks: ['ridge'],
        route: [
          { x: 294, y: 20 },
          { x: 392, y: 20 },
          { x: 392, y: 132 },
        ],
      },
    ],
  },
  {
    id: 'ridge',
    title: 'Ridge',
    blurb: 'A fixed + waits here. Add the new number tile to tilt the path upward.',
    accent: '#eb9b6f',
    world: { x: 571, y: 13 },
    axes: {
      x: { min: 0, max: 10, tickStep: 1 },
      y: { min: -2, max: 10, tickStep: 1 },
    },
    visual: {
      terrainWidth: 622,
      terrainHeight: 320,
      boardX: 132,
      boardY: 22,
      boardWidth: 334,
      boardHeight: 272,
      graphX: 44,
      graphY: 18,
      graphWidth: 210,
      graphHeight: 194,
      equationY: 244,
    },
    rewardTileId: '+',
    equation: [
      { type: 'fixed', value: 'x' },
      { type: 'fixed', value: '+' },
      { type: 'slot', slotId: 'lift' },
    ],
    slots: [
      {
        id: 'lift',
        allowedTiles: ['2', '5'],
        label: 'number',
      },
    ],
    goals: [
      {
        id: 'path-orchard',
        label: 'Open the orchard',
        edge: 'top',
        min: 7.6,
        max: 8.4,
        unlocks: ['orchard'],
        route: [
          { x: 232, y: 18 },
          { x: 354, y: 18 },
          { x: 354, y: 114 },
        ],
      },
    ],
    entryPath: [
      { x: 180, y: 0 },
      { x: 180, y: 22 },
      { x: 176, y: 40 },
    ],
  },
  {
    id: 'orchard',
    title: 'Orchard',
    blurb: 'This board branches. x + 2 reveals the cove, and x + 5 reaches the canopy later.',
    accent: '#9c86d6',
    world: { x: 1214, y: 0 },
    axes: {
      x: { min: 0, max: 10, tickStep: 1 },
      y: { min: 0, max: 12, tickStep: 1 },
    },
    visual: {
      terrainWidth: 664,
      terrainHeight: 346,
      boardX: 110,
      boardY: 24,
      boardWidth: 352,
      boardHeight: 286,
      graphX: 48,
      graphY: 18,
      graphWidth: 222,
      graphHeight: 208,
      equationY: 252,
    },
    equation: [
      { type: 'slot', slotId: 'var' },
      { type: 'slot', slotId: 'op' },
      { type: 'slot', slotId: 'step' },
    ],
    slots: [
      {
        id: 'var',
        allowedTiles: ['x'],
        label: 'variable',
      },
      {
        id: 'op',
        allowedTiles: ['+'],
        label: 'operator',
      },
      {
        id: 'step',
        allowedTiles: ['2', '5'],
        label: 'number',
      },
    ],
    goals: [
      {
        id: 'path-cove',
        label: 'Open the cove',
        edge: 'top',
        min: 9.6,
        max: 10,
        unlocks: ['cove'],
        route: [
          { x: 232, y: 18 },
          { x: 312, y: 18 },
          { x: 352, y: 118 },
        ],
      },
      {
        id: 'path-canopy',
        label: 'Reach the canopy route',
        edge: 'top',
        min: 6.6,
        max: 7.4,
        unlocks: ['canopy'],
        route: [
          { x: 162, y: 20 },
          { x: 226, y: -18 },
          { x: 334, y: -18 },
        ],
      },
    ],
    entryPath: [
      { x: 178, y: 0 },
      { x: 178, y: 24 },
      { x: 174, y: 42 },
    ],
  },
  {
    id: 'cove',
    title: 'Cove',
    blurb: 'Use the number tile alone here. y = 2 brings in the 5 tile for the upper branch.',
    accent: '#8db6d9',
    world: { x: 1289, y: 355 },
    axes: {
      x: { min: -5, max: 5, tickStep: 1 },
      y: { min: -3, max: 4, tickStep: 1 },
    },
    visual: {
      terrainWidth: 514,
      terrainHeight: 364,
      boardX: 42,
      boardY: 46,
      boardWidth: 314,
      boardHeight: 248,
      graphX: 34,
      graphY: 12,
      graphWidth: 214,
      graphHeight: 170,
      equationY: 216,
    },
    rewardTileId: '5',
    equation: [{ type: 'slot', slotId: 'still' }],
    slots: [
      {
        id: 'still',
        allowedTiles: ['2', '5'],
        label: 'number',
      },
    ],
    goals: [
      {
        id: 'path-water',
        label: 'Trace the calm water',
        edge: 'right',
        min: 1.6,
        max: 2.4,
        unlocks: [],
      },
    ],
    entryPath: [
      { x: 0, y: 140 },
      { x: 22, y: 140 },
      { x: 46, y: 126 },
    ],
  },
  {
    id: 'canopy',
    title: 'Canopy',
    blurb: 'The high branch only opens once you come back with the 5 tile.',
    accent: '#7eb17d',
    world: { x: 1282, y: -388 },
    axes: {
      x: { min: -4, max: 4, tickStep: 1 },
      y: { min: 0, max: 10, tickStep: 1 },
    },
    visual: {
      terrainWidth: 528,
      terrainHeight: 430,
      boardX: 94,
      boardY: 24,
      boardWidth: 262,
      boardHeight: 344,
      graphX: 36,
      graphY: 16,
      graphWidth: 186,
      graphHeight: 250,
      equationY: 304,
      slotSize: 38,
    },
    equation: [{ type: 'slot', slotId: 'height' }],
    slots: [
      {
        id: 'height',
        allowedTiles: ['2', '5'],
        label: 'number',
      },
    ],
    goals: [
      {
        id: 'path-summit',
        label: 'Wake the summit',
        edge: 'right',
        min: 4.6,
        max: 5.4,
        unlocks: ['summit'],
        route: [
          { x: 344, y: 152 },
          { x: 410, y: 152 },
          { x: 410, y: 92 },
        ],
      },
    ],
    entryPath: [
      { x: 176, y: 0 },
      { x: 176, y: 22 },
      { x: 168, y: 40 },
    ],
  },
  {
    id: 'summit',
    title: 'Summit',
    blurb: 'Build x + 5 one last time to finish the visible world.',
    accent: '#d18d79',
    world: { x: 1844, y: -339 },
    axes: {
      x: { min: 0, max: 10, tickStep: 1 },
      y: { min: 0, max: 12, tickStep: 1 },
    },
    visual: {
      terrainWidth: 596,
      terrainHeight: 332,
      boardX: 120,
      boardY: 24,
      boardWidth: 346,
      boardHeight: 278,
      graphX: 54,
      graphY: 18,
      graphWidth: 228,
      graphHeight: 204,
      equationY: 248,
    },
    equation: [
      { type: 'slot', slotId: 'var' },
      { type: 'slot', slotId: 'op' },
      { type: 'slot', slotId: 'step' },
    ],
    slots: [
      {
        id: 'var',
        allowedTiles: ['x'],
        label: 'variable',
      },
      {
        id: 'op',
        allowedTiles: ['+'],
        label: 'operator',
      },
      {
        id: 'step',
        allowedTiles: ['2', '5'],
        label: 'number',
      },
    ],
    goals: [
      {
        id: 'path-finish',
        label: 'Finish the summit line',
        edge: 'top',
        min: 6.6,
        max: 7.4,
        unlocks: [],
      },
    ],
    entryPath: [
      { x: 0, y: 152 },
      { x: 22, y: 152 },
      { x: 46, y: 138 },
    ],
  },
]
