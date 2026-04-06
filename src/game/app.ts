import rough from 'roughjs'

import { AXIS_MAX, GAME_TITLE, PLOT_DURATION_MS, TILE_LABEL } from './content'
import type { GameState, Layout, Point, Rect } from './types'

const INK = '#48382a'
const PAPER = '#fffaf0'
const BOARD_FILL = '#fff5dd'
const GRID = '#d9c7a1'
const AXIS = '#8f7352'
const TILE_FILL = '#f9d36d'
const TILE_ACTIVE = '#f3b744'
const SLOT_GLOW = '#6bb9b2'
const PLOT = '#238b84'
const GOAL = '#eb6f5a'
const SUCCESS = '#7bb05f'
const NOTE = '#f8e2a2'
const SHADOW = 'rgba(88, 59, 25, 0.16)'

type RoughCanvas = ReturnType<typeof rough.canvas>

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
): void {
  const corner = Math.min(radius, rect.width / 2, rect.height / 2)

  context.beginPath()
  context.moveTo(rect.x + corner, rect.y)
  context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, corner)
  context.arcTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x,
    rect.y + rect.height,
    corner,
  )
  context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, corner)
  context.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, corner)
  context.closePath()
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  fillStyle: string,
): void {
  context.save()
  roundRectPath(context, rect, radius)
  context.fillStyle = fillStyle
  context.fill()
  context.restore()
}

function createLayout(width: number, height: number): Layout {
  const isCompact = width < 720
  const inset = clamp(width * 0.028, 14, 26)
  const boardWidth = Math.min(width - inset * 2, 740)
  const graphSize = Math.min(
    boardWidth - clamp(boardWidth * 0.16, 56, 110),
    height * (width < 720 ? 0.37 : 0.46),
    width < 720 ? 320 : 420,
  )
  const equationHeight = clamp(graphSize * 0.18, 54, 74)
  const trayHeight = clamp(graphSize * 0.24, 92, 118)
  const contentPad = clamp(boardWidth * 0.07, 18, 28)
  const sectionGap = isCompact ? 16 : 24
  const noteWidth = isCompact
    ? clamp(boardWidth * 0.68, 180, 260)
    : clamp(boardWidth * 0.2, 148, 168)
  const noteHeight = isCompact ? 92 : 126
  const topPad = clamp(graphSize * 0.16, 48, 68)
  const bottomPad = clamp(graphSize * 0.16, 46, 68)
  const boardHeight =
    topPad +
    equationHeight +
    sectionGap +
    graphSize +
    sectionGap +
    trayHeight +
    bottomPad +
    (isCompact ? noteHeight + sectionGap : 0)
  const board = {
    x: (width - boardWidth) / 2,
    y: Math.max(inset + 48, (height - boardHeight) / 2),
    width: boardWidth,
    height: boardHeight,
  }
  const equationBar = {
    x: board.x + contentPad,
    y: board.y + topPad,
    width: isCompact ? boardWidth - contentPad * 2 : graphSize,
    height: equationHeight,
  }
  const graphX = isCompact ? board.x + (boardWidth - graphSize) / 2 : board.x + contentPad
  const graph = {
    x: graphX,
    y: equationBar.y + equationBar.height + sectionGap,
    width: graphSize,
    height: graphSize,
  }
  const tileSize = clamp(graphSize * 0.19, 56, 72)
  const noteY = isCompact ? graph.y + graph.height + sectionGap : graph.y + 12
  const tray = {
    x: board.x + contentPad,
    y: isCompact ? noteY + noteHeight + sectionGap : graph.y + graph.height + sectionGap,
    width: boardWidth - contentPad * 2,
    height: trayHeight,
  }
  const tileHome = {
    x: tray.x + clamp(tray.width * 0.06, 12, 24),
    y: tray.y + (tray.height - tileSize) / 2,
    width: tileSize,
    height: tileSize,
  }
  const slotSize = equationHeight - 18
  const slot = {
    x: equationBar.x + clamp(equationBar.width * 0.36, 84, 126),
    y: equationBar.y + (equationBar.height - slotSize) / 2,
    width: slotSize,
    height: slotSize,
  }
  const note = {
    x: isCompact
      ? board.x + (boardWidth - noteWidth) / 2
      : graph.x + graph.width + sectionGap + 18,
    y: noteY,
    width: noteWidth,
    height: noteHeight,
  }
  const gateSize = clamp(graphSize * 0.15, 36, 52)
  const goalGate = {
    x: graph.x + graph.width - gateSize * 0.4,
    y: graph.y - gateSize * 0.55,
    width: gateSize,
    height: gateSize,
  }

  return {
    width,
    height,
    board,
    graph,
    equationBar,
    slot,
    tray,
    tileHome,
    note,
    goalGate,
    titleY: Math.max(inset + 10, board.y - 34),
  }
}

class GraphboundApp {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly roughCanvas: RoughCanvas
  private readonly resizeObserver: ResizeObserver

  private layout: Layout
  private state: GameState = {
    tilePlacement: 'tray',
    selectedTile: false,
    drag: null,
    plotProgress: 0,
    goalReached: false,
    statusMessage: 'Drag the x tile into the blank box.',
  }

  private animationFrame: number | null = null
  private lastFrameTime: number | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to acquire 2D drawing context.')
    }

    this.context = context
    this.roughCanvas = rough.canvas(canvas)
    this.layout = createLayout(960, 720)
    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })

    this.resizeObserver.observe(this.canvas)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    window.addEventListener('keydown', this.handleKeyDown)

    this.resize()
    this.attachDebugHooks()
  }

  private attachDebugHooks(): void {
    window.render_game_to_text = () => this.renderGameToText()
    window.advanceTime = (ms: number) => {
      this.advanceTime(ms)
    }
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect()
    const width = Math.max(360, Math.round(bounds.width))
    const height = Math.max(520, Math.round(bounds.height))

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    this.layout = createLayout(width, height)
    this.render()
  }

  private getPointerPoint(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect()

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * this.canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * this.canvas.height,
    }
  }

  private getVisibleTileRect(): Rect {
    if (this.state.drag?.dragging) {
      return {
        x: this.state.drag.current.x - this.state.drag.offset.x,
        y: this.state.drag.current.y - this.state.drag.offset.y,
        width: this.layout.tileHome.width,
        height: this.layout.tileHome.height,
      }
    }

    if (this.state.tilePlacement === 'slot') {
      return this.layout.slot
    }

    return this.layout.tileHome
  }

  private beginPlot(): void {
    this.state.plotProgress = 0
    this.state.goalReached = false
    this.state.statusMessage = 'Plotting y = x toward the gate...'
    this.ensureAnimation()
  }

  private clearPlot(message?: string): void {
    this.state.plotProgress = 0
    this.state.goalReached = false

    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
      this.lastFrameTime = null
    }

    if (message) {
      this.state.statusMessage = message
    }
  }

  private placeTileInSlot(): void {
    this.state.tilePlacement = 'slot'
    this.state.selectedTile = false
    this.state.drag = null
    this.beginPlot()
    this.render()
  }

  private liftTileToTray(message: string): void {
    this.state.tilePlacement = 'tray'
    this.state.selectedTile = true
    this.state.drag = null
    this.clearPlot(message)
  }

  private ensureAnimation(): void {
    if (this.animationFrame !== null) {
      return
    }

    this.lastFrameTime = null
    this.animationFrame = window.requestAnimationFrame(this.animate)
  }

  private animate = (timestamp: number): void => {
    if (this.lastFrameTime === null) {
      this.lastFrameTime = timestamp
    }

    const deltaMs = clamp(timestamp - this.lastFrameTime, 0, 32)
    this.lastFrameTime = timestamp
    const keepGoing = this.step(deltaMs)
    this.render()

    if (keepGoing) {
      this.animationFrame = window.requestAnimationFrame(this.animate)
      return
    }

    this.animationFrame = null
    this.lastFrameTime = null
  }

  private step(deltaMs: number): boolean {
    if (this.state.tilePlacement !== 'slot') {
      return false
    }

    if (this.state.plotProgress >= 1) {
      return false
    }

    this.state.plotProgress = clamp(
      this.state.plotProgress + deltaMs / PLOT_DURATION_MS,
      0,
      1,
    )

    if (this.state.plotProgress >= 1 && !this.state.goalReached) {
      this.state.goalReached = true
      this.state.statusMessage = 'Success! y = x reaches the top-right gate.'
      return false
    }

    return this.state.plotProgress < 1
  }

  private advanceTime(ms: number): void {
    const steps = Math.max(1, Math.ceil(ms / (1000 / 60)))
    const sliceMs = ms / steps

    for (let index = 0; index < steps; index += 1) {
      this.step(sliceMs)
    }

    this.render()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const point = this.getPointerPoint(event)
    const tileRect = this.getVisibleTileRect()

    if (pointInRect(point, tileRect)) {
      this.state.drag = {
        pointerId: event.pointerId,
        start: point,
        current: point,
        offset: {
          x: point.x - tileRect.x,
          y: point.y - tileRect.y,
        },
        originPlacement: this.state.tilePlacement,
        dragging: false,
      }
      this.canvas.setPointerCapture(event.pointerId)
      this.render()
      return
    }

    if (this.state.selectedTile && pointInRect(point, this.layout.slot)) {
      this.placeTileInSlot()
      return
    }

    if (this.state.selectedTile) {
      this.state.selectedTile = false
      this.state.statusMessage = 'Tile set back down in the tray.'
      this.render()
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const activeDrag = this.state.drag

    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return
    }

    activeDrag.current = this.getPointerPoint(event)

    if (!activeDrag.dragging && distance(activeDrag.start, activeDrag.current) > 10) {
      activeDrag.dragging = true
      this.state.selectedTile = false

      if (activeDrag.originPlacement === 'slot') {
        this.state.tilePlacement = 'tray'
        this.clearPlot('Tile lifted. Drop it back into the blank box to redraw.')
      } else {
        this.state.statusMessage = 'Release over the blank box to complete the equation.'
      }
    }

    this.render()
  }

  private handlePointerUp = (event: PointerEvent): void => {
    const activeDrag = this.state.drag

    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return
    }

    const point = this.getPointerPoint(event)

    try {
      this.canvas.releasePointerCapture(event.pointerId)
    } catch {
      // No-op: pointer capture can already be released on some browsers.
    }

    if (activeDrag.dragging) {
      if (pointInRect(point, this.layout.slot)) {
        this.placeTileInSlot()
        return
      }

      this.state.drag = null
      this.state.tilePlacement = activeDrag.originPlacement
      this.state.selectedTile = false

      if (activeDrag.originPlacement === 'slot') {
        this.beginPlot()
      } else {
        this.clearPlot('The tile snapped back to the tray.')
      }

      this.render()
      return
    }

    this.state.drag = null

    if (activeDrag.originPlacement === 'slot') {
      this.liftTileToTray('Tile picked up. Tap the blank box or drag it back in.')
      this.render()
      return
    }

    this.state.selectedTile = !this.state.selectedTile
    this.state.statusMessage = this.state.selectedTile
      ? 'Tile selected. Tap the blank box or drag it into place.'
      : 'Tile deselected.'
    this.render()
  }

  private handlePointerCancel = (): void => {
    this.state.drag = null
    this.render()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== 'f') {
      return
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }

    void this.canvas.requestFullscreen()
  }

  private graphPointToScreen(x: number, y: number): Point {
    return {
      x: this.layout.graph.x + (x / AXIS_MAX) * this.layout.graph.width,
      y: this.layout.graph.y + this.layout.graph.height - (y / AXIS_MAX) * this.layout.graph.height,
    }
  }

  private drawBackground(): void {
    const context = this.context
    const { width, height } = this.canvas

    context.clearRect(0, 0, width, height)

    const sky = context.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#fdf7eb')
    sky.addColorStop(1, '#ead2a0')
    context.fillStyle = sky
    context.fillRect(0, 0, width, height)

    context.fillStyle = 'rgba(255, 255, 255, 0.35)'
    context.beginPath()
    context.ellipse(width * 0.25, height * 0.16, width * 0.22, height * 0.12, -0.2, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.ellipse(width * 0.82, height * 0.12, width * 0.18, height * 0.1, 0.18, 0, Math.PI * 2)
    context.fill()

    this.roughCanvas.circle(width * 0.12, height * 0.78, 84, {
      stroke: 'rgba(120, 93, 58, 0.18)',
      strokeWidth: 1.5,
      fillStyle: 'zigzag',
      fill: 'rgba(244, 214, 164, 0.16)',
      roughness: 1.5,
    })
    this.roughCanvas.rectangle(width * 0.84, height * 0.72, 86, 62, {
      stroke: 'rgba(120, 93, 58, 0.18)',
      strokeWidth: 1.2,
      roughness: 1.7,
    })
  }

  private drawBoard(): void {
    const context = this.context
    const { board } = this.layout

    context.save()
    context.shadowColor = SHADOW
    context.shadowBlur = 18
    context.shadowOffsetY = 10
    fillRoundedRect(context, board, 24, PAPER)
    context.restore()

    this.roughCanvas.rectangle(board.x, board.y, board.width, board.height, {
      stroke: INK,
      strokeWidth: 2.4,
      fill: BOARD_FILL,
      fillStyle: 'solid',
      roughness: 1.4,
      bowing: 1.1,
    })
  }

  private drawTitle(): void {
    const context = this.context
    const centerX = this.layout.width / 2

    context.save()
    context.fillStyle = INK
    context.font = "28px 'Short Stack', cursive"
    context.textAlign = 'center'
    context.fillText(GAME_TITLE, centerX, this.layout.titleY)
    context.font = "18px 'Patrick Hand', cursive"
    context.fillStyle = '#7b6246'
    context.fillText('v0 - sketch one', centerX, this.layout.titleY + 24)
    context.restore()
  }

  private drawEquationBar(slotActive: boolean): void {
    const context = this.context
    const { equationBar, slot } = this.layout

    this.roughCanvas.rectangle(equationBar.x, equationBar.y, equationBar.width, equationBar.height, {
      stroke: INK,
      strokeWidth: 2,
      fill: '#fff0c9',
      fillStyle: 'solid',
      roughness: 1.3,
    })

    context.save()
    context.fillStyle = INK
    context.font = "30px 'Short Stack', cursive"
    context.textBaseline = 'middle'
    context.fillText('y =', equationBar.x + 24, equationBar.y + equationBar.height / 2 + 1)
    context.restore()

    context.save()
    roundRectPath(context, slot, 12)
    context.lineWidth = slotActive ? 3 : 2
    context.strokeStyle = slotActive ? SLOT_GLOW : AXIS
    context.setLineDash([7, 7])
    context.stroke()
    context.setLineDash([])

    if (slotActive) {
      context.strokeStyle = 'rgba(107, 185, 178, 0.28)'
      context.lineWidth = 1
      for (let index = 1; index < 4; index += 1) {
        const guideX = slot.x + (slot.width / 4) * index
        const guideY = slot.y + (slot.height / 4) * index
        context.beginPath()
        context.moveTo(guideX, slot.y + 7)
        context.lineTo(guideX, slot.y + slot.height - 7)
        context.stroke()

        context.beginPath()
        context.moveTo(slot.x + 7, guideY)
        context.lineTo(slot.x + slot.width - 7, guideY)
        context.stroke()
      }
    }

    context.restore()
  }

  private drawGraph(): void {
    const context = this.context
    const { graph, goalGate } = this.layout

    fillRoundedRect(context, graph, 18, '#fffef8')
    this.roughCanvas.rectangle(graph.x, graph.y, graph.width, graph.height, {
      stroke: INK,
      strokeWidth: 2,
      fill: 'rgba(255, 255, 255, 0.2)',
      fillStyle: 'solid',
      roughness: 1.1,
    })

    context.save()
    context.strokeStyle = GRID
    context.lineWidth = 1

    for (let index = 0; index <= AXIS_MAX; index += 1) {
      const x = graph.x + (graph.width / AXIS_MAX) * index
      const y = graph.y + (graph.height / AXIS_MAX) * index

      context.beginPath()
      context.moveTo(x, graph.y)
      context.lineTo(x, graph.y + graph.height)
      context.stroke()

      context.beginPath()
      context.moveTo(graph.x, y)
      context.lineTo(graph.x + graph.width, y)
      context.stroke()
    }

    context.strokeStyle = AXIS
    context.lineWidth = 2.2
    context.beginPath()
    context.moveTo(graph.x, graph.y + graph.height)
    context.lineTo(graph.x + graph.width, graph.y + graph.height)
    context.moveTo(graph.x, graph.y + graph.height)
    context.lineTo(graph.x, graph.y)
    context.stroke()

    context.fillStyle = AXIS
    context.font = "15px 'Patrick Hand', cursive"
    context.textAlign = 'center'
    context.textBaseline = 'top'

    for (let index = 0; index <= AXIS_MAX; index += 1) {
      const x = graph.x + (graph.width / AXIS_MAX) * index
      context.fillText(String(index), x, graph.y + graph.height + 8)
    }

    context.textAlign = 'right'
    context.textBaseline = 'middle'

    for (let index = 0; index <= AXIS_MAX; index += 1) {
      const y = graph.y + graph.height - (graph.height / AXIS_MAX) * index
      context.fillText(String(index), graph.x - 10, y)
    }

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.font = "18px 'Short Stack', cursive"
    context.fillText('y', graph.x - 4, graph.y - 12)
    context.fillText('x', graph.x + graph.width + 14, graph.y + graph.height + 22)

    context.strokeStyle = GOAL
    context.lineWidth = 6
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(graph.x + graph.width * 0.8, graph.y)
    context.lineTo(graph.x + graph.width, graph.y)
    context.lineTo(graph.x + graph.width, graph.y + graph.height * 0.22)
    context.stroke()

    fillRoundedRect(context, goalGate, 12, this.state.goalReached ? '#d2f0bc' : '#ffe1d9')
    this.roughCanvas.rectangle(goalGate.x, goalGate.y, goalGate.width, goalGate.height, {
      stroke: this.state.goalReached ? SUCCESS : GOAL,
      strokeWidth: 2.3,
      fill: this.state.goalReached ? '#d2f0bc' : '#ffe9e1',
      fillStyle: 'solid',
      roughness: 1.5,
    })

    context.fillStyle = this.state.goalReached ? SUCCESS : GOAL
    context.font = "16px 'Short Stack', cursive"
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(this.state.goalReached ? 'open' : 'lock', goalGate.x + goalGate.width / 2, goalGate.y + goalGate.height / 2)
    context.restore()
  }

  private drawPlot(): void {
    if (this.state.tilePlacement !== 'slot' || this.state.plotProgress <= 0) {
      return
    }

    const context = this.context
    const endPoint = this.graphPointToScreen(this.state.plotProgress * AXIS_MAX, this.state.plotProgress * AXIS_MAX)
    const startPoint = this.graphPointToScreen(0, 0)

    context.save()
    context.strokeStyle = 'rgba(23, 72, 69, 0.18)'
    context.lineWidth = 8
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(startPoint.x, startPoint.y)
    context.lineTo(endPoint.x, endPoint.y)
    context.stroke()

    context.strokeStyle = PLOT
    context.lineWidth = 5
    context.beginPath()
    context.moveTo(startPoint.x, startPoint.y)
    context.lineTo(endPoint.x, endPoint.y)
    context.stroke()

    context.fillStyle = PLOT
    context.beginPath()
    context.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2)
    context.fill()

    if (this.state.goalReached) {
      context.strokeStyle = SUCCESS
      context.lineWidth = 4
      context.beginPath()
      context.moveTo(endPoint.x, endPoint.y)
      context.lineTo(this.layout.goalGate.x + this.layout.goalGate.width / 2, this.layout.goalGate.y + this.layout.goalGate.height)
      context.stroke()
    }

    context.restore()
  }

  private drawTile(tileRect: Rect, active: boolean): void {
    const context = this.context
    const fill = active ? TILE_ACTIVE : TILE_FILL

    context.save()
    context.shadowColor = SHADOW
    context.shadowBlur = active ? 18 : 8
    context.shadowOffsetY = active ? 8 : 4
    fillRoundedRect(context, tileRect, 14, fill)
    context.restore()

    this.roughCanvas.rectangle(tileRect.x, tileRect.y, tileRect.width, tileRect.height, {
      stroke: INK,
      strokeWidth: 2.4,
      fill,
      fillStyle: 'solid',
      roughness: 1.5,
      bowing: 1.3,
    })

    context.save()
    context.fillStyle = INK
    context.font = "30px 'Short Stack', cursive"
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(TILE_LABEL, tileRect.x + tileRect.width / 2, tileRect.y + tileRect.height / 2 + 2)
    context.restore()
  }

  private drawTray(): void {
    const context = this.context
    const { tray } = this.layout
    const dragging = Boolean(this.state.drag?.dragging)
    const tileRect = this.getVisibleTileRect()
    const tileIsSelected = this.state.selectedTile || dragging

    this.roughCanvas.rectangle(tray.x, tray.y, tray.width, tray.height, {
      stroke: INK,
      strokeWidth: 2,
      fill: '#f7e9bf',
      fillStyle: 'solid',
      roughness: 1.2,
    })

    context.save()
    context.fillStyle = AXIS
    context.font = "19px 'Short Stack', cursive"
    context.fillText('tile tray', tray.x + 18, tray.y + 24)
    context.font = "16px 'Patrick Hand', cursive"
    context.fillText('Use each tile once.', tray.x + 18, tray.y + 46)

    if (this.state.selectedTile && !dragging) {
      context.fillStyle = SLOT_GLOW
      context.font = "16px 'Patrick Hand', cursive"
      context.fillText('Picked up', tray.x + 116, tray.y + 24)
    }

    context.restore()

    this.drawTile(tileRect, tileIsSelected)
  }

  private drawNote(): void {
    const context = this.context
    const { note } = this.layout
    const compact = note.height < 100

    this.roughCanvas.rectangle(note.x, note.y, note.width, note.height, {
      stroke: INK,
      strokeWidth: 2,
      fill: NOTE,
      fillStyle: 'solid',
      roughness: 1.6,
    })

    context.save()
    context.fillStyle = INK
    context.font = compact ? "18px 'Short Stack', cursive" : "20px 'Short Stack', cursive"
    context.fillText('goal', note.x + 18, note.y + 28)
    context.font = compact ? "16px 'Patrick Hand', cursive" : "18px 'Patrick Hand', cursive"
    context.fillText('Make the line touch', note.x + 18, note.y + (compact ? 48 : 54))
    context.fillText('the glowing gate.', note.x + 18, note.y + (compact ? 68 : 78))
    context.fillText('Drag or tap the tile.', note.x + 18, note.y + (compact ? 88 : 104))
    context.restore()
  }

  private drawFooter(): void {
    const context = this.context
    const messageY = this.layout.board.y + this.layout.board.height - 18

    context.save()
    context.fillStyle = this.state.goalReached ? SUCCESS : AXIS
    context.font = "20px 'Patrick Hand', cursive"
    context.textAlign = 'center'
    context.fillText(this.state.statusMessage, this.layout.width / 2, messageY)
    context.restore()
  }

  private render(): void {
    this.drawBackground()
    this.drawBoard()
    this.drawTitle()

    const slotActive = this.state.selectedTile || Boolean(this.state.drag)

    this.drawEquationBar(slotActive)
    this.drawGraph()
    this.drawPlot()
    this.drawTray()
    this.drawNote()
    this.drawFooter()
  }

  private renderGameToText(): string {
    return JSON.stringify({
      mode: this.state.goalReached ? 'solved' : this.state.tilePlacement === 'slot' ? 'plotting' : 'puzzle',
      controls: 'drag the tile or tap the tile then tap the blank slot',
      coordinateSystem: 'graph origin bottom-left, x grows right from 0 to 10, y grows up from 0 to 10',
      equation: this.state.tilePlacement === 'slot' ? 'y = x' : 'y = _',
      tile: {
        label: TILE_LABEL,
        placement: this.state.tilePlacement,
        selected: this.state.selectedTile,
        dragging: Boolean(this.state.drag?.dragging),
      },
      plot: {
        progress: Number(this.state.plotProgress.toFixed(2)),
        goalReached: this.state.goalReached,
        goal: 'top-right border gate',
      },
      statusMessage: this.state.statusMessage,
    })
  }
}

export function createGameApp(canvas: HTMLCanvasElement): GraphboundApp {
  return new GraphboundApp(canvas)
}

declare global {
  interface Window {
    advanceTime: (ms: number) => void
    render_game_to_text: () => string
  }
}
