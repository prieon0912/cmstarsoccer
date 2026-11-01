// Serves the game and relays 1v1 matches: the server only pairs two players
// (quick match or a 4-digit room code) and forwards messages between them.
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const auth = require('./lib/auth');
const admin = require('./lib/admin');
const shop = require('./lib/shop');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');

// Render sits behind a proxy; this makes req.ip the player's address (used by the login rate limit)
app.set('trust proxy', 1);
app.get('/healthz', (req, res) => res.send('ok'));
app.use('/api/admin', admin.router);
app.use('/api/shop', shop.router);
app.use('/api', auth.router);
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

const rooms = new Map(); // code -> waiting host socket
let waiting = null; // quick-match socket waiting for an opponent

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function unlist(ws) {
  if (waiting === ws) waiting = null;
  if (ws.code) { rooms.delete(ws.code); ws.code = null; }
}

function pair(host, guest) {
  unlist(host); unlist(guest);
  host.peer = guest; guest.peer = host;
  send(host, { t: 'paired', role: 'host' });
  send(guest, { t: 'paired', role: 'guest' });
}

function newCode() {
  let code;
  do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    // once paired, everything is forwarded to the other player untouched
    if (ws.peer) {
      if (ws.peer.readyState === 1) ws.peer.send(data, { binary: isBinary });
      return;
    }
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.t === 'quick') {
      unlist(ws);
      if (waiting && waiting !== ws && waiting.readyState === 1) pair(waiting, ws);
      else { waiting = ws; send(ws, { t: 'wait' }); }
    } else if (msg.t === 'create') {
      unlist(ws);
      ws.code = newCode();
      rooms.set(ws.code, ws);
      send(ws, { t: 'wait', code: ws.code });
    } else if (msg.t === 'join') {
      const host = rooms.get(String(msg.code));
      if (!host || host === ws || host.readyState !== 1) { send(ws, { t: 'error', msg: '그 코드의 방을 찾을 수 없어요.' }); return; }
      pair(host, ws);
    }
  });

  ws.on('close', () => {
    unlist(ws);
    if (ws.peer) { send(ws.peer, { t: 'peerleft' }); ws.peer.peer = null; ws.peer = null; }
  });
});

// drop dead connections so rooms and the quick-match slot don't go stale
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

auth.init()
  .then((kind) => {
    if (kind === 'memory') console.warn('DATABASE_URL is not set: accounts are kept in memory and vanish on restart.');
    server.listen(PORT, () => console.log(`Floodlight Eleven on :${PORT} (accounts: ${kind})`));
  })
  .catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });

module.exports = server;
