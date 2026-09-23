// Leaderboard: uses the existing server API (/api/leaderboard, /api/score) when it is reachable,
// otherwise keeps a local top list in this browser.
const BASE = '/api';
const LOCAL_KEY = 'perimeter.v2.board';

function localList() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; }
}
function saveLocal(name, score) {
  const list = localList();
  const i = list.findIndex(r => r.name === name);
  if (i >= 0) { if (score > list[i].score) list[i] = { name, score, date: new Date().toISOString() }; }
  else list.push({ name, score, date: new Date().toISOString() });
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, 20);
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  return list;
}

async function withTimeout(p, ms = 3500) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function fetchBoard() {
  try {
    const r = await withTimeout(fetch(`${BASE}/leaderboard`, { headers: { Accept: 'application/json' } }));
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j.list)) throw new Error('bad shape');
    return { list: j.list, online: true };
  } catch (e) {
    return { list: localList(), online: false };
  }
}

export async function submitScore(name, score) {
  try {
    const r = await withTimeout(fetch(`${BASE}/score`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, score: Math.round(score) }),
    }));
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    saveLocal(name, score);
    return { list: Array.isArray(j.list) ? j.list : [], online: true };
  } catch (e) {
    return { list: saveLocal(name, score), online: false };
  }
}
