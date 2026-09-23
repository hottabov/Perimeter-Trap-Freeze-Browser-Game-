# Perimeter v2

The full game built on the visual prototype: a 2.5D Three.js arcade game where every level is a new generated world.

Open `v2/index.html` through any static server (ES modules need http). On the live server it runs at `/v2/` next to the original game and uses the same leaderboard API.

## How to play

- Move along the ice edge with the arrows / WASD, or swipe on a phone.
- Step into the open field to draw a line. Close it on ice and everything except the largest open area freezes.
- Enemies trapped in frozen ice shatter. Enemies that touch your line, or you, cost a life.
- Clear a level by freezing 90% of the field or by shattering every enemy.
- After losing a life the hero respawns on the edge and waits there until you press a direction.

## What's in the game

**Worlds.** Six world families, each with its own floor, ice, enemy look, UI colours and ambient sound:

| # | Family | Look |
|---|---|---|
| 1 | Fire & Ice | Ember lake under blue ice |
| 2 | Neon Glacier | Synthwave grid, solid glossy ice tops |
| 3 | Cryo Void | Crystal lattice in deep space |
| 4 | Cave | Amethyst grotto, glowing veins, firefly enemies, dripping water |
| 5 | Abyss | Tar floor with blinking eyes, obsidian ice, eyeball enemies that watch you, heartbeat |
| 6 | Sky | Sea of clouds, pearl and gold ice, storm-orb enemies, chimes |

Levels 1–6 use the six hand-tuned worlds in that order. From level 7 on, every level generates a new world from a seed (palette, ice profile, colours, music key and scale, a name such as *Cinder Fjord* or *Helix Array*), never repeating the previous family. The title screen has a single Play button. During a game, 1–6 or G generates a new world instantly.

**Enemies**

| Enemy | From level | Behaviour |
|---|---|---|
| Drifter | 1 | Bounces off ice |
| Sparx | 2 | Crawls along the ice edge, so standing still on the edge is no longer safe. Freeze the stretch of edge it is on and it is buried and shatters (2,000 × multiplier) |
| Hunter | 3 | Turns toward you while you are drawing a line |
| Splitter | 4 | Splits into two drifters if you leave it alone too long |
| Boss | every 5th | Has rings (HP). Each capture cracks one ring, and it breaks out smaller, faster and with a minion |

**Ice erosion.** Enemies chew through ice. Every bounce hits a disc of cells around the impact point: cells in the core lose 2 HP, cells on the rim lose 1 (big enemies and the boss hit wider). Your ice has 2 HP; level obstacles have 3. Only cells facing open field can break, and a break can crumble its neighbours in a short chain. Broken cells melt back into open field, so the frozen percentage drops if you are slow. Only the outer frame never breaks.

**Power-ups** drop onto the field as a spinning crystal with an icon, orbiting sparks and a landing ring; they blink before they expire. Touch one, or freeze the area it's in, to collect it:
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
| `js/themegen.js` | Seeded world generator for the six families (palettes, names, music key) |
| `js/themes.js` | The six hand-tuned worlds |
| `js/render.js` | Three.js renderer: instanced ice columns, enemies, sparx, power-ups, particles, shards, post FX, level transitions, adaptive resolution |
| `js/shaders.js` | GLSL for ice, trail, floors, enemy orbs, particles and the final pass |
| `js/audio.js` | Procedural Web Audio: effects and ambient bed per world |
| `js/net.js` | Leaderboard through `/api/leaderboard` and `/api/score`, with a local fallback |
| `js/main.js` | Boot, input, HUD, screens, level flow |
