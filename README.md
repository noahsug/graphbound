# Graphbound

Graphbound is a hand-drawn-feeling web puzzle game about solving equations to grow an explorable connected world.

Planned play URL: [https://noahsug.github.io/graphbound/](https://noahsug.github.io/graphbound/)

## Current Scope

- `v0`: one graph, one draggable tile, one equation slot, one drawn line, one win condition
- `v1`: chained graph unlocks and new tile rewards
- `full game`: a growing connected landmass in a pannable sky world, revisiting zones, multi-goal graphs, and advanced math mechanics

The current presentation is a minimal paper-and-pencil pass: floating graphs on a tiled off-white paper texture, sparse colored connector routes, equations written directly above or below each graph, and light-yellow cutout tiles for the equation pieces.

## Controls

- Drag a tile into a dashed slot, or tap a tile and then tap a matching slot
- Drag empty sky to pan the world
- The graph closest to screen center is the selected graph; its remaining tiles appear in the tray and its open slots stay highlighted
- Tap a graph board to center the camera on it
- `WASD` or the arrow keys also pan the world
- Press `f` to toggle fullscreen

## Local Development

```bash
npm install
npm run dev
```

Deep-link QA is supported with `?level=N`, for example `http://localhost:5173/?level=4`. That boot mode marks earlier levels as solved, unlocks their rewards, and starts the camera on the requested board.

## Build

```bash
npm run build
```

GitHub Pages deployment is handled by GitHub Actions on pushes to `main`.
