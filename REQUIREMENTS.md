# Graphbound Requirements

This document captures gameplay, UX, layout, and polish requirements pulled from the project direction and repeated user feedback. It is intended to support regression checks.

## Quantifiable Requirements

These requirements should be testable with numbers, fixed pass/fail checks, or deterministic inspection.

### World Layout And Spacing

- [ ] Connecting lines are draw out at `150-500px` in visible length.
- [ ] Connected graph centers are spaced between `450-800px` apart.
- [ ] Target shapes on the same graph are at least `3` graph ticks apart, about `90px` minimum.
- [ ] Target shapes, equations and graphs do not overlap with themselves or each
      other. This holds true even when all levels are unlocked and fully zoomed out.

### Graph Scale And Axes

- [ ] Graph ticks are exactly `30px` apart on both the x-axis and y-axis.
- [ ] Tick marks are rendered at the same visual size on both axes.
- [ ] Graph unit scale is consistent across the world.
- [ ] A graph with x-range `0..20` renders twice as wide as a graph with x-range `0..10`.
- [ ] The central four-target graph uses a full negative-to-positive range with one target in each quadrant.

### Equations

- [ ] Equations render under their graphs.
- [ ] Equations do not overlap graphs.
- [ ] Equations do not overlap target shapes.
- [ ] Equations do not overlap connector paths.
- [ ] Equation font size is consistent across all puzzles.
- [ ] Superscript/subscript notation does not reduce equation text to a smaller overall font size than standard equations.
- [ ] Equation spacing is compact and consistent, including tighter spacing for fixed-token layouts.
- [ ] Equations never end with an operator such as `+` or `-`.
- [ ] `+` cannot be placed immediately after `-`, and `-` cannot be placed immediately after `+`.
- [ ] A blank square represents exactly one placed tile.
- [ ] Absolute-value bars are fixed notation, not tiles.

### Target Shapes

- [ ] Target shape graph-space coordinates are rounded to the nearest `0.5`.
- [ ] Target shapes sit on the edge of the graph bounds.
- [ ] Cartesian target shapes have `x` equal to the x-axis min or max, or `y` equal to the y-axis min or max.
- [ ] Polar target shape coordinates are rounded cartesian points where the polar curve hits the graph edge.
- [ ] A solution counts only if the plotted curve comes within `0.5` graph units of the target center.
- [ ] When a whole-number placement is easy to author, target shapes use whole-number coordinates.
- [ ] The plotted graph line ends in the middle of the target shape.
- [ ] Hovering or clicking a target shape shows x/y guide ticks and numeric labels with at most `1` decimal place.

### Puzzle Authoring Safety

- [ ] Except for onboarding puzzles `1` and `2`, each puzzle solution unlocks exactly one thing: either one puzzle or one new tile, never both.
- [ ] Puzzle `1` unlocks puzzle `2` and a new tile; puzzle `2` unlocks puzzle `3` and a new tile.
- [ ] Intended solutions never use a leading `+` or empty parentheses `()`.
- [ ] For any reachable non-canonical equation and any non-matching target on the same graph, the plotted result stays at least `1` graph unit away from that target at the target's input coordinate.
- [ ] For cartesian targets, this means the non-matching curve's `y` value at the target's `x` coordinate differs from the target's `y` by at least `1`.
- [ ] For polar targets, this means the non-matching curve's `r` value at the target's `theta` coordinate differs from the target's `r` by at least `1`.
- [ ] Example: if `y = 5x - 2` is a reachable non-canonical equation, then a non-matching target at `x = 2.5, y = 10` is invalid because `5 * 2.5 - 2 = 10.5`, and `|10.5 - 10| = 0.5 < 1`.

### Graph Lines And Connectors

- [ ] Graph lines draw toward the target shape rather than away from it.
- [ ] Cartesian graph lines draw from lower `x` to higher `x`.
- [ ] Polar graph lines draw from `theta = 0` upward until the target is reached.
- [ ] The graph line stops at the target shape.
- [ ] The dashed unlock connector starts outside the current graph and ends outside the next graph.
- [ ] The dashed unlock connector does not pass through any graph.
- [ ] The dashed unlock connector does not cross any equation.
- [ ] The dashed unlock connector does not self-overlap.
- [ ] The dashed unlock connector does not overlap target shapes.
- [ ] The dashed unlock connector is progressively drawn and does not appear instantly after a delay.
- [ ] The connector draw speed matches the graph-line draw speed.
- [ ] The camera pans during connector drawing at the same time as the connector reveal.
- [ ] The solve animation order is: graph line draw, target fill, dashed connector draw with camera pan.

### Tiles And Slots

- [ ] All unlocked tiles are always visible in the tray.
- [ ] Tiles wrap onto multiple rows on narrow screens.
- [ ] Bottom tray tiles are smaller on narrow screens and remain usable.
- [ ] Slot placeholders use dashed black borders with no fill.
- [ ] Dashed slot placeholders match the size of placed tiles.
- [ ] Dashed slot placeholders do not overlap the `=` sign.
- [ ] Tile placement uses tile-center position rather than cursor hotspot.
- [ ] Placement snaps to the nearest valid open slot when the tile overlaps a slot.
- [ ] Left parenthesis and right parenthesis are separate tiles.
- [ ] The first parenthesis teaching puzzle uses a placed left parenthesis and a fixed right parenthesis.
- [ ] Parenthesis tile placement must result in valid matched parentheses: every left parenthesis has a matching right parenthesis, and no right parenthesis appears before an unmatched left parenthesis.
- [ ] Empty parentheses `()` are allowed during tile placement.
- [ ] Slot allowlists are position-specific for free-token rows, especially rows with parentheses, division, or function tokens.
- [ ] `x` cannot be placed into polar `r = ...` equations.
- [ ] `theta` cannot be placed into cartesian `y = ...` equations.
- [ ] The same tile cannot be placed more than once within the same graph.

### Camera, Zoom, And Navigation

- [ ] The first graph starts centered on load.
- [ ] Clicking a graph centers that graph.
- [ ] Clicking a graph returns to the startup zoom level.
- [ ] Clicking a graph zooms smoothly rather than instantly jumping.
- [ ] Zoom-in cannot exceed the startup framing.
- [ ] Camera clamping prevents the user from scrolling so far that no graph or graph line remains visible.
- [ ] Camera clamping is tightened enough that moving about `50px` farther would push the visible content off-screen.
- [ ] Clicking a connecting line takes the player to the farther connected graph with the same smooth focus behavior as clicking the graph itself.

### Rendering Stability

- [ ] Rough-style textures, fills, and doodles are deterministic and do not re-randomize on camera movement.
- [ ] Background doodles do not render on top of graphs.
- [ ] Background doodles do not render on top of graph lines.
- [ ] Background doodles do not render on top of target shapes.
- [ ] Random background doodles do not use target-shape symbols.
- [ ] All target shapes are present from the start of the game.

## Objective Requirements

These requirements are still important, but they require human judgment rather than a purely numeric pass/fail check.

### Core Game Feel

- [ ] The game feels math-first: dragging tiles into equations immediately changes the plotted graph.
- [ ] Solving a puzzle feels like reaching a precise authored target, not just touching a loose region.
- [ ] The game feels like an open-world puzzle game with revisits, not a simple linear level list.
- [ ] Branching progression is common and meaningful.
- [ ] Revisiting old graphs after unlocking new tiles remains fun.

### Difficulty And Puzzle Authoring

- [ ] Puzzles get progressively harder overall.
- [ ] Intended canonical solutions are unique across the world.
- [ ] Intended solutions look natural and readable, avoiding awkward authored answers with dangling operators.
- [ ] One-blank puzzles are used mostly for teaching new ideas.
- [ ] Very high-blank-count puzzles are reserved for difficult late-game content.
- [ ] Multi-target graphs are used often enough to stay interesting.
- [ ] The central four-target graph has clearly different-looking solutions for each quadrant target.
- [ ] The world remains fully beatable.
- [ ] When global placement restrictions change, all authored puzzles remain solvable under the current rules.

### Layout And Readability

- [ ] The world feels dense and cohesive rather than stretched into a long sparse chain.
- [ ] Early puzzles, especially the first `2-3`, feel close enough together to make progression feel connected.
- [ ] Later branches can extend farther, but the world still bends back around and reuses space.
- [ ] Graphs, equations, target shapes, and connectors have enough breathing room to read cleanly.
- [ ] The first three puzzles feel especially readable and welcoming.

### Visual Direction

- [ ] The game has a hand-drawn feel.
- [ ] The art avoids real-life image assets.
- [ ] The background stays light enough to keep strong contrast with graphs, equations, and tiles.
- [ ] Background doodles add personality without competing with gameplay.
- [ ] Locked black-and-white target shapes stay visible without drawing too much attention.
- [ ] Unlocked but unsolved target shapes are the most visually prominent targets on the board.
- [ ] Completed target shapes lighten enough that they stop competing for attention.
- [ ] Tile styling feels consistent across tile categories such as numbers, operators, and variables.

### Motion And Interaction Feel

- [ ] Graph lines feel like they draw at a steady, consistent speed.
- [ ] The handoff from graph-line completion to target fill to connector reveal feels satisfying and intentional.
- [ ] The dashed connector and camera feel linked together during unlock travel.
- [ ] Connector routing avoids weird loops, doubled lines, accidental elbows, or other distracting artifacts.
- [ ] Panning feels natural on desktop trackpads, similar to a map.
- [ ] Keyboard movement with `WASD` or arrow keys feels smooth rather than chunky.
- [ ] Tile dragging and dropping feels forgiving.
- [ ] Swapping tiles in filled equation slots feels natural when legal.

### Target And Goal Communication

- [ ] Target shapes sit where the player intuitively expects the graph to go.
- [ ] Goal inspection guides make it clear what coordinates the player is aiming for.
- [ ] Locked goals, unlocked goals, and completed goals are visually distinguishable at a glance.

### Startup And Polish

- [ ] First paint uses the intended font rather than flashing an incorrect fallback font.
- [ ] The loading screen cleanly covers font-loading delay and initial startup work.
- [ ] There is no visible rendering flicker or jitter during normal play.

## Notes

- Quantifiable requirements should be preferred for automation and tooling.
- Objective requirements should be part of human QA, screenshot review, and playtest checklists.
