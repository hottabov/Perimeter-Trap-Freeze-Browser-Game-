const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'scores.json');
const PUBLIC_DIR = path.join(__dirname, '..'); // Parent directory contains game files

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

// Ensure scores file exists
async function ensureFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
    console.log('Created scores.json');
  }
}

function sanitizeName(name) {
  const s = String(name || '').trim().slice(0, 24);
  return s.replace(/[<>]/g, '').replace(/\s+/g, ' ');
}

async function readScores() {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error('Error reading scores:', err);
    return [];
  }
}

async function writeScoresAtomic(list) {
  const tmp = DATA_FILE + '.tmp';
  try {
    await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
    await fs.rename(tmp, DATA_FILE);
  } catch (err) {
    console.error('Error writing scores:', err);
    throw err;
  }
}

// CORS headers helper
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  setCorsHeaders(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

// Serve static files
async function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      sendText(res, 404, 'Not Found');
    } else {
      console.error('Static file error:', err);
      sendText(res, 500, 'Internal Server Error');
    }
  }
}

// API handlers
async function handleApi(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    return res.end();
  }

  // GET /api/leaderboard
  if (req.method === 'GET' && req.url.startsWith('/api/leaderboard')) {
    try {
      const list = await readScores();
      list.sort((a, b) => b.score - a.score);
      return sendJson(res, 200, { list: list.slice(0, 20) });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load leaderboard' });
    }
  }

  // POST /api/score
  if (req.method === 'POST' && req.url.startsWith('/api/score')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Prevent huge payloads
      if (body.length > 10000) {
        req.connection.destroy();
      }
    });
    
    req.on('end', async () => {
      try {
        const json = JSON.parse(body || '{}');
        const name = sanitizeName(json.name);
        const score = Number(json.score) || 0;
        
        if (!name) return sendJson(res, 400, { error: 'Name required' });
        if (score < 0 || score > 10000000) {
          return sendJson(res, 400, { error: 'Invalid score' });
        }

        const list = await readScores();
        const now = new Date().toISOString();
        const idx = list.findIndex((r) => r.name === name);
        
        if (idx >= 0) {
          // Only update if new score is higher
          if (score > (list[idx].score || 0)) {
            list[idx] = { name, score, date: now };
          }
        } else {
          list.push({ name, score, date: now });
        }
        
        list.sort((a, b) => b.score - a.score);
        if (list.length > 200) list.length = 200;
        
        await writeScoresAtomic(list);
        return sendJson(res, 200, { ok: true, list: list.slice(0, 20) });
      } catch (err) {
        console.error('Score update error:', err);
        return sendJson(res, 400, { error: 'Bad request' });
      }
    });
    return;
  }

  // GET /api/health (for monitoring)
  if (req.method === 'GET' && req.url === '/api/health') {
    return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
  }

  return sendText(res, 404, 'API endpoint not found');
}

async function start() {
  await ensureFile();
  
  const server = http.createServer((req, res) => {
    // Log requests
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    
    // Route to API or static files
    if (req.url.startsWith('/api/')) {
      return handleApi(req, res);
    } else {
      return serveStatic(req, res);
    }
  });

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
    console.log(`Serving files from: ${PUBLIC_DIR}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});