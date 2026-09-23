# Perimeter — visual prototypes

A playable 2.5D prototype used to pick the visual direction for Perimeter v2.
The gameplay is still a 2D grid; rendering is Three.js (WebGL) with bloom and custom shaders.

Three styles, switchable live with keys **1 / 2 / 3** or the buttons in the corner:

| Key | Style | Idea |
|---|---|---|
| 1 | **Fire & Ice** | Night lake, ice columns that rise from the water, fire enemies that go out in steam |
| 2 | **Neon Glacier** | Synthwave grid, glass ice tiles with neon edges, plasma orbs with rings |
| 3 | **Cryo Void** | Deep space, holographic crystal lattice, bioluminescent enemies |

Open `index.html#fire`, `#neon` or `#cryo` to start in a specific style.

## Run locally

Any static server works (ES modules need http, not `file://`):

```bash
npx http-server -p 8080 .
# open http://localhost:8080/prototypes/visual/
```

Three.js loads from jsDelivr through the import map in `index.html`.

## Files

- `js/core.js` — game logic (grid, hero, enemies, capture, freeze wave timing). No rendering.
- `js/render.js` — Three.js renderer: instanced ice columns, trail, particles, shards, post FX, camera.
- `js/shaders.js` — GLSL for ice, trail, floors, enemy orbs, particles and the final post pass.
- `js/themes.js` — all three styles as data (colors, heights, bloom, audio settings).
- `js/audio.js` — procedural Web Audio sound effects and ambient bed per style.
- `js/main.js` — boot, input (keyboard + swipe), HUD, screens.

## Gameplay changes compared with the original

- Losing a life no longer wipes the captured field: the trail disappears and the hero returns to where the cut started.
- When a cut splits the field into more than two regions, every region except the largest one freezes.
- Perimeter walking uses 8-neighbour adjacency, so the hero can follow concave corners.
- Enemies collide using their radius, and there are points for killing several enemies with one cut.
