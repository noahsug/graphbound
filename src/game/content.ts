import type { SectionDefinition, TileDefinition } from './types'

export const GAME_TITLE = 'Graphbound'
export const AXIS_MAX = 10
export const PLOT_DURATION_MS = 680

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
    world: { x: 0, y: 0 },
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
      },
    ],
  },
  {
    id: 'ridge',
    title: 'Ridge',
    blurb: 'A fixed + waits here. Add the new number tile to tilt the path upward.',
    accent: '#eb9b6f',
    world: { x: 340, y: -30 },
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
        id: 'path-cove',
        label: 'Open the orchard',
        edge: 'top',
        min: 7.6,
        max: 8.4,
        unlocks: ['orchard'],
      },
    ],
  },
  {
    id: 'orchard',
    title: 'Orchard',
    blurb: 'This board branches. x + 2 reveals the cove, and x + 5 reaches the canopy later.',
    accent: '#9c86d6',
    world: { x: 700, y: -30 },
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
        min: 7.6,
        max: 8.4,
        unlocks: ['cove'],
      },
      {
        id: 'path-canopy',
        label: 'Reach the canopy route',
        edge: 'top',
        min: 4.6,
        max: 5.4,
        unlocks: ['canopy'],
      },
    ],
  },
  {
    id: 'cove',
    title: 'Cove',
    blurb: 'Use the number tile alone here. y = 2 brings in the 5 tile for the upper branch.',
    accent: '#8db6d9',
    world: { x: 1040, y: 40 },
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
  },
  {
    id: 'canopy',
    title: 'Canopy',
    blurb: 'The high branch only opens once you come back with the 5 tile.',
    accent: '#7eb17d',
    world: { x: 1040, y: -100 },
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
      },
    ],
  },
  {
    id: 'summit',
    title: 'Summit',
    blurb: 'Build x + 5 one last time to finish the visible world.',
    accent: '#d18d79',
    world: { x: 1400, y: -40 },
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
        min: 4.6,
        max: 5.4,
        unlocks: [],
      },
    ],
  },
]
