# Perimeter v2

The full game built on the visual prototype: a 2.5D Three.js arcade game where every level is a new generated world.

Open `v2/index.html` through any static server (ES modules need http). On the live server it runs at `/v2/` next to the original game and uses the same leaderboard API.

## How to play

- Move along the ice edge with the arrows / WASD, or swipe on a phone.
- Step into the open field to draw a line. Close it on ice and everything except the largest open area freezes.
- Enemies trapped in frozen ice shatter. Enemies that touch your line, or you, cost a life.
- Clear a level by freezing 90% of the field or by shattering every enemy.
- **The journey:** nine worlds, from Ember Lake down through the desert, the cave, the abyss and hell, then up to the sky and the Golden Gates of heaven. Clearing level 9 finishes the journey; after that the game continues in endless mode with generated worlds.
- After losing a life the hero respawns on the edge and waits there until you press a direction.

## What's in the game

**Worlds.** Nine world families, each with its own floor, ice, enemy look, UI font and colours, ambient sound and music:

| # | Family | Look | Music |
|---|---|---|---|
| 1 | Fire & Ice | Ember lake under blue ice | Slow bells and brushed drums |
| 2 | Neon Glacier | Synthwave grid, solid glossy ice tops | Synthwave: four-on-the-floor, saw bass, arpeggios |
| 3 | Cryo Void | Crystal lattice in deep space | Ambient glass tones |
| 4 | Desert | Wind-carved dunes, sandstone with turquoise glow, scarab enemies | Darbuka rhythm, plucked oud in a Hijaz scale |
| 5 | Cave | Amethyst grotto, glowing veins, fireflies, drips | Toms and marimba |
| 6 | Abyss | Tar floor with blinking eyes, obsidian ice, eyeball enemies | Heartbeat, dissonant bells |
| 7 | Hell | Basalt plates on a lava sea, magma-ball enemies | Fast metal: double kick, distorted riff |
| 8 | Sky | Sea of clouds, pearl and gold ice, storm orbs | Light shuffle and flute |
| 9 | Heaven | Marble and gold over turning sacred geometry, many-eyed seraphs | Choir pads and harp |

Levels 1–9 use the nine hand-tuned worlds in that order. From level 10 on, every level generates a new world from a seed (palette, ice profile, colours, music key, tempo and melody, a name such as *Cinder Fjord* or *Helix Array*), never repeating the previous family. During a game, 1–9 or G generates a new world instantly.

**Music.** Every world has its own procedural song (`js/music.js`): the family sets the style (tempo, drum kit, bass, lead instrument, pad) and the world's seed picks the chord progression and writes the melody. The music reacts to play: drums drop out on the title screen, the mix opens up and gets busier while you draw a line, and it muffles when paused.

**Arena shapes.** Levels 1–2 are open rectangles. From level 3 the arena changes shape: octagon, corner (L), cross, horseshoe, ring with a hole in the middle, anvil (T), zigzag, twin halls (H), terraces and twin pools. Shapes are mirrored at random. All edges are straight so the hero can walk every wall with the arrow keys.

**Enemies**

| Enemy | From level | Behaviour |
|---|---|---|
| Drifter | 1 | Bounces off ice |
| Sparx | 2 | Crawls along the ice edge, so standing still on the edge is no longer safe. Freeze the stretch of edge it is on and it is buried and shatters (2,000 × multiplier) |
| Hunter | 3 | Turns toward you while you are drawing a line |
| Splitter | 4 | Splits into two drifters if you leave it alone too long |
| Boss | 5, 9, then every 5th from 15 | Has rings (HP). Each capture cracks one ring, and it breaks out smaller, faster and with a minion. Beating a boss gives an extra life |

**Ice erosion.** Enemies chew through ice. Every bounce hits a disc of cells around the impact point: cells in the core lose 2 HP, cells on the rim lose 1 (big enemies and the boss hit wider). Your ice has 2 HP; level obstacles have 3. Only cells facing open field can break, and a break can crumble its neighbours in a short chain. Broken cells melt back into open field, so the frozen percentage drops if you are slow. Your ice **sets hard 12 seconds after it freezes** (a glint runs over it): from then on enemies can't break it. Level obstacles never set, and only the outer wall is permanent.

**Balance.** Enemy count grows slowly through the journey (at most six enemies plus sparx), small arenas get one enemy less, and speed rises 3.5% per level. A simple bot that only makes safe straight or L-shaped cuts cleared all nine journey levels at the 90% goal in two of three runs (`ice setting` and the gentler enemy curve made the difference; without them it stalled from level 4).

**Power-ups** drop onto the field as a spinning crystal with an icon, orbiting sparks and a landing ring; they blink before they expire. Touch one, or freeze the area it's in, to collect it:
- Slow time: enemies and sparx at 45% speed for 7 s
- Haste: +45% hero speed for 7 s
- Shield: absorbs one hit
- +1 life: at most once per level

**Scoring**
- Area points grow faster for big cuts.
- Kills are multiplied by the number of enemies caught in one cut and by the streak multiplier (×2…×5 for consecutive cuts that kill).
- Clearing a level pays a level bonus, a time bonus against par, a bonus for freezing past the goal, and a bonus for losing no lives.
- Stars: 1 for clearing, 2 for losing no lives, 3 for losing no lives and beating par. The journey total (out of 27) is kept as your best on the title screen.

**Level layouts** rotate through open fields, pillars, crosses, combs, islands and a broken ring.

## Code

| File | Role |
|---|---|
| `js/core.js` | Game rules: grid, hero, enemies, sparx, power-ups, capture, scoring |
| `js/levels.js` | Level specs (enemy mix, goal, par time, journey length), arena shapes and obstacle layouts |
| `js/themegen.js` | Seeded world generator for the nine families (palettes, names, music key) |
| `js/themes.js` | The nine hand-tuned worlds |
| `js/render.js` | Three.js renderer: instanced ice columns, enemies, sparx, power-ups, particles, shards, post FX, level transitions, adaptive resolution |
| `js/shaders.js` | GLSL for ice, trail, floors, enemy orbs, particles and the final pass |
| `js/audio.js` | Procedural Web Audio: effects and ambient bed per world |
| `js/music.js` | Procedural background music: one generated song per world |
| `js/net.js` | Leaderboard through `/api/leaderboard` and `/api/score`, with a local fallback |
| `js/main.js` | Boot, input, HUD, screens, level flow |
