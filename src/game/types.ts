export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type TileId = 'x' | '2' | '5' | '+'
export type GoalEdge = 'top' | 'right' | 'bottom' | 'left'

export interface TileDefinition {
  id: TileId
  label: string
  fill: string
  text: string
  role: 'variable' | 'number' | 'operator'
}

export interface SlotDefinition {
  id: string
  allowedTiles: TileId[]
  label: string
}

export type EquationPart =
  | { type: 'fixed'; value: string }
  | { type: 'slot'; slotId: string }

export interface GoalDefinition {
  id: string
  label: string
  edge: GoalEdge
  min: number
  max: number
  unlocks: string[]
}

export interface SectionDefinition {
  id: string
  title: string
  blurb: string
  accent: string
  world: Point
  rewardTileId?: TileId
  initialUnlocked?: boolean
  equation: EquationPart[]
  slots: SlotDefinition[]
  goals: GoalDefinition[]
}

export interface PlotPoint {
  x: number
  y: number
}

export interface BoundaryHit {
  point: PlotPoint
  edges: GoalEdge[]
}

export interface PlotResult {
  expression: string
  screenLabel: string
  points: PlotPoint[]
  hits: BoundaryHit[]
  achievedGoalIds: string[]
  hasVisiblePath: boolean
}

export interface SectionRuntime {
  placements: Record<string, TileId | null>
  plotResult: PlotResult | null
  plotProgress: number
  animating: boolean
  statusMessage: string
  pendingGoalIds: string[]
  solvedGoalIds: string[]
}

export type DragState =
  | {
      kind: 'tile'
      pointerId: number
      tileId: TileId
      current: Point
      offset: Point
      sourceSlotId: string | null
      dragging: boolean
      start: Point
    }
  | {
      kind: 'pan'
      pointerId: number
      current: Point
      start: Point
      cameraStart: Point
      dragging: boolean
    }

export interface Layout {
  width: number
  height: number
  titleY: number
  progression: Rect
  board: Rect
  equation: Rect
  graph: Rect
  note: Rect
  tray: Rect
  footerY: number
}

export interface TokenLayout {
  rect: Rect
  part: EquationPart
}
