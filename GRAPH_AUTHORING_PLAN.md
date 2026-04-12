# Graphbound Graph Authoring Plan

## Goal

Make it cheap to:

- add a new graph
- remove an old graph
- move a graph in world space
- rewire how graphs connect
- tweak puzzle content without breaking world layout

Right now those jobs are possible, but they are more coupled than they should be. We want graph authoring to feel like editing a map, not like surgery.

## Current Pain Points

From the current [`src/game/content.ts`](/Users/noahsug/Dropbox/programming/code/graphbound/src/game/content.ts):

1. Puzzle data and world layout are mixed together.
2. Each graph carries a lot of manual geometry at once:
   - world position
   - graph axes
   - board visual metrics
   - goals
   - unlocks
   - route hints
3. Moving one graph often implies checking:
   - dashed route placement
   - graph overlap
   - camera framing
   - entry path feel
   - visual spacing to neighbors
4. Graphs are authored as one long array, which makes local edits easy but structural changes harder.
5. There is no authoring-focused debug mode yet, so layout tuning means editing numbers, rebuilding, and eyeballing.

## What “Easy” Should Mean

The ideal workflow:

1. Add a new graph file or object.
2. Give it an `id`, puzzle definition, and reward.
3. Place it on the map with one `x, y`.
4. Declare which graph/goal unlocks it.
5. Let the game auto-draw the dashed route and default arrival behavior.
6. Optionally override visuals only when needed.

If moving a graph requires changing more than:

- one world position
- maybe one spacing/connection override

then the system is still too manual.

## Recommended Authoring Model

Split authoring into three layers.

### 1. Graph Puzzle Catalog

This layer defines the puzzle itself.

Suggested shape:

```ts
type GraphPuzzle = {
  id: string
  title: string
  blurb: string
  axes?: GraphAxes
  equation: EquationPart[]
  slots: SlotDefinition[]
  goals: GoalDefinition[]
  rewardTileId?: TileId
  initialUnlocked?: boolean
}
```

What belongs here:

- equation template
- slot rules
- axes
- goal conditions
- reward tile
- puzzle text / identity

What should not belong here:

- world position
- paper layout tuning
- dashed route geometry
- entry path geometry

### 2. World Layout Map

This layer defines where graphs live in the world.

Suggested shape:

```ts
type WorldNodeLayout = {
  id: string
  position: Point
  visualPreset?: string
  visualOverrides?: Partial<SectionVisualDefinition>
}
```

What belongs here:

- `x, y`
- optional visual preset like `small`, `wide`, `tall`, `hero`
- optional layout overrides

This makes “move graph 2 lower” a one-line change.

### 3. Connection Graph

This layer defines unlock relationships.

Suggested shape:

```ts
type GraphConnection = {
  from: string
  goalId: string
  to: string
  routeStyle?: 'auto' | 'curve-up' | 'curve-down'
}
```

What belongs here:

- which solved goal unlocks which graph
- optional routing hints

What should be generated automatically:

- dashed path endpoints
- default center-to-center route
- clipping to outside graph bounds

## Immediate Refactor Recommendation

The simplest worthwhile refactor is:

1. Keep the runtime exactly as it is.
2. Split `SECTIONS` into:
   - `GRAPH_PUZZLES`
   - `GRAPH_LAYOUT`
3. Add a small builder that merges them into the current `SectionDefinition[]`.

That gives us a better authoring workflow without forcing a runtime rewrite.

Suggested builder:

```ts
export function buildSections(): SectionDefinition[] {
  return GRAPH_ORDER.map((id) => ({
    ...GRAPH_PUZZLES[id],
    world: GRAPH_LAYOUT[id].position,
    visual: resolveVisualPreset(
      GRAPH_LAYOUT[id].visualPreset,
      GRAPH_LAYOUT[id].visualOverrides,
    ),
  }))
}
```

This is the best first step because it keeps the game stable while making world edits much easier.

## Visual Presets

Most graphs should not need fully custom visual boxes.

Recommended presets:

- `square`
- `wide`
- `tall`
- `tiny`
- `hero`
- `negative-y`
- `centered-axes`

Example:

```ts
const GRAPH_VISUAL_PRESETS = {
  square: { graphWidth: 210, graphHeight: 210, ... },
  wide: { graphWidth: 240, graphHeight: 180, ... },
  tall: { graphWidth: 180, graphHeight: 250, ... },
}
```

Then a graph can usually say:

```ts
layout: {
  position: { x: 1080, y: 320 },
  visualPreset: 'wide',
}
```

That is much better than hand-entering every board rectangle field every time.

## Connection Routing Plan

We should keep connection authoring as automatic as possible.

### Default behavior

- route from graph center A to graph center B
- clip visible line to start outside graph A
- clip visible line to end outside graph B
- auto-avoid graph rectangles

### Optional per-connection hints

Only add overrides when the automatic route looks bad.

Suggested hints:

- `curveBias: 'up' | 'down' | 'left' | 'right'`
- `preferredMidpoint?: Point`
- `dashLift?: number`

This keeps 90 percent of connections data-light.

## Add / Remove / Move Workflow

### Add a graph

1. Add puzzle data under `GRAPH_PUZZLES`.
2. Add a layout entry under `GRAPH_LAYOUT`.
3. Add one or more unlock connections.
4. Playtest.

### Remove a graph

1. Remove it from `GRAPH_LAYOUT`.
2. Remove or redirect inbound connections.
3. Remove puzzle data if no longer used.

### Move a graph

1. Change `GRAPH_LAYOUT[id].position`.
2. Reload.
3. Inspect for overlap or awkward pathing.

That should be the whole job most of the time.

## Best Future Tool: Authoring Mode

The highest-value future tool is an in-game authoring overlay.

### Minimum useful version

- press a debug key to enter layout mode
- each graph shows its id
- drag graphs around
- see dashed links update live
- copy/export the new positions as JSON

That alone would save huge time.

### Great version

- drag graphs
- edit unlock links
- toggle visual presets
- inspect overlap warnings
- deep link to a graph
- export to clipboard

## Recommended Data File Structure

Instead of one large `content.ts`, move toward:

```txt
src/game/content/
  tiles.ts
  graph-puzzles.ts
  graph-layout.ts
  graph-presets.ts
  graph-connections.ts
  build-sections.ts
```

Benefits:

- easier diffs
- easier search
- easier batching of puzzle-only work versus layout-only work
- less risk when changing one area

## Good Defaults To Add

These defaults would remove a lot of repetitive typing:

- default graph visual preset
- default equation row spacing
- auto-generated dashed route
- auto-generated arrival point
- optional auto-title from id
- helper creators for common slot types

Example helpers:

```ts
const variableSlot = (id: string) => ({ id, allowedTiles: ['x'], label: 'variable' })
const numberSlot = (id: string) => ({ id, allowedTiles: ['1', '2', '5'], label: 'number' })
const operatorSlot = (id: string) => ({ id, allowedTiles: ['+', '-'], label: 'operator' })
```

## Recommended Next Implementation Steps

In order:

1. Split `SECTIONS` into puzzle data plus layout data.
2. Add visual presets for common graph sizes.
3. Auto-generate more of the route geometry from graph centers.
4. Move content into `src/game/content/` files.
5. Add a debug authoring mode for dragging graph positions.

## Success Criteria

We’ll know this is working when:

- adding a graph takes minutes, not an hour
- moving a graph is usually a one-line change
- removing a graph doesn’t require searching through unrelated layout math
- most graphs use presets instead of hand-tuned board dimensions
- a future level editor can build on the same data model instead of replacing it
