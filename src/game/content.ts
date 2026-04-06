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

export const V1_SECTIONS: SectionDefinition[] = [
  {
    id: 'sprout',
    title: 'Sprout',
    blurb: 'Place x to sketch the very first line and wake the next graph.',
    accent: '#6bb9b2',
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
        label: 'Open the cove',
        edge: 'top',
        min: 7.6,
        max: 8.4,
        unlocks: ['cove'],
      },
    ],
  },
  {
    id: 'cove',
    title: 'Cove',
    blurb: 'Now build the whole right side yourself. y = x + 2 opens the last v1 tile.',
    accent: '#9c86d6',
    rewardTileId: '5',
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
        id: 'path-harbor',
        label: 'Find the harbor line',
        edge: 'top',
        min: 7.6,
        max: 8.4,
        unlocks: [],
      },
    ],
  },
]
