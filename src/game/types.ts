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

export type TileId = 'x' | 'θ' | '2' | '5' | '+' | '-' | '1' | '0'
export type GoalEdge = 'top' | 'right' | 'bottom' | 'left'
export type GoalShapeKind = 'heart' | 'circle' | 'x' | 'star'
export type EquationTokenStyle = 'normal' | 'superscript' | 'subscript'
export type CoordinateMode = 'cartesian' | 'polar'

export interface AxisDefinition {
  min: number
  max: number
  tickStep?: number
}

export interface GraphAxes {
  x: AxisDefinition
  y: AxisDefinition
}

export interface SectionVisualDefinition {
  terrainWidth?: number
  terrainHeight?: number
  boardX?: number
  boardY?: number
  boardWidth?: number
  boardHeight?: number
  graphX?: number
  graphY?: number
  graphWidth?: number
  graphHeight?: number
  equationY?: number
  slotSize?: number
  tokenGap?: number
}

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
  | { type: 'fixed'; value: string; displayStyle?: EquationTokenStyle }
  | { type: 'slot'; slotId: string; displayStyle?: EquationTokenStyle }

export interface GoalDefinition {
  id: string
  label: string
  shape: GoalShapeKind
  edge: GoalEdge
  min: number
  max: number
  unlocks: string[]
  color?: string
  canonicalExpression?: string
  route?: Point[]
}

export interface SectionDefinition {
  id: string
  title: string
  blurb: string
  accent: string
  world: Point
  axes?: GraphAxes
  coordinateMode?: CoordinateMode
  parameterDomain?: AxisDefinition
  equationPrefix?: 'y' | 'r'
  visual?: SectionVisualDefinition
  rewardTileId?: TileId
  initialUnlocked?: boolean
  equation: EquationPart[]
  displayEquation?: EquationPart[]
  slots: SlotDefinition[]
  goals: GoalDefinition[]
  entryPath?: Point[]
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
  targetFillProgress: number
  fuseProgress: number
  fuseCameraProgress: number
  fuseCameraFrom: Point | null
  fuseCameraTo: Point | null
  animating: boolean
  animatingGoalId: string | null
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
      startedSectionId: string | null
    }

export interface Layout {
  width: number
  height: number
  worldCenter: Point
  baseWorldScale: number
  worldScale: number
  tileSize: number
  trayY: number
  trayGap: number
}

export interface TokenLayout {
  rect: Rect
  part: EquationPart
}
