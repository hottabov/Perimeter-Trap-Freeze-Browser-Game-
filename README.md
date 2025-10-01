
# Perimeter — Trap & Freeze (Browser Game)

A fast-paced line‑drawing arcade inspired by Qix/JezzBall: carve off the playfield, trap enemies in the smallest region you slice, and clear levels. Includes lives, scoring, bosses, bonuses, mobile controls, music, and a persistent leaderboard (server‑side JSON).

Example: [leonov.pp.ua](https://leonov.pp.ua)

---

## Table of Contents
- [Gameplay](#gameplay)
- [Controls](#controls)
- [Lives](#lives)
- [Scoring](#scoring)
- [Bonuses](#bonuses)
- [Audio](#audio)
- [Leaderboard & Persistence](#leaderboard--persistence)
- [Project Structure](#project-structure)
- [Client Configuration Knobs](#client-configuration-knobs)
- [Server API](#server-api)
- [Local Development](#local-development)
- [Production Deployment (YOUR_DOMAIN.COM)](#production-deployment-leonovppua)
- [Nginx](#nginx)
- [PM2](#pm2)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Gameplay

- The hero moves along the **perimeter** and can **venture into the field** leaving a **live tail**.
- When the hero **reconnects to the perimeter**, the field is split into connected components. The **smallest ACTIVE** component becomes **frozen (solid)**. Enemies inside frozen areas **vanish**.
- Enemies move in straight lines and **bounce** off frozen walls/perimeter.
- **Lose condition**: an enemy touches the hero or the hero’s **live tail**, or the hero **bites own tail** (crosses the already existing part of their live tail).
- **Win condition**: all enemies are removed. Every 3rd level includes a **boss** (bigger, faster). Enemy count **increases every second level** (easier difficulty ramp).

## Controls

**Desktop**
- **Arrows / WASD** — movement
- **R** — restart when the game over/restart overlay is shown
- **Space** — ignored (prevents page scroll)

**Mobile / Tablet**
- **Swipe** up / down / left / right anywhere on the board to change direction

## Lives

- The hero starts with **3 lives** per run.
- You **lose a life** if an enemy touches the hero or the hero’s **live tail**, or when you **bite your own tail**.
- Lives persist **across levels** within a run and reset on **full restart**.

> UI: lives are displayed in the right‑hand info panel (near level/score).

## Scoring

- **+100 points** per **1%** of newly frozen field
- **+1000 points** per **regular enemy** removed
- **+5000 points** per **boss** removed
- Score persists across levels in a run. It is shown in the overlay on level complete and game over.

## Bonuses

Bonuses spawn **every 5–15s** and stay on the field **20–30s** (they **blink** to stand out from enemies). If the hero collects the bonus:

- **Green**: hero speed **+50%** for **N seconds** (default 5s). Background tint changes to a **deep green radial** while active.
- **Orange**: all enemy speeds **−50%** for **N seconds** (default 5s). Background tint changes to a **deep orange radial** while active.
- While any bonus is active, background music switches to `audio/bonus.mp3` (then returns to the level track).

You can adjust duration and cadence; see **Client Configuration Knobs** below.

## Audio

- Level music cycles across `audio/1.mp3 ... 6.mp3` (looping when a level takes long).
- Enemy destroyed SFX and level complete SFX in `sfx/`.
- When a bonus is active, the music temporarily switches to `audio/bonus.mp3`.

## Leaderboard & Persistence

The game supports a **server‑side leaderboard** that stores scores into a JSON file on disk.

- On first run, a popup asks for **player name** (stored in a cookie).
- After **game over**, the score is sent to the server; the server **creates/updates** `server/scores.json` and returns **Top‑20**.
- If the server is unreachable, the client falls back to **local persisted storage** (OPFS/localStorage).

**Server endpoints** (see below):  
`GET /api/leaderboard`, `POST /api/score`

---

## Project Structure

```
index.html
main.js
styles.css
package.json
audio/             # 1.mp3..6.mp3 (+ bonus.mp3 if used)
sfx/               # enemy.mp3, complete.mp3
src/
  game.js          # game loop, levels, scoring, bonuses, collisions, rendering
  actors.js        # hero + enemy classes, motion, collisions
  grid.js          # field state (ACTIVE/SOLID/TRAIL), components, flood fill
  audio.js         # music playlist, SFX, bonus music
server/
  server.js        # minimal Node HTTP API, writes scores.json
  scores.json      # auto-created/updated Top-N storage (array)
```

---

## Client Configuration Knobs

Open `src/game.js` and look for these constants (names may vary slightly across revisions):

```js
// Level composition
const BOSS_EVERY = 3;                  // boss spawns every 3rd level
const ENEMY_BASE = 2;                  // base number of enemies at level 1
const ENEMY_ADD_EVERY = 2;             // add +1 enemy every second level

// Speeds (px/s nominal, scaled per level)
const ENEMY_BASE_SPEED = 95;           // base enemy speed
const ENEMY_SPEED_LEVEL_STEP = 14;     // extra per level
const BOSS_SPEED_BONUS = 1.2;          // boss speed multiplier (a bit faster)
const HERO_SPEED = 160;                // nominal hero speed

// Bonuses
const BONUS_MIN_INTERVAL_MS = 5000;    // 5s
const BONUS_MAX_INTERVAL_MS = 15000;   // 15s
const BONUS_MIN_LIFETIME_MS = 20000;   // 20s (on field)
const BONUS_MAX_LIFETIME_MS = 30000;   // 30s (on field)
const BONUS_EFFECT_MS = 5000;          // 5s effect duration (increase to last longer)
const BONUS_HERO_SPEED_MULT = 1.5;     // +50% hero
const BONUS_ENEMY_SPEED_MULT = 0.5;    // -50% enemies (while active)
```

> **Want longer bonus effects?** Increase `BONUS_EFFECT_MS` (e.g. 8000 = 8 seconds).  
> To tweak enemy growth pace: change `ENEMY_ADD_EVERY` or the function that computes `enemiesCount` (usually `const enemies = ENEMY_BASE + Math.floor((level - 1) / ENEMY_ADD_EVERY)`).
> Boss is already “a bit faster” via `BOSS_SPEED_BONUS` and bigger in size (see `Enemy` constructor in `src/actors.js`, `isBoss: true`).

---

## Server API

`server/server.js` is a dependency‑free Node HTTP server that writes to `server/scores.json` atomically.

- **GET `/api/leaderboard`** → `{ list: [{ name, score, date }, ...] }` (sorted, Top‑20)
- **POST `/api/score`** → body `{ "name": "Vadym", "score": 12345 }`  
  Upserts the player’s best score and returns updated Top‑20.
- **OPTIONS** is handled for CORS preflight.  
- **PORT** can be set via env (`PORT=3000`), defaults to `3000`.

Data file: `server/scores.json` (auto‑created as `[]` on first run).

---

## Local Development

> Use a local static server to avoid CORS issues when opening `index.html` from `file://`.

### Option A: run only the Node API and serve static via Nginx (production‑like)
- Start API:
  ```bash
  cd server
  node server.js
  # or: pm2 start server.js --name leaderboard-api
  ```
- Open the site via your web server (Nginx) at https://YOUR_DOMAIN.COM (or localhost vhost).

### Option B: quick static server
```bash
npm i -g http-server
http-server -p 8080 .
# In another terminal:
cd server && node server.js
# Open http://localhost:8080 (client will call /api via Nginx or directly if configured)
```

Ensure in `main.js` the remote base is **`/api`** (same origin).

---

## Production Deployment (YOUR_DOMAIN.COM)

**Paths**
- Web root: `/var/www/YOUR_DOMAIN.COM/htdocs`
- API: `/var/www/YOUR_DOMAIN.COM/htdocs/server/server.js`
- Data file: `/var/www/YOUR_DOMAIN.COM/htdocs/server/scores.json`

**Start API with PM2**
```bash
npm i -g pm2
cd /var/www/YOUR_DOMAIN.COM/htdocs/server
pm2 start server.js --name leaderboard-api
pm2 save
pm2 startup systemd   # then run the printed systemctl command
pm2 logs leaderboard-api --lines 100
```

**Permissions**
```bash
chown -R <deploy_user>:<deploy_user> /var/www/YOUR_DOMAIN.COM/htdocs/server
chmod 664 /var/www/YOUR_DOMAIN.COM/htdocs/server/scores.json  # created automatically
```

---

## Nginx

**HTTPS server block** (static from `htdocs`, `/api/` → Node on 127.0.0.1:3000). Note the **no trailing slash** in `proxy_pass` to keep `/api` prefix intact.

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name YOUR_DOMAIN.COM www.YOUR_DOMAIN.COM;

    root /var/www/YOUR_DOMAIN.COM/htdocs;
    index index.html index.htm;

    # SSL paths provided by certbot
    ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN.COM/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN.COM/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on; gzip_vary on; gzip_comp_level 5;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript audio/mpeg;

    # SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static
    location ~* \.(?:js|css|png|jpg|jpeg|gif|ico|svg|webp|mp3|wav|ogg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # API → Node
    location /api/ {
        proxy_pass http://127.0.0.1:3000;  # <— NO trailing slash
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        add_header Access-Control-Allow-Methods "GET,POST,OPTIONS" always;
    }

    access_log /var/log/nginx/YOUR_DOMAIN.COM.access.log;
    error_log  /var/log/nginx/YOUR_DOMAIN.COM.error.log;
}
```

Test and reload:
```bash
nginx -t && systemctl reload nginx
```

---

## PM2

Common commands:
```bash
pm2 status
pm2 logs leaderboard-api --lines 100
pm2 restart leaderboard-api
pm2 stop leaderboard-api
pm2 save
pm2 unstartup systemd   # remove boot integration
```

---

## Troubleshooting

- **Scores not saving**: check `proxy_pass` (no trailing slash), PM2 logs, file permissions on `server/scores.json`.
- **`ERR_TUNNEL_CONNECTION_FAILED`**: access the site via **HTTPS**; ensure 443 is open and the HTTPS server block is active.
- **Audio not playing**: verify paths, MIME types, and 200 responses (Network tab).
- **No bonus music**: ensure `audio/bonus.mp3` exists and is referenced in `src/audio.js`.
- **Mobile controls sluggish**: confirm passive listeners and that page scroll is disabled for the game area.
- **Performance**: avoid heavy canvas gradients; keep DPR capped at 2; prefer integer cell sizes.

---

## License

MIT.

---

### Maintainer Notes

- Keep API compatible: `/api/leaderboard` and `/api/score` request/response shapes.
- Any change to scoring or lives: update this README and on‑screen legend.
- Consider rate‑limiting and name validation on the server if exposing to the public internet.
