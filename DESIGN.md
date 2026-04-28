# Graphbound Finish-Line Design Notes

This doc is a working brainstorm for the last 20% of Graphbound: the looks, feel, animation, audio, and playful touches that make solving puzzles feel rewarding instead of merely correct.

The current game already has a strong paper-and-pencil identity. The finish-line goal is to make every action feel tactile, every unlock feel obvious, and every solved puzzle feel like the world is gently celebrating the player.

## Design Pillars

1. Calm, tactile, and rewarding
   - The game should feel like moving paper cutouts around a notebook page.
   - Feedback should be satisfying but not loud or arcade-like.
   - The world should feel alive in small ways: tiny wiggles, sketched reveals, soft sounds, and playful doodle reactions.

2. Math feels physical
   - Playing a tile should feel like placing a real object.
   - A graph line should feel like pencil lead traveling across paper.
   - A target hit should feel like the equation and shape snap into agreement.

3. Unlocks must be unmistakable
   - When a tile unlocks, the player should instantly know which tile is new.
   - When a puzzle unlocks, the player should see where it is and feel pulled toward it.
   - The reward beat should be visually and sonically different from ordinary tile placement.

4. Delight is ambient, not clutter
   - Add joy through motion, sound, and tiny doodles rather than explanatory UI.
   - Keep the paper minimal and readable.
   - Avoid burying the puzzle under effects.

## Core Feedback Moments

### Tile Hover

Current purpose: show a tile is interactive.

Finish-line feel:
- Tile rises 3-5px with a tiny paper shadow.
- The rough outline subtly redraws with a stronger stroke.
- Cursor hover can trigger a very quiet paper rustle or no sound at all.
- Invalid or dimmed tiles still hover normally, since dimmed means "already used here" rather than "disabled forever."

Animation:
- 90ms ease-out lift.
- 120ms ease-in settle.
- Optional tiny 1-degree rotation, deterministic by tile id.

### Tile Pick Up

Current purpose: start drag.

Finish-line feel:
- Tile scales to 1.05 and rotates by 2-4 degrees.
- Shadow separates from the page.
- A quiet paper lift sound plays.

Sound:
- Short "paper flick" or "soft pluck."
- Low volume.
- Use a small rotating set of subtly different lift sounds so repeated moves do not feel robotic.

### Tile Played Into Slot

This is one of the most important sounds in the game.

Finish-line feel:
- Tile lands with a soft paper tap.
- Slot outline briefly squeezes inward then returns.
- Tile does a small settle wiggle, like it found its place.
- If placing the tile completes a valid expression, the graph line begins after a very short beat.

Sound direction:
- A satisfying soft "tock" made from layered sounds:
  - paper tap transient
  - light woodblock or muted xylophone body
  - tiny pencil scratch tail
- Duration: 80-140ms.
- Do not give every tile its own pitch identity. Instead, rotate through a small family of slightly different thunk sounds each time a tile is placed.

Implementation idea:
- Start with Web Audio synths instead of asset files:
  - filtered noise burst for paper
  - sine or triangle oscillator for body
  - short envelope with randomized pitch within a narrow range
- Keep the audio generated/synthesized only. Do not plan on recorded paper or pencil assets.

### Invalid Tile Placement

Finish-line feel:
- Tile gently rejects, not harshly fails.
- The target slot gives a small side-to-side shake.
- Tile floats back to where it came from.

Sound:
- Very soft dull tap or muted thud.
- Avoid buzzer-like sounds.

Animation:
- 120ms shake, 180ms return.
- Keep this quick so experimenting stays pleasant.

### Graph Line Draw

Current purpose: show whether the equation reaches a target.

Finish-line feel:
- The line should sound and look like pencil moving across paper.
- As it approaches a target, the target shape can faintly pulse, as if noticing the line.
- If the line misses all targets, it still draws beautifully but ends quietly.

Sound:
- Very subtle pencil sketch loop while line is drawing.
- Volume tied to draw progress and muted when the line is short.
- Optional small pitch rise when the line gets within range of a target.

Animation:
- Keep current line draw, but add:
  - slight darkening at the line tip
  - tiny graphite dust dots near the tip
  - target anticipation pulse during the last 15% before hit

### Target Hit

Current purpose: mark puzzle success.

Finish-line feel:
- The target shape should "pop" clearly.
- Numbers/guides should stay readable above everything.
- The target becomes filled or stamped, then sends energy into the unlock path.

Visual beat:
- 0ms: line reaches target center.
- 80ms: target scales up to 1.22.
- 180ms: target settles to 1.0 with a filled-paper/stamped look.
- 220ms: 4-8 tiny doodle sparks appear around it, shaped like mini ticks, stars, hearts, or pencil dots.
- 260ms: unlock route begins.

Sound:
- A small harmonic chime, not a fanfare.
- Paper stamp transient plus two soft notes.
- Notes should fit the background music key.

### Tile Unlock

This needs to feel very rewarding and obvious.

Problem to solve:
- A tile appearing in the tray can be missed if the player is looking at the graph.
- The game needs to say "you got a new tool" without using instructional popups.

Recommended unlock animation:
1. The solved target shape becomes the source of the reward.
2. The new tile appears oversized right next to that target shape.
3. The tile is sketched in stages:
   - dashed outline
   - paper fill hatch
   - symbol written by pencil
   - small sparkle/doodle burst
4. A short colored pulse links the target to the new tile.
5. The tile floats from the solved graph into its tray position.
6. Existing tray tiles gently make room for it.

Timing:
- 0-300ms: target hit.
- 300-900ms: new tile reveal near the solved target shape.
- 900-1200ms: tile travels to tray.
- 1200-1400ms: tray settles.

Sound:
- Distinct "new tile" motif:
  - paper unfold
  - pencil write sound for the symbol
  - warm two- or three-note chime
- The final note lands when the tile reaches the tray.
- The tile's first playable hover could have a slightly brighter sound for a few seconds.

Visual details:
- New tile should have a temporary colored outline matching the goal that unlocked it.
- For 2-3 seconds, the tile can have a soft pulsing rim.
- The symbol should briefly be drawn larger above the tile before settling.

### Puzzle Unlock

This should feel like the world opening.

Recommended unlock animation:
1. Target fills.
2. Dashed route draws outward with camera following.
3. The next graph appears in a sketch sequence:
   - target shapes first as faint graphite marks
   - axes draw in with pencil strokes
   - ticks appear in a fast "tap tap tap" rhythm
   - equation row fades/sketches in
   - empty slots bounce once
4. A subtle doodle appears near the new puzzle as a one-time reward.

Sound:
- Pencil route sketch sound during connector draw.
- Soft page shimmer as new graph appears.
- Ticks can make very quiet staggered pencil taps.
- Completion chime should be calmer than tile unlock, because the visual camera move already carries the reward.

Camera:
- Camera should arrive just before or exactly as the new graph finishes sketching.
- Avoid long dead travel after the connector finishes.
- If route distance is long, cap duration and use a slightly faster pan rather than dragging the moment out.

### Multi-Target Puzzle Completion

Some puzzles have multiple targets. Individual target solves should be satisfying, but completing the final target should have an extra beat.

Finish-line feel:
- Solving one target: small target pop.
- Solving the last target on a puzzle: graph-level completion flourish.

Graph completion flourish:
- Completed target shapes pulse in sequence.
- The equation row gives a tiny satisfied bounce.
- The graph's axis strokes briefly darken and then return.
- A tiny checkmark doodle appears somewhere near the graph, then fades into the background texture.

## Audio Direction

### Overall Sound Palette

The game should sound like:
- pencil on paper
- soft paper taps
- small wooden desk objects
- warm bell/chime tones
- quiet classroom ambience
- gentle music box or felt piano

Avoid:
- sharp UI clicks
- gamey coin sounds
- buzzy error tones
- loud success fanfares
- heavy percussion

### Music

Desired mood:
- Calm, curious, warm.
- Light enough to puzzle over.
- A little magical, but still grounded in the paper/notebook world.

Instrumentation ideas:
- Felt piano
- Soft marimba or kalimba
- Warm synth pad
- Music box accents
- Gentle brushed percussion
- Subtle vinyl/tape-like texture

Structure:
- 60-90 second loop.
- Sparse melody, lots of breathing room.
- Key should support small success chimes, probably C major, D major, or G major.
- Add stems later:
  - base ambient loop
  - light melody layer after a few puzzles
  - extra warm pad in late game
  - subtle sparkle layer during solve/unlock sequences

Adaptive music ideas:
- Add one instrument layer after each major mechanic family unlocks.
- Slightly brighten harmony when a new tile unlocks, then fade back.
- Lower music volume automatically during solve/unlock sound effects.

Implementation notes:
- Add a small DOM settings button for mute/music/sfx controls rather than drawing settings directly on the canvas.
- Respect browser autoplay: start audio only after first player interaction.
- Store volume preferences in local storage.
- Keep default volume conservative.
- Keep all sound generated/synthesized in code; avoid recorded audio assets for this version.

### Sound Effects List

Minimum set:
- `tile-hover` optional, very quiet
- `tile-pickup`
- `tile-place`
- `tile-replace`
- `tile-invalid`
- `line-draw-loop`
- `target-hit`
- `tile-unlock`
- `puzzle-unlock-route`
- `puzzle-sketch-in`
- `graph-complete`
- `camera-arrive` optional soft settle

Nice-to-have:
- `slot-highlight`
- `tray-shift`
- `target-hover`
- `target-pin`
- `menu-open`
- `music-layer-in`

## Visual Polish Ideas

### Paper Material

The paper background is already doing good work. Finish-line polish can add:
- Very subtle parallax paper fibers.
- Occasional faint eraser smudges around solved graphs.
- Tiny pencil dust near recently drawn graph lines.
- Slightly darker pressure at line starts and target hits.

Keep it deterministic. No camera flicker.

### Tiles

Make tiles feel collectible:
- Each tile type gets a tiny personality through shape jitter and hatch pattern.
- New tiles get a temporary colored rim when unlocked.
- Recently used tile has a small "pressed" state.
- When a tile becomes unavailable for the selected puzzle, opacity dims but the tile still reacts to hover and drag.

Tile unlock identity:
- `x` and `y`: variable family, warm yellow paper.
- numbers: peach paper.
- operators: cream paper.
- trig/constants: slightly cooler paper or a small corner mark.

### Slots

Slots should feel like places waiting for paper pieces:
- Empty slots breathe subtly when the selected tile can go there.
- Compatible slots can have a hand-drawn dash animation.
- Occupied slots can briefly flash when replaced.

### Goal Shapes

Goal shapes are the emotional targets.
- Hover: target grows slightly and guide numbers pop larger.
- Click/pin: target stays lifted with a tiny shadow and guide labels above all content.
- Solved: target gets a stamped fill, fades into the paper, and becomes clearly less important than unsolved target shapes.
- Locked: graphite-only target with low contrast.
- Unlocked unsolved: colored, visible, and the most important target state on the screen.

### Doodles And Joy

These are separate from target shapes. They are small reward flourishes and background marks, not puzzle objectives.

Small playful touches that fit the paper world:
- A tiny flower blooms near a completed route.
- A paper airplane doodle glides across a newly opened region once.
- A smiley or star doodle appears after a tough puzzle.
- Occasionally, a tiny pencil checkmark draws itself near a solved graph.
- New mechanic families can have themed doodles:
  - absolute value: folded paper crease
  - powers: little rocket or stairs
  - trig/polar: spiral doodles
  - pi: tiny pie-slice doodle, but restrained

Rules:
- Doodles should never overlap graphs, equations, target shapes, or connector paths.
- Doodles should be one-time reward beats that fade into low-contrast background flavor.
- Doodles must never compete with unsolved target shapes. Unsolved targets should remain the clearest and most visible shapes in the world.
- Do not add explanatory text.

## Animation Timing Guidelines

Use short, satisfying beats:
- Tile hover: 90-120ms.
- Tile place: 120-180ms.
- Invalid shake: 180-260ms.
- Target pop: 220-300ms.
- Tile unlock reveal: 900-1400ms.
- Puzzle sketch-in: 900-1300ms.
- Connector route: 620-2100ms depending on distance.
- Camera travel: should match connector travel, not continue long after it.

Easing:
- Use ease-out for physical arrivals.
- Use ease-in-out for camera movement.
- Use a tiny overshoot for tile/target pops.
- Avoid bouncy elastic easing for the camera.

## Reward Hierarchy

The game should reserve bigger effects for bigger accomplishments.

Small reward:
- valid tile placement
- target hover
- compatible slot highlight

Medium reward:
- target hit
- single puzzle route unlock
- tile replacement that completes a solution

Large reward:
- new tile unlock
- final target on a multi-target graph
- reaching a new mechanic family
- Finale solve

Finale reward ideas:
- All solved routes faintly glow in sequence across the visible world.
- The final equation line draws with a richer pencil texture.
- Doodles around the world animate once: flowers, stars, spirals, checkmarks.
- Music adds one final layer and resolves.
- Keep it warm and understated, not explosive.

## Implementation Roadmap

### Pass 1: Audio Foundation

- Add `AudioManager` with muted/music/sfx volume state.
- Unlock Web Audio on first player interaction.
- Implement synthesized `tile-place`, `tile-invalid`, `target-hit`, and `tile-unlock`.
- Add volume defaults and local storage.
- Add a small DOM settings button with mute/music/sfx controls.

### Pass 2: Tile Tactility

- Add hover lift and drag shadow refinements.
- Add tile place settle animation.
- Add occupied-slot replacement flash.
- Add new tile tray arrival animation.

### Pass 3: Unlock Reward Beats

- Make tile unlocks visually explicit with oversized reveal and fly-to-tray.
- Add puzzle sketch-in stages with subtle sound.
- Add final-target graph completion flourish.

### Pass 4: Ambient Joy

- Add one-time reward doodles near solved targets.
- Add mechanic-family doodles.
- Add subtle paper dust around recently drawn graph lines.
- Make reward doodles fade into background texture and keep unsolved target shapes visually dominant.

### Pass 5: Music

- Add a calming loop.
- Add simple adaptive layers later.
- Duck music slightly during target and unlock sounds.

## Product Decisions

- Tile unlocks reveal near the solved graph first, anchored at the target shape that unlocked them, before traveling into the tray.
- Settings should live in a small DOM button with controls for mute/music/sfx.
- Audio should be generated/synthesized only for this version.
- Tiles should not have unique pitch identities. Tile placement should rotate through a small set of subtly different thunk sounds.
- Reward doodles are separate from target shapes. They should fade into the background and never compete with unsolved target shapes.
- Solved target shapes should become clearly quieter than unsolved target shapes; unsolved targets are the most important shapes to keep visible.

## Success Criteria

The finish-line polish is working if:
- A new player immediately notices when a tile unlocks.
- Playing a tile feels satisfying even before solving.
- Solving a puzzle produces a clear emotional beat.
- Unlocking a new puzzle makes the player want to follow the route.
- The music can loop for 20 minutes without becoming irritating.
- The game still feels calm, readable, and mathematical.
