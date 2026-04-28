# Graphbound Puzzle Progression Draft

This file is generated from `puzzles.json`. Run `npm run generate-puzzles` after editing puzzle data.

Authoring requirements live in `REQUIREMENTS.md`.

| # | puzzle name | equation | solution | unlocks puzzle | unlocks tile | x-axis | y-axis | target coordinate |
|---|---|---|---|---|---|---|---|---|
| 1a | Sprout | y = □ | y = x | 2 Ridge | 2 | 0 to 10 | 0 to 10 | (10, 10) |
| 2a | Ridge | y = x + □ | y = x + 2 | 3 Orchard | + | 0 to 10 | 0 to 12 | (10, 12) |
| 3a | Orchard | y = □ □ | y = 2x | none | 5 | 0 to 10 | 0 to 20 | (10, 20) |
| 3b | Orchard | y = □ □ | y = 5x | 4 Cove | none | 0 to 10 | 0 to 20 | (4, 20) |
| 4a | Cove | y = □ □ □ □ | y = 5x + 2 | 5 Basin | none | 0 to 5 | 0 to 20 | (3.5, 20) |
| 5a | Basin | y = □ - □ | y = x - 5 | 6 Gallery | none | 0 to 10 | -5 to 5 | (10, 5) |
| 5b | Basin | y = □ - □ | y = 5 - x | 7 Canopy | none | 0 to 10 | -5 to 5 | (10, -5) |
| 6a | Gallery | y = □ □ □ □ | y = 2x + 5 | none | - | -5 to 5 | -5 to 15 | (5, 15) |
| 6b | Gallery | y = □ □ □ □ | y = 5 - 2x | 8 Crossroads | none | -5 to 5 | -5 to 15 | (5, -5) |
| 7a | Canopy | y = \|x - □\| | y = \|x - 5\| | 9 Hollow | none | 0 to 10 | 0 to 8 | (0, 5) |
| 8a | Crossroads | y = □ □ x □ □ | y = 5 + x - 2 | 10 Eastreach | none | -10 to 10 | -2 to 10 | (7, 10) |
| 9a | Hollow | y = □ □ □ | y = x + 5 | none | left parenthesis | 0 to 5 | -5 to 10 | (5, 10) |
| 9b | Hollow | y = □ □ □ | y = x - 2 | 11 Paren Grove | none | 0 to 5 | -5 to 10 | (5, 3) |
| 7b | Canopy | y = \|x - □\| | y = \|x - 2\| | 12 Southreach | none | 0 to 10 | 0 to 8 | (10, 8) |
| 10a | Eastreach | y = □ □ □ □ | y = 2x - 5 | 13 Weir | none | 0 to 10 | -5 to 15 | (10, 15) |
| 11a | Paren Grove | y = □ 2 □ x )^2 | y = (2 + x)^2 | none | right parenthesis | -2 to 3 | 0 to 20 | (2.5, 20) |
| 12a | Southreach | y = (x □ 2 □^2 | y = (x - 2)^2 | 14 Forge | none | -2 to 4 | 0 to 9 | (-1, 9) |
| 13a | Weir | y = 5x □ □ | y = 5x - 2 | none | / | 0 to 5 | 0 to 20 | (4.5, 20) |
| 8b | Crossroads | y = □ □ x □ □ | y = 5 / x + 2 | 15 South Vault | none | -10 to 10 | -2 to 10 | (-1.5, -1.5) |
| 14a | Forge | y = □ □ □ □ | y = 2x / 5 | 16 Anvil | none | 0 to 10 | 0 to 5 | (10, 4) |
| 15a | South Vault | y = □x / □ | y = 5x / 2 | 17 Cellar | none | 0 to 8 | 0 to 20 | (8, 20) |
| 16a | Anvil | y = 2 □ □x | y = 2 - 5x | none | ^ | -3 to 2 | -8 to 12 | (2, -8) |
| 8c | Crossroads | y = □ □ x □ □ | y = 5 - x ^ 2 | 18 Echo | none | -10 to 10 | -2 to 10 | (2.5, -1.5) |
| 17a | Cellar | y = x □ □ + 5 | y = x ^ 2 + 5 | 19 Loft | none | -4 to 4 | 0 to 20 | (4, 20) |
| 18a | Echo | y = □ / □ □ □ | y = x / 2 + 5 | none | 0 | 0 to 10 | 0 to 15 | (10, 10) |
| 18b | Echo | y = □ / □ □ □ | y = x / 5 + 2 | none | y | 0 to 10 | 0 to 5 | (10, 4) |
| 18c | Echo | y = □ / □ □ □ | y = 2 / x + 5 | none | = | 0 to 10 | 0 to 10 | (0, 10) |
| 8d | Crossroads | y = □ □ x □ □ | y = 2 - x + 0 | 20 Finale | none | -10 to 10 | -2 to 10 | (-8, 10) |
| 19a | Loft | r = □ | r = 2 | none | theta | -3 to 2 | -3 to 3 | (2, 0) |
| 19b | Loft | r = □ | r = theta | 21 Weave | none | -3 to 3 | -3 to 3 | (-3, 0) |
| 20a | Finale | □ □ □ □ □ □ □ | y = 2 ^ x + 5 | 22 Circle Garden | none | 0 to 5 | 0 to 17 | (3.5, 17) |
| 21a | Weave | r = □ □ | r = 2theta | 23 Spiral Step | none | -7 to 7 | -7 to 7 | (-6.5, 0) |
| 22a | Circle Garden | x ^ 2 + y ^ 2 = □ □ | x ^ 2 + y ^ 2 = 25 | 24 Ellipse Hall | none | -5 to 5 | -5 to 5 | (5, 0) |
| 23a | Spiral Step | r = theta + □ | r = theta + 2 | 25 Parabola Gate | none | -5 to 5 | -5 to 5 | (-5, 0) |
| 24a | Ellipse Hall | x ^ 2 / 2□ □ y ^ □ = 1 | x ^ 2 / 25 + y ^ 2 = 1 | 26 Hyperbola Door | none | -2 to 3 | -4 to 2 | (3, 1) |
| 25a | Parabola Gate | y ^ 2 = □x | y ^ 2 = 2x | none | sin | 0 to 10 | -5 to 5 | (10, 4.5) |
| 26a | Hyperbola Door | x ^ 2 - y ^ 2 = □ □ | x ^ 2 - y ^ 2 = 25 | 27 Rose Garden | none | -5 to 5 | -5 to 5 | (5, 0) |
| 27a | Rose Garden | r = □ □(2theta) + □ | r = 2sin(2theta) + 0 | 29 Lemniscate | none | -3 to 2 | -3 to 2 | (1.5, 1) |
| 27b | Rose Garden | r = □ □(2theta) + □ | r = 5sin(2theta) + 0 | 30 Witch Window | none | -4 to 4 | -4 to 4 | (3.5, 3.5) |
| 27c | Rose Garden | r = □ □(2theta) + □ | r = 5sin(2theta) + 2 | none | pi | -5 to 5 | -5 to 5 | (5, 5) |
| 29a | Lemniscate | r ^ 2 = 5□(□theta) + □ | r ^ 2 = 5sin(2theta) + 0 | 31 Serpentine | none | -3 to 2 | -3 to 2 | (2, 0.5) |
| 30a | Witch Window | y = sin(□x) | y = sin(pi x) | 32 Spiral Loft | none | 0 to 5 | -2 to 3 | (0.5, 1) |
| 31a | Serpentine | y = □x / (x ^ 2 + 2) □ □ | y = 5x / (x ^ 2 + 2) + 0 | 33 Fermat Spiral | none | -3 to 2 | -3 to 2 | (1.5, 1.5) |
| 32a | Spiral Loft | r = □ | r = 5 | 35 Sine Dial | none | -5 to 5 | -5 to 5 | (-5, 0) |
| 33a | Fermat Spiral | r ^ 2 = □ | r ^ 2 = theta | 35 Sine Dial | none | -2 to 4 | -3 to 3 | (-2, 0) |
| 35a | Sine Dial | □ □ □(□x) / 2 | y = sin(pi x) / 2 | 36 Pi Vault | none | 0 to 5 | -5 to 0 | (0, 0) |
| 36a | Pi Vault | □ □ x □ 2 □ □ | y = x ^ 2 / pi | 37 Half Gate | none | 0 to 5 | 0 to 10 | (5, 8) |
| 37a | Half Gate | y = 5x □ □2□ □ □ | y = 5x / (2) - 5 | 38 Paren Echo | none | 0 to 5 | 0 to 15 | (5, 7.5) |
| 38a | Paren Echo | y = □x - 5□ ^ 2 | y = (x - 5)^2 | victory | none | 0 to 5 | 0 to 20 | (0.5, 20) |
