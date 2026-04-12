# Graphbound Implementation Plan

## Project Vision

Build a responsive web game where players solve graph-based equation puzzles to unlock new zones in an expanding world. The experience should feel playful, tactile, and hand-drawn, with math discovery and backtracking as the core progression loop.

## Product Pillars

1. Immediate math play: dragging a tile into an equation should produce a visible graph result right away.
2. Open-world curiosity: players should feel rewarded for revisiting earlier spaces with newly unlocked tiles.
3. Readable puzzle design: goals, blocked paths, failures, and available equation slots must be obvious at a glance.
4. Delightful presentation: the game should feel sketchbook-like, warm, and inviting without sacrificing clarity.
5. Expandable authoring: level data and future editor tooling should make it easy to add new graph puzzles.

## Current UX Direction

- Full-screen world with no persistent text HUD
- Entire world should look hand-drawn, with no real-image assets or pixel-art textures
- The base material is a chalkboard world, with puzzle paper and chalk-like land drawn on top of it
- Puzzle spaces should grow into one connected landmass rather than separate floating islands
- Directly connected sections should dock edge-to-edge so the unlocked world reads as one seamless land shape, not stacked cards with visible seams
- Latest visual direction simplifies that further into a paper sheet world with no land at all: only floating graph axes, sparse equations that sit above or below each graph, and colored route fragments between puzzles
- Only persistent UI is the bottom tile row
- Land parcels can have different footprints, letting the world widen, branch, and stack in a way that still reads as one cohesive place when fully unlocked
- Each graph can define its own axis ranges and frame proportions, including negative ranges, centered axes, and tall boards
- Open equation slots accept any unlocked tile; adjacency rules resolve into concatenation, implicit multiplication, and trimmed edge `+` tokens
- Even though edge `+` placements stay mechanically valid, authored puzzle solutions should use `+` in the middle to clearly mean “add these two things”
- Goal exits behave like fuse lines that travel outward to unlock the next board
- In the current paper pass there is no separate unlock icon; the colored goal route simply continues into the next graph’s axis once the solve animation completes
- Newly unlocked terrain should feel physical: the land extends, new sections arrive with motion, and the camera pulls toward the new puzzle
- The world should accumulate playful hand-drawn doodles and scenery such as trees, rivers, bridges, dogs, flowers, hearts, and stars as it expands
- Land and tiles should favor rough.js hatch / stroke fills over flat solid fills, so the world feels chalked and sketched rather than digitally painted
- The equation row should stay clearly readable directly on the paper background, never overlapping the graph itself, with light-yellow dashed slot placeholders
- The current graph treatment is even more minimal than that: no graph border and no grid, only pencil axes plus unnumbered unit ticks with larger marks every five units
- Active graph boards should be generously sized on screen, with tick marks large enough to read quickly even though the minimalist pass no longer uses numeric labels
- Colored goal routes should visibly leave each graph before it is solved, then complete their connection into the next graph’s axis once the matching equation is drawn, fading toward dark graphite as they approach that unlocked graph
- Newly unlocked graphs should sketch themselves into existence in place rather than falling in from off-screen
- The graph closest to the center of the screen should be treated as selected, so camera movement alone can change which puzzle is active
- The bottom tray should always show the remaining unused tiles for the selected graph, and the selected graph’s open slots should stay visibly highlighted
- Randomized drawing textures must stay deterministic so panning or camera moves never cause the world to flicker or re-randomize, including any tiled paper background treatment
- Desktop navigation should feel map-like: two-finger trackpad scrolling pans the world directly, and held `WASD` / arrow-key movement glides smoothly instead of stepping in chunky jumps
- Direct `?level=N` URLs should seed prior progression instantly and teleport the camera to that level for focused playtesting

## Shipping Targets

### Platform

- Desktop web and mobile web
- Localhost development for iteration
- GitHub Pages deployment for public playtesting

### Quality Bar

- No noticeable flicker during redraws or interaction
- Good performance on typical laptop and phone browsers
- Puzzle state always readable
- Core interactions verified in a browser, not just by code inspection

## Technical Direction

### Chosen Stack

- Vite + TypeScript for fast local iteration and easy GitHub Pages deployment
- HTML canvas for the playfield
- `roughjs` for hand-drawn board, graph, and frame rendering
- DOM overlays only where they are better than canvas, such as future menus and accessibility affordances

### Why This Stack

- The gameplay is graph-heavy and geometry-driven rather than sprite- or physics-driven
- A custom renderer keeps the visuals consistent with a sketchbook look
- The code can stay light and flexible while we learn what the puzzle systems need

## Architecture Plan

### Runtime Boundaries

- Simulation state owns world progression, graph sections, equation state, tile usage, win conditions, and unlocks
- Renderer owns layout, sketch styling, animation timing, and responsive scaling
- Input owns pointer drag, drop targets, camera gestures, and keyboard shortcuts
- Content data owns graph layouts, available tiles, fixed equation fragments, goal lines, obstacles, and unlock rewards

### Core Modules

- `src/main.ts`: bootstrap, resize handling, and integration with browser hooks
- `src/game/app.ts`: top-level app controller and frame loop
- `src/game/state.ts`: serializable game state and state transitions
- `src/game/content/levels.ts`: level definitions and unlock graph
- `src/game/math/equation.ts`: expression assembly, validation, and evaluation helpers
- `src/game/math/plot.ts`: graph sampling, clipping, and collision detection
- `src/game/render/`: board, graph, tiles, goals, and feedback rendering
- `src/game/input/`: pointer interactions, drag/drop, and camera controls
- `src/game/debug/`: `render_game_to_text`, diagnostics, and future editor helpers

### Data Model Plan

#### Tile

- `id`
- `label`
- `kind` such as variable, constant, operator, function, wildcard
- `usesRemaining`
- `unlockSource`

#### Equation Template

- `id`
- `leftSideTokens`
- `rightSideTokens`
- `slots`
- `allowedTileKinds`
- `fixedTokens`

#### Graph Section

- `id`
- `worldPosition`
- `terrainSize`
- `boardLayout`
- `graphAxes`
- `graphFrame`
- `equationTemplate`
- `goalLines`
- `obstacles`
- `unlockTargets`
- `rewardTileIds`
- `status`

#### Goal Line

- `id`
- `edge`
- `range`
- `requiredApproach`
- `unlockTargetSectionId`

## Gameplay Milestones

### Phase 0: Project Bootstrap

Status: `completed`

- Create repo, README, deployment workflow, plan, and progress tracking
- Set up TypeScript + Vite build pipeline
- Set up GitHub Pages base path and deployment automation

### Phase 1: v0 Single-Board Prototype

Status: `completed`

Goal: prove the central interaction loop on one board.

Scope:

- Single graph board visible on load
- One available draggable tile: `x`
- One equation slot so `y = x` can be completed
- Visual drop affordance for valid slot targets
- Graph line rendering when equation is complete
- One goal line on the board border
- Success state when plotted line reaches the goal line
- Failure state messaging reserved for out-of-bounds and obstacle handling, even if obstacles are not yet active
- Responsive layout for phone and desktop
- Deterministic debug hooks: `window.render_game_to_text` and `window.advanceTime`

Acceptance criteria:

- Player can drag the tile from the tray into the equation
- The line appears immediately and is legible on the graph
- The board visibly indicates success when the line reaches the goal line
- The interaction works with mouse and touch

Implemented in this pass:

- Single-canvas puzzle board with a hand-drawn paper-and-ink visual direction
- One draggable `x` tile in a tray and one equation slot that assembles `y = x`
- Tap-to-place fallback for reliable touch play and browser automation
- Animated line draw into a top-right goal gate with success feedback
- Deterministic debug hooks for browser testing

### Phase 2: v1 Linear Unlock Flow

Status: `completed`

- Support multiple graph sections
- Unlock the next graph after solving the current graph
- Reward the player with a new tile after full completion of a section
- Add revisitable earlier graphs
- Add content-driven puzzle sequencing rather than hardcoded flow

Implemented in this pass:

- Three-section progression strip for `Sprout -> Ridge -> Cove`
- New tile rewards unlocked in sequence: `2`, then `+`, then `5`
- Reusable section runtime data for slots, equation assembly, graph plotting, and unlock state
- Deterministic rough.js seeds on hand-drawn elements so redraws stay stable during drag interactions

Current limitation before the full-game pass:

- Navigation is still a linear unlocked-section strip rather than a freely pannable world map

### Phase 3: Open World

Status: `completed`

- Camera panning across a world map of graph sections
- Sections appear or animate into existence when unlocked
- Multiple exits from a single graph
- Locked and hidden content states
- Click-to-center and drag-to-pan controls
- Optional WASD and zoom support

Implemented in this pass:

- World-map layer above the active board, with floating graph islands positioned in a shared space
- Drag-to-pan map interaction plus tap-to-focus nodes
- Keyboard camera movement on `WASD` and the arrow keys
- Desktop two-finger trackpad / wheel panning that follows the same camera model as drag panning
- Orchard branch with two goals so the player revisits an older section after earning the `5` tile
- Additional `Cove`, `Canopy`, and `Summit` sections to turn the prototype into a small open-world loop
- Unlock pulses and map connectors to make progression readable

Current presentation pass:

- Removed the old map-band plus detail-board split in favor of a single full-screen sky world
- Simplified each puzzle down to a floating paper board with the graph and a minimal `y =` row
- Reduced persistent UI to floating tile chips at the bottom of the screen
- Reworked goal exits into actual connector lines with a fuse-style solve animation to a lock icon
- Added board drop-in reveals and automatic camera pans toward newly unlocked areas

Connected-world pass:

- Replaced isolated floating puzzle islands with grassy terrain parcels that visually fuse into one larger landmass as sections unlock
- Added terrain growth between adjacent sections so early progression reads like one expanding world instead of disconnected cards
- Began layering world flavor into the terrain with trees, water, bridges, and a pettable dog interaction
- Added per-section land sizing so each unlocked parcel can contribute a different silhouette to the final world shape
- Added per-section graph axis and frame sizing so later puzzles can use negative values, centered axes, or tall/narrow layouts without special-case renderer logic
- Simplified the background back to a clean gradient sky so the growing landmass and graph boards carry the whole composition

### Phase 4: Advanced Equation Systems

Status: `pending`

- Obstacles that clip or block graph traversal
- Left-side equation editing
- Polar sections with `theta`
- Blank copy tile
- Piecewise or split functions

### Phase 5: Level Editor

Status: `pending`

- Content schema for authoring levels without code changes
- Load any graph with any set of tiles
- Edit obstacles, fixed slots, rewards, and unlock paths
- Solve helper for all possible solutions
- Locked-until-completion creator mode for post-game sharing

### Phase 6: Polish

Status: `pending`

- Animated graph drawing
- Goal-line travel and area-unlock animation
- Satisfying win feedback
- Sound effects and music
- Ambient world interactions

Partially implemented already:

- Animated line drawing on the graph
- Fuse travel from solved goal lines toward lock icons
- Drop-in board reveals with camera follow

## Visual Direction

- Simple sky gradient background with no extra backdrop motifs
- Handwritten-style display font
- Light graph grid with numbered axes driven by each section's configured range
- Intentional use of color to distinguish graph, goals, valid drop targets, and success feedback
- Rough edges and slightly imperfect lines without sacrificing hit-testing precision
- Terrain parcels can vary in width, height, and graph framing while still fitting together as one authored world map

## Input Plan

- Pointer drag for tile movement
- Touch drag parity on mobile
- Drag-to-pan world camera once the open world exists
- Click or tap to re-center on current board
- Future keyboard support for navigation and zoom

## Math and Puzzle Rules

- Tiles are infinitely reusable
- Valid drop targets appear when dragging begins
- Fixed equation fragments constrain the player to intended puzzle space
- A plotted line can complete goals, stop at obstacles, or fail when it leaves allowed bounds
- Puzzle authoring should support both immediately solvable and later-return graphs
- Reward tiles unlock only after every target shape on that graph has been solved
- Ship a 20-graph authored world with non-linear branches, revisits, and a central four-target crossroads graph

## Testing Plan

- Run local browser smoke tests for every meaningful gameplay change
- Use the game-playwright loop after each major interaction change
- Verify screenshots, text-state output, and console errors together
- Test mouse and touch-sized layouts
- Add lightweight unit coverage later for equation assembly and graph sampling

## Risks And Mitigations

- Graph rendering complexity: start with a very small supported expression set and expand carefully
- Mobile drag UX: keep hit targets generous and visuals uncluttered
- Hand-drawn rendering performance: cache static board layers and redraw dynamic layers separately
- Open-world scope creep: keep all unlock logic content-driven and phase-gated

## Content Production Plan

- Represent graph sections as data objects, not code branches
- Keep puzzle tuning values close to the level definitions
- Support future editor import/export with JSON-compatible structures

## Definition Of Done For v0

- Playable locally with `npm run dev`
- Builds cleanly with `npm run build`
- Deploy pipeline present for GitHub Pages
- Single graph puzzle can be solved by dragging the lone tile
- `PLAN.md` and `PROGRESS.md` reflect what was actually implemented

## Implementation Notes

- Initial assumption: repo name will be `graphbound`, which sets the GitHub Pages base path to `/graphbound/`
- Initial assumption: the attached sketch and inspiration images are not present in the workspace, so the first visual pass will follow the written design brief
- Repository created and initial planning checkpoint pushed to `https://github.com/noahsug/graphbound`
- v0 implementation shipped with a touch-friendly tap fallback in addition to direct dragging so automated browser tests can exercise the puzzle reliably
- v1 checkpoint committed as `feat: implement v1 progression and stable sketch rendering`
- Full-game pass includes a small debug surface on `window.__graphbound_debug` used for deterministic browser verification of the branch progression
- Current content pass expands the world to 20 authored graphs, keeps the first three puzzles intact, and moves new difficulty into later branches with `5`, `-`, `1`, and `0` unlocks
