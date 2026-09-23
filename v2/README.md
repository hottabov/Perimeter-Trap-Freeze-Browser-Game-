# Perimeter v2

The full game built on the visual prototype: a 2.5D Three.js arcade game where every level is a new generated world.

Open `v2/index.html` through any static server (ES modules need http). On the live server it runs at `/v2/` next to the original game and uses the same leaderboard API.

## How to play

- Move along the ice edge with the arrows / WASD, or swipe on a phone.
- Step into the open field to draw a line. Close it on ice and everything except the largest open area freezes.
- Enemies trapped in frozen ice shatter. Enemies that touch your line, or you, cost a life.
- Clear a level by freezing the goal percentage of the field (75% and rising) or by shattering every enemy.

## What's in the game

**Worlds.** Levels 1–3 use the three hand-tuned styles (Fire & Ice, Neon Glacier, Cryo Void). From level 4 on, every level generates a new world from a seed: palette, ice height profile, enemy colours, UI colours, music key and scale, and a name such as *Cinder Fjord* or *Helix Array*. On the title screen you can pick "Every level new" or lock one style family. During a game, 1 / 2 / 3 / G generates a new world instantly.

**Enemies**

| Enemy | From level | Behaviour |
|---|---|---|
| Drifter | 1 | Bounces off ice |
| Sparx | 2 | Crawls along the ice edge, so standing still on the edge is no longer safe. Freeze the stretch of edge it is on and it is buried and shatters (2,000 × multiplier) |
| Hunter | 3 | Turns toward you while you are drawing a line |
| Splitter | 4 | Splits into two drifters if you leave it alone too long |
| Boss | every 5th | Has rings (HP). Each capture cracks one ring, and it breaks out smaller, faster and with a minion |

**Ice erosion.** Every time an enemy bounces off ice you froze, the ice cracks: the hit cell takes 2 damage and its neighbours along the wall take 1 (the boss hits harder and wider). Ice holds 3 hits on levels 1–2 and 2 hits from level 3. Broken cells melt back into open field, so the frozen percentage can drop if you are slow. The outer frame and level obstacles never break.

**Power-ups** appear on the field. Touch one, or freeze the area it's in, to collect it:
- Slow time: enemies and sparx at 45% speed for 7 s
- Haste: +45% hero speed for 7 s
- Shield: absorbs one hit
- +1 life: at most once per level

**Scoring**
- Area points grow faster for big cuts.
- Kills are multiplied by the number of enemies caught in one cut and by the streak multiplier (×2…×5 for consecutive cuts that kill).
- Clearing a level pays a level bonus, a time bonus against par, a bonus for freezing past the goal, and a bonus for losing no lives.
- Stars: 1 for clearing, 2 for losing no lives, 3 for losing no lives and beating par.

**Level layouts** rotate through open fields, pillars, crosses, combs, islands and a broken ring.

## Code

| File | Role |
|---|---|
| `js/core.js` | Game rules: grid, hero, enemies, sparx, power-ups, capture, scoring |
| `js/levels.js` | Level specs (enemy mix, goal, par time) and obstacle layouts |
| `js/themegen.js` | Seeded world generator (palettes, names, music key) |
| `js/themes.js` | The three hand-tuned base styles |
| `js/render.js` | Three.js renderer: instanced ice columns, enemies, sparx, power-ups, particles, shards, post FX, level transitions, adaptive resolution |
| `js/shaders.js` | GLSL for ice, trail, floors, enemy orbs, particles and the final pass |
| `js/audio.js` | Procedural Web Audio: effects and ambient bed per world |
| `js/net.js` | Leaderboard through `/api/leaderboard` and `/api/score`, with a local fallback |
| `js/main.js` | Boot, input, HUD, screens, level flow |
