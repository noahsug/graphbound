# Graphbound

Graphbound is a hand-drawn-feeling web puzzle game about solving equations to grow an explorable world.

Planned play URL: [https://noahsug.github.io/graphbound/](https://noahsug.github.io/graphbound/)

## Current Scope

- `v0`: one graph, one draggable tile, one equation slot, one drawn line, one win condition
- `v1`: chained graph unlocks and new tile rewards
- `full game`: open-world traversal, revisiting zones, multi-goal graphs, and advanced math mechanics

## Controls

- Drag the `x` tile into the blank slot to complete `y = x`
- Mouse and touch both support a tap-to-place fallback: tap the tile, then tap the blank slot
- Drag the world map or tap a graph island to focus a different unlocked section
- `WASD` or the arrow keys pan the world map
- Press `f` to toggle fullscreen

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

GitHub Pages deployment is handled by GitHub Actions on pushes to `main`.
