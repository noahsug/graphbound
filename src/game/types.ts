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

export type TilePlacement = 'tray' | 'slot'

export interface DragState {
  pointerId: number
  start: Point
  current: Point
  offset: Point
  originPlacement: TilePlacement
  dragging: boolean
}

export interface Layout {
  width: number
  height: number
  board: Rect
  graph: Rect
  equationBar: Rect
  slot: Rect
  tray: Rect
  tileHome: Rect
  note: Rect
  goalGate: Rect
  titleY: number
}

export interface GameState {
  tilePlacement: TilePlacement
  selectedTile: boolean
  drag: DragState | null
  plotProgress: number
  goalReached: boolean
  statusMessage: string
}
