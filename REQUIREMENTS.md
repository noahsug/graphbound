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
- [ ] Each axis range is between `5` and `20` graph units in total length.
- [ ] Every x-axis and y-axis range includes `0`; for example, `260..280` is invalid.
- [ ] Axis endpoints cannot be `1` or `-1`; for example, `-1..4` is invalid, but `-2..3` is valid.
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
- [ ] Target shape centers are within `0.5` graph units of the graph bounds edge.
- [ ] Cartesian target shapes have `x` within `0.5` of the x-axis min or max, or `y` within `0.5` of the y-axis min or max; for example, a target at `5.5` is valid on an axis ending at `6`.
- [ ] Polar target shape coordinates are rounded cartesian points where the polar curve hits the graph edge.
- [ ] A solution counts only if the plotted curve comes within `0.5` graph units of the target center.
- [ ] When a whole-number placement is easy to author, target shapes use whole-number coordinates.
- [ ] The plotted graph line ends in the middle of the target shape.
- [ ] Hovering or clicking a target shape shows x/y guide ticks and numeric labels with at most `1` decimal place.

### Puzzle Authoring Safety

- [ ] `puzzles.json` is the single source of truth for authored puzzle data. `PUZZLES.md` is generated from it with `npm run generate-puzzles`, and solution-finding tooling reads `puzzles.json` by default.
- [ ] Except for onboarding puzzles `1` and `2`, each puzzle solution unlocks exactly one thing: either one puzzle or one new tile, never both.
- [ ] Puzzle `1` unlocks puzzle `2` and a new tile; puzzle `2` unlocks puzzle `3` and a new tile.
- [ ] Intended solutions never use a leading `+` or empty parentheses `()`.
- [ ] Rows with the same puzzle number, such as `8a`, `8b`, `8c`, and `8d`, are multiple solutions for one puzzle. They must have exactly the same equation template and each row's intended solution must be unique.
- [ ] Unique solution counts are calculated per puzzle number, not per lettered row. Use the first row's equation template for the puzzle, such as `8a`, and treat the other lettered rows as additional intended solutions/targets for that same puzzle.
- [ ] Each puzzle may have at most `1` non-intended unique solution beyond its lettered intended solutions; commutative rearrangements such as `(2 + x)(5 + x)` and `(5 + x)(2 + x)` count as the same unique solution. For example, a puzzle with four intended rows must have either `4` or `5` unique solutions total. The Finale is the only exception: it may have up to `2` non-intended unique solutions, so its single intended solution permits `1` to `3` total unique solutions.
- [ ] Each unlockable tile must be used in at least `3` intended solutions across the game. A tile counts as used only when it fills an empty tile slot in the intended solution; fixed equation text does not count.
- [ ] If `N` is the total number of counted tokens in a puzzle equation, the number of empty tile slots must be at least `N / 3`. Count empty tile slots and fixed values as tokens, but do not count fixed `=`, `y`, `r`, parentheses, absolute-value bars, or `^`. Functions such as `sin` count as one fixed value.
- [ ] `y` and `=` are unlockable tiles. The `y` tile can only be placed in puzzle templates that do not already include a fixed `y`, and the `=` tile can only be placed in puzzle templates that do not already include a fixed `=`.
- [ ] Exactly one famous-constant tile is available: either `pi` or `e`, not both. That tile must be required by at least one puzzle whose intended solution is specific to that constant.
- [ ] The Finale is the only puzzle whose equation template is made entirely of empty tile slots, including the `y` and `=` tokens, and it has exactly `7` empty tile slots.
- [ ] At least one puzzle uses division by zero as a meaningful solve: the intended equation should evaluate to positive infinity at `x = 0`, and that infinity should reach a target shape placed at `(0, <top of graph>)`.
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
- [ ] `=` cannot be placed at the start or end of an equation, after `^`, or next to another operator in a way that creates an invalid equation.
- [ ] `^` cannot be placed at the start or end of an equation, and cannot be followed by an operator such as `+`, `-`, `/`, `^`, or `=`.
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
