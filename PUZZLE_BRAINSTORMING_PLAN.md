# Graphbound Puzzle Brainstorming Plan

## Goals

- Build a progression that starts with instant visual intuition and slowly grows into richer, more surprising math.
- Make each unlock feel like it opens both new puzzles and new ways to reinterpret old ones.
- Keep the early game readable, the midgame combinatorial, and the late game expressive.
- Introduce harder math only after the player has already learned the shape language that supports it.

## Progression Principles

1. Start with lines and obvious slopes.
2. Add one new idea at a time: shift, mirror, scale, curve, constrain, split, revisit.
3. Prefer “same graph, new meaning” over always inventing a new mechanic.
4. Use revisits to teach mastery: an old graph that was impossible before should become easy with one new tile.
5. Save notation-heavy ideas like logs, trig, absolute value, and left-side equations until the player already trusts the drag-and-graph loop.

## Current Advanced Mechanics Coverage

Implemented in the current world:
- Parentheses: `y = (x + 2) / 2`, `y = (5x) / (x + 5)`, `y = (x^2 + 5) / 5`, `y = log_5(x^2 + 5)`
- Division: early fraction boards, the absolute-value-over-2 revisit, and the later power-over-5 boards
- Absolute value: `|x - 5|`, `|x - 5| + 2`, `|x - 5| / 2`
- Sine: `sin(x) + 5`, `sin(x + 2) + 2`
- Exponents: `x^2`, `x^2 + 5`, plus later mixed forms like `(x^2 + 5) / 5`
- Logarithms: `log_2(x + 1)`, `log_5(x + 5)`, `log_5(x^2 + 5)`
- Polar with theta: `r = Θ`, `r = 2Θ`
- Left-side / zero-form notation: `y - sin(x + 2) - 2 = 0`, `5y - x^2 - 5 = 0`

Still worth adding later:
- Parentheses used for true factorization: `y = (x - 2)(x + 5)`
- Division with moving numerator and denominator on both sides: `y = (_ _) / (_ _)`
- Absolute values nested inside other wrappers: `y = |(x - 5) / 2|`
- Polar trig curves: `r = 2sin(Θ)`, `r = 1 + cos(Θ)`
- Exponent slots with non-2 exponents: `y = x^5`, `y = (x + 1)^2`
- Logs whose base is genuinely strategic instead of forced: `y = log_2(x + 5)` versus `y = log_5(x + 5)`

## Recommended World Progression

### Stage 1: First Marks

Focus:
- direct lines
- obvious slope changes
- reaching top/right exits

Good tiles:
- `x`
- `1`
- `2`
- `5`
- `+`

Good equation patterns:
- `y = x`
- `y = x + 2`
- `y = x + 5`
- `y = 2x`
- `y = 5x`
- `y = 2`
- `y = 25`

What this teaches:
- graphs appear immediately
- bigger numbers move or steepen the line
- concatenation and implicit multiplication feel powerful

Level ideas:
- tutorial level solved by `y = x`
- one board where `y = 2` hits a horizontal exit
- one board where `y = 2x` reaches a steeper target
- revisit where `25` suddenly reaches a far-off gate

### Stage 2: Mirrors And Descent

Focus:
- negative direction
- downward slopes
- introducing below-zero space

Good tiles:
- `-`
- `0`

Good equation patterns:
- `y = -x`
- `y = x - 2`
- `y = 2 - x`
- `y = -2x`
- `x + y = 0`
- `x + y = 2`

What this teaches:
- lines can go down
- the same shape can be written in more than one form
- moving variables to the left side is a meaningful escalation

Level ideas:
- graph with exits below the x-axis
- puzzle where `y = 2 - x` is easier to understand visually than algebraically
- first “left side” reveal with `x + y = 0`

### Stage 3: Bounding And Corners

Focus:
- sharp shape changes
- symmetry
- “distance from zero” intuition

Good tiles:
- `|`
- maybe paired as an absolute-value wrapper tile

Good equation patterns:
- `y = |x|`
- `y = |x - 2|`
- `y = |x| + 2`
- `|x| + y = 4`

What this teaches:
- not every graph is a line
- graphs can have corners
- symmetry becomes a puzzle tool

Level ideas:
- exit directly above the origin reached by `y = |x|`
- two-goal level where one side of the V reaches one exit and a shifted version reaches another
- revisit an old board where a corner avoids an obstacle that lines could not

### Stage 4: Parabolas And Powers

Focus:
- curves
- peaks and bowls
- vertical shifts

Good tiles:
- `^`
- another `2`
- maybe a dedicated superscript-style square tile later

Good equation patterns:
- `y = x^2`
- `y = x^2 + 2`
- `y = 2 - x^2`
- `y = -x^2`
- `x^2 + y = 4`
- `x^2 + y^2 = 9`

What this teaches:
- curved motion
- max/min points
- circles and conics as “equations on the left”

Level ideas:
- bowl catches an exit high on both sides
- upside-down parabola used to pass under an obstacle and back up
- first circle puzzle where the player is shocked that the whole equation defines a shape

### Stage 5: Division, Hyperbolas, And Asymptotes

Focus:
- forbidden zones
- disconnected feeling
- navigating around obstacles by approaching but never touching

Good tiles:
- `/`

Good equation patterns:
- `y = 1/x`
- `y = 2/x`
- `xy = 1`
- `x/y = 2`
- `y = 5/x`

What this teaches:
- not all graphs cross the origin
- asymptotic behavior is a mechanic, not just a visual curiosity
- left-side rearrangements can create familiar right-side curves

Level ideas:
- narrow obstacle at the center that reciprocal curves naturally avoid
- graph with goals in opposite quadrants
- revisit where `1/x` solves a board that linear tools always crashed into

Additional notation-first puzzle ideas:
- `y = (x + 2) / 2`
- `y = (5x) / (x + 5)`
- `y = (x^2 - 5) / 5`
- `y = |x - 5| / 2`
- `y = |(x - 5) / 2|`
- `y = (x + 5)(x - 2)`

### Stage 6: Exponentials And Logarithms

Focus:
- rapid growth
- slow growth
- inverse relationships

Good tiles:
- `e`
- `ln`
- `log`

Good equation patterns:
- `y = e^x`
- `y = e^x - 1`
- `y = ln(x)`
- `y = log(x)`
- `ln(x) + y = 2`
- `e^x + y = 5`

What this teaches:
- growth rates matter
- some curves only exist on part of the plane
- logs are a natural late-midgame unlock because they combine domain limits with shape recognition

Level ideas:
- right-side-only level where `ln(x)` is the intended solution
- an exit just barely reachable by exponential growth
- revisit where a log curve sneaks under a barrier that a parabola cannot

Additional log/base ideas:
- `y = log_2(x + 1)`
- `y = log_5(x + 5)`
- `y = log_2(x^2 + 1)`
- `y = log_5((x + 5) / 2)`
- `y = log_(2x)(x + 5)` for very late experimentation

### Stage 7: Trig Curves

Focus:
- oscillation
- periodic revisits
- multiple crossings

Good tiles:
- `sin`
- `cos`
- maybe `pi`

Good equation patterns:
- `y = sin(x)`
- `y = cos(x)`
- `y = 2sin(x)`
- `y = sin(x) + 2`
- `sin(x) + y = 0`

What this teaches:
- repetition
- wave patterns
- one graph can interact with several goals

Level ideas:
- board with multiple exits across the width
- obstacle course that rewards choosing the right phase/height
- revisit board where sine reaches a goal that no monotone function can

Additional trig ideas:
- `y = sin(x) + 5`
- `y = sin(x + 2) + 2`
- `y = sin(2x)`
- `y = 2sin(x + 1)`
- `y = |sin(x)|`
- `y - sin(x + 2) - 2 = 0`

### Stage 8: Piecewise And Conditional Rules

Focus:
- one equation behaving differently in different regions
- precision
- “programming” energy

Good tiles:
- condition tiles like `x > 5`
- split-function UI

Good equation patterns:
- `f1 for x < 5, f2 for x > 5`
- `y = x for x < 3; y = 2 for x > 3`
- `y = |x| for x < 0; y = x^2 for x > 0`

What this teaches:
- local behavior matters
- one puzzle can ask for two distinct graph ideas at once

Level ideas:
- two exits on one board, each meant for one branch
- obstacle in the middle forcing a discontinuity
- “repair the bridge” style puzzle where each half must do a different job

### Stage 9: Polar And Exotic Spaces

Focus:
- unfamiliar coordinate systems
- big late-game reveal

Good tiles:
- `theta`
- `r`

Good equation patterns:
- `r = Θ`
- `r = 2Θ`
- `r = 2sin(Θ)`
- `r = 1 + cos(Θ)`
- `r = |Θ - 2|`

What this teaches:
- the graph plane can stay familiar while the input variable changes completely
- radius and angle combine into shapes that feel magical compared with cartesian lines
- hiding `x` on polar-only boards keeps the notation honest and teaches players that variable choice matters

Level ideas:
- first polar spiral with `r = Θ`
- second spiral that scales outward faster with `r = 2Θ`
- late-game flower or cardioid reveal
- revisit where a polar curve reaches a goal that no cartesian formula can approach cleanly

## Notation-Focused Puzzle Bank

### Parentheses
- `y = (x + 2) / 2`
- `y = 2(x + 5)`
- `y = (x - 5)(x + 1)`
- `y = (x^2 + 5) / 5`

### Division
- `y = x / 2`
- `y = (5x) / (x + 5)`
- `y = |x - 5| / 2`
- `y = (x^2 - 5) / 5`

### Absolute Value
- `y = |x - 5|`
- `y = |x - 5| + 2`
- `y = |(x - 5) / 2|`
- `y = |x^2 - 5|`

### Sine
- `y = sin(x) + 5`
- `y = sin(x + 2) + 2`
- `y = sin(2x)`
- `y = |sin(x)|`

### Exponents
- `y = x^2`
- `y = x^2 + 5`
- `y = (x + 1)^2`
- `y = x^5`
- `5y - x^2 - 5 = 0`

### Left-Side / Zero Form
- `x + y = 0`
- `y + x - 2 = 0`
- `y - sin(x + 2) - 2 = 0`
- `5y - x^2 - 5 = 0`

### Logarithms
- `y = log_2(x + 1)`
- `y = log_5(x + 5)`
- `y = log_5(x^2 + 5)`
- `y = log_2((x + 5) / 2)`

### Polar
- `r = Θ`
- `r = 2Θ`
- `r = 2sin(Θ)`
- `r = 1 + cos(Θ)`

Good equation patterns:
- `r = theta`
- `r = sin(theta)`
- `r = 2 + sin(theta)`
- `r = cos(2theta)`

What this teaches:
- entirely new graph language
- late-game wonder

Level ideas:
- separate polar-only biomes
- circular exits that make more intuitive sense in polar than Cartesian
- revisit where a polar spiral unlocks hidden outer-world paths

## Equation Family Brainstorm List

### Beginner-Friendly

- `y = x`
- `y = 2`
- `y = 5`
- `y = x + 2`
- `y = x + 5`
- `y = 2x`
- `y = 5x`
- `y = 25`
- `y = 25x`

### Linear But Richer

- `y = -x`
- `y = 2 - x`
- `y = x - 5`
- `y = -2x + 5`
- `x + y = 0`
- `2x + y = 5`
- `x - y = 2`

### Absolute Value

- `y = |x|`
- `y = |x - 2|`
- `y = |x| + 5`
- `|x| + y = 4`
- `|x - 5| + y = 2`

### Quadratic / Polynomial

- `y = x^2`
- `y = x^2 - 2`
- `y = 2 - x^2`
- `y = -x^2`
- `y = (x - 2)^2`
- `x^2 + y = 4`
- `x^2 + y^2 = 9`

### Rational

- `y = 1/x`
- `y = 2/x`
- `y = -1/x`
- `xy = 1`
- `xy = 5`

### Exponential / Logarithmic

- `y = e^x`
- `y = e^x - 1`
- `y = 2^x`
- `y = -2^x`
- `y = ln(x)`
- `y = log(x)`
- `ln(x) + y = 3`

### Trigonometric

- `y = sin(x)`
- `y = cos(x)`
- `y = 2sin(x)`
- `y = sin(x) + 2`
- `y = -cos(x)`
- `sin(x) + y = 0`

### Piecewise / Conditional

- `y = x for x < 3; y = 2 for x > 3`
- `y = sin(x) for x < 0; y = x for x > 0`
- `y = |x| for x < 2; y = x^2 for x > 2`

### Polar / Endgame

- `r = theta`
- `r = sin(theta)`
- `r = cos(theta)`
- `r = 2 + sin(theta)`
- `r = cos(2theta)`

## Recommended Unlock Order

This is a good “from intuitive to expressive” sequence:

1. `x`
2. `1`
3. `2`
4. `5`
5. `+`
6. `-`
7. `0`
8. left-side `y` / equation-flip levels
9. absolute value
10. powers / square
11. division
12. `e`
13. `ln` or `log`
14. `sin`
15. `cos`
16. split-function mechanic
17. `theta`
18. blank copy tile

## Revisit Strategy

Good revisit moments:

- `+` unlock makes old slope-only boards solvable by shifting instead of steepening.
- `-` unlock turns earlier right-only boards into mirror puzzles.
- absolute value unlock makes obstacle-dodging suddenly possible.
- quadratic unlock adds vertical reach and symmetric double-goal solves.
- reciprocal unlock solves “avoid the middle” boards.
- trig unlock solves multi-goal boards in one sweep.
- piecewise unlock turns impossible “do two things at once” boards into endgame victories.

## Puzzle Authoring Heuristics

- Early boards should have one obvious intended equation.
- Midgame boards should have a few valid equations, but one especially elegant one.
- Late boards can intentionally support multiple mathematical interpretations.
- If a level introduces new notation, keep the geometry easy.
- If a level introduces hard geometry, keep the notation familiar.
- Use target-shape placement to hint at family:
  - top-center often suggests symmetry
  - side exits suggest shifted lines or logs
  - multiple exits suggest trig or piecewise
- Avoid authoring levels where weird parser edge-cases look “more right” than the intended algebraic idea.

## Best Candidates For Near-Term Implementation

These feel especially strong for the next playable expansions:

1. Negative-line world:
   - `y = -x`
   - `y = 2 - x`
   - `x + y = 0`

2. Absolute-value world:
   - `y = |x|`
   - `y = |x - 2|`

3. Quadratic world:
   - `y = x^2`
   - `y = 2 - x^2`

4. Log / exponential world:
   - `y = e^x`
   - `y = ln(x)`

5. Trig world:
   - `y = sin(x)`
   - `y = cos(x)`

## Open Design Questions

- Do we want function-name tiles like `sin` and `log` to wrap the next expression automatically, or behave like a token sequence the player completes?
- Should absolute value be one wrapper tile or two pipe tiles?
- When left-side equations unlock, do we expose that via fixed templates first or immediately allow free-form left-side editing?
- Do we want `pi` as a tile before trig, or should trig early levels avoid needing it?
- Should polar coordinate areas be a hard mode switch with a different graph renderer, or just special graphs inside the same world?
