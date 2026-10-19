// Torneo de Prompts TEINCO 2026 - servidor en tiempo real (sin dependencias externas).
// Ejecutar:  node server.js      Clave de administrador: variable ADMIN_KEY (por defecto "admin123")
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const DATA = path.join(__dirname, 'data.json');
const PUB = path.join(__dirname, 'public');
const IMG = path.join(__dirname, 'img-data'); // imágenes que suben los concursantes
const MAX_IMG = 3 * 1024 * 1024;
try { fs.mkdirSync(IMG, { recursive: true }); } catch (e) {}
const MAX_PLAYERS = 1000; // tope de seguridad; el torneo se arma con todos los inscritos

const EMOJI = ['🦊','🐼','🦁','🐯','🐸','🐵','🦄','🐙','🦉','🐨','🐰','🐻','🐶','🐱','🦖','🐢','🦋','🐝','🦀','🐬','🦈','🐳','🦩','🦜','🐧','🦅','🐺','🦝','🐮','🐷','🐹','🐔','🦆','🦚','🦔','🦦','🦥','🐘','🦒','🦓','🐊','🐍','🦎','🐞','🦂','🐲','👾','🤖','👽','🚀','⚡','🔥','🌟','🍀','🌵','🍄','🎸','🎯','🎲','🏀','⚽','🥑','🍉','🌶️'];
const COLORS = ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#38d9a9','#4dabf7','#748ffc','#b197fc','#f783ac','#63e6be','#a9e34b','#ff8787'];

const fresh = () => ({ phase: 'registro', regOpen: true, players: [], cupos: null, duration: 60, rounds: null,
  third: null, activeRound: -1, current: null, timer: null, drawAt: 0, event: null, phaseEvent: null, undo: null, images: {}, seq: 0 });

let S = fresh();
try { S = Object.assign(fresh(), JSON.parse(fs.readFileSync(DATA, 'utf8'))); } catch (e) { /* primer arranque */ }

// ------------------------------------------------------------ tiempo real (SSE)
const clients = new Set();
let saveTimer = null;
function snapshot() {
  const { undo, players, ...pub } = S;
  return JSON.stringify({ ...pub, players: players.map(({ token, ...p }) => p), hasUndo: !!undo, now: Date.now() });
}
function push() {
  S.seq++;
  const msg = 'data: ' + snapshot() + '\n\n';
  for (const res of clients) res.write(msg);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA, JSON.stringify(S), () => {}), 300);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ------------------------------------------------------------ reglas del torneo
const fail = msg => { throw new Error(msg); };

function addPlayer(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (name.length < 2) fail('Escribe tu nombre (mínimo 2 letras).');
  if (S.players.length >= MAX_PLAYERS) fail('Ya no hay más cupos de registro.');
  if (S.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('Ese nombre ya está inscrito. Agrega tu apellido.');
  // Avatar único: primero figuras sin usar; si se agotan, combinaciones figura + color sin usar.
  const usedE = new Set(S.players.map(p => p.avatar.emoji)), usedP = new Set(S.players.map(p => p.avatar.emoji + p.avatar.color));
  let combos = EMOJI.filter(e => !usedE.has(e)).flatMap(e => COLORS.map(c => [e, c]));
  if (!combos.length) combos = EMOJI.flatMap(e => COLORS.map(c => [e, c])).filter(([e, c]) => !usedP.has(e + c));
  if (!combos.length) combos = EMOJI.flatMap(e => COLORS.map(c => [e, c]));
  const [emoji, color] = combos[crypto.randomInt(combos.length)];
  const player = { id: crypto.randomBytes(6).toString('hex'), token: crypto.randomBytes(16).toString('hex'), name, avatar: { emoji, color } };
  S.players.push(player);
  return player;
}

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function build(ids) {
  let size = 2;
  while (size < ids.length) size *= 2;
  const byes = size - ids.length, m0 = size / 2, pool = shuffle(ids);
  let first = [], i = 0;
  for (let m = 0; m < m0; m++) {
    first.push(m < byes ? { a: pool[i++], b: null, bye: true, winner: 'a' } : { a: pool[i++], b: pool[i++], bye: false, winner: null });
  }
  first = shuffle(first);
  const rounds = [first];
  for (let c = m0 / 2; c >= 1; c /= 2) rounds.push(Array.from({ length: c }, () => ({ a: null, b: null, bye: false, winner: null })));
  if (rounds.length > 1) first.forEach((mt, m) => { if (mt.bye) rounds[1][m >> 1][m % 2 ? 'b' : 'a'] = mt.a; });
  return rounds;
}

const thirdPlayable = () => !!(S.third && S.third.a && S.third.b);
const freshTimer = () => ({ running: false, remaining: S.duration * 1000, endsAt: 0 });

const ACTIONS = {
  login() {},
  config(b) {
    if (b.duration !== undefined) {
      const d = Math.round(Number(b.duration));
      if (!(d >= 5 && d <= 3600)) fail('El tiempo debe estar entre 5 y 3600 segundos.');
      S.duration = d;
    }
    if (b.regOpen !== undefined) {
      if (b.regOpen && S.phase !== 'registro') fail('El registro solo se abre antes del sorteo.');
      S.regOpen = !!b.regOpen;
    }
  },
  addPlayers(b) {
    if (S.phase !== 'registro') fail('Solo se agregan participantes antes del sorteo.');
    let added = 0, skipped = 0;
    for (const n of (Array.isArray(b.names) ? b.names : []).slice(0, MAX_PLAYERS)) {
      try { addPlayer(n); added++; } catch (e) { skipped++; }
    }
    return { added, skipped };
  },
  removePlayer(b) {
    if (S.phase !== 'registro') fail('Solo se quitan participantes antes del sorteo.');
    S.players = S.players.filter(p => p.id !== b.id);
  },
  draw() {
    if (S.phase !== 'registro') fail('El sorteo ya se hizo. Reinicia el torneo para sortear de nuevo.');
    S.cupos = null;
    const ids = S.players.map(p => p.id);
    if (ids.length < 2) fail('Se necesitan al menos 2 participantes.');
    Object.assign(S, { rounds: build(ids), phase: 'sorteo', regOpen: false, drawAt: Date.now(), third: null,
      activeRound: -1, current: null, timer: null, event: null, phaseEvent: null, undo: null });
  },
  startPhase() {
    if (!S.rounds) fail('Primero haz el sorteo.');
    const r = S.activeRound + 1;
    if (r >= S.rounds.length) fail('Ya se inició la final.');
    if (r > 0 && S.rounds[r - 1].some(m => !m.winner)) fail('Aún faltan enfrentamientos por definir en la fase actual.');
    S.activeRound = r; S.phase = 'torneo'; S.current = null; S.timer = freshTimer(); // un cronómetro para toda la fase
    S.phaseEvent = { id: S.seq + 1, r };
  },
  timer(b) {
    if (S.phase !== 'torneo' || !S.timer) fail('Inicia la fase primero.');
    const t = S.timer, now = Date.now();
    if (b.cmd === 'start' && !t.running) {
      if (t.remaining <= 0) t.remaining = S.duration * 1000;
      t.endsAt = now + t.remaining; t.running = true;
    } else if (b.cmd === 'pause' && t.running) {
      t.remaining = Math.max(0, t.endsAt - now); t.running = false;
    } else if (b.cmd === 'reset') S.timer = freshTimer();
  },
  setWinner(b) {
    if (S.phase !== 'torneo') fail('Inicia la fase primero.');
    const T = S.rounds.length, r = S.activeRound, isThird = !!b.third, m = parseInt(b.m, 10);
    if (isThird && (r !== T - 1 || !thirdPlayable())) fail('El duelo por el tercer puesto se juega en la fase final.');
    const mt = isThird ? S.third : S.rounds[r][m];
    if (!mt || !mt.a || !mt.b || mt.winner) fail('Ese enfrentamiento no se puede definir ahora.');
    const key = b.side === 'b' ? 'b' : 'a';
    S.undo = JSON.stringify({ rounds: S.rounds, third: S.third, phase: S.phase });
    mt.winner = key;
    const w = mt[key], l = mt[key === 'a' ? 'b' : 'a'];
    let type = 'third';
    if (!isThird) {
      const slot = m % 2 ? 'b' : 'a';
      type = r === T - 1 ? 'champion' : 'win';
      if (r + 1 < T) S.rounds[r + 1][m >> 1][slot] = w;
      if (r === T - 2) { S.third = S.third || { a: null, b: null, winner: null, third: true }; S.third[slot] = l; }
    }
    S.event = { id: S.seq + 1, type, winner: w, loser: l, r };
    const phaseDone = S.rounds[r].every(x => x.winner) && (r !== T - 1 || !thirdPlayable() || S.third.winner);
    if (phaseDone && S.timer && S.timer.running) { S.timer.remaining = Math.max(0, S.timer.endsAt - Date.now()); S.timer.running = false; }
    if (S.rounds[T - 1][0].winner && (!thirdPlayable() || S.third.winner)) S.phase = 'fin';
  },
  undo() {
    if (!S.undo) fail('No hay un resultado para deshacer.');
    Object.assign(S, JSON.parse(S.undo), { undo: null, event: null });
    if (!S.timer) S.timer = freshTimer();
  },
  resetTournament() {
    clearImages();
    Object.assign(S, { phase: 'registro', regOpen: true, rounds: null, third: null, activeRound: -1, current: null,
      timer: null, drawAt: 0, event: null, phaseEvent: null, undo: null });
  },
  wipe() { clearImages(); const seq = S.seq; S = fresh(); S.seq = seq; },
  // Recupera el torneo desde la copia que guarda el navegador del administrador (por si el servidor se reinicia).
  restore(b) {
    const d = b.state;
    if (!d || !Array.isArray(d.players) || d.players.length > MAX_PLAYERS) fail('Copia de respaldo inválida.');
    const base = fresh();
    for (const k of Object.keys(base)) if (k !== 'undo' && k !== 'seq' && d[k] !== undefined) base[k] = d[k];
    base.seq = S.seq; base.current = null; base.timer = null; base.event = null; base.phaseEvent = null;
    const imgs = {};
    for (const [pid, keys] of Object.entries(base.images || {}))
      for (const [k, v] of Object.entries(keys || {}))
        if (/^[a-f0-9]{12}$/.test(pid) && /^(\d+|t)$/.test(k) && fs.existsSync(path.join(IMG, pid + '_' + k + '.jpg'))) (imgs[pid] = imgs[pid] || {})[k] = v;
    base.images = imgs;
    S = base;
    S.timer = S.phase === 'torneo' ? freshTimer() : null;
  },
};

// ------------------------------------------------------------ imágenes de los concursantes
function clearImages() {
  S.images = {};
  try { for (const f of fs.readdirSync(IMG)) fs.unlinkSync(path.join(IMG, f)); } catch (e) {}
}
// Duelo pendiente del concursante: clave de ronda ("0", "1"... o "t" para tercer puesto)
function pendingKey(id) {
  if (!S.rounds) return null;
  for (let r = 0; r < S.rounds.length; r++)
    for (const mt of S.rounds[r]) if ((mt.a === id || mt.b === id) && !mt.winner && !mt.bye) return String(r);
  if (S.third && !S.third.winner && (S.third.a === id || S.third.b === id)) return 't';
  return null;
}
function uploadImage(b) {
  const p = S.players.find(x => x.id === b.id);
  if (!p || !p.token || typeof b.token !== 'string' || b.token !== p.token) fail('No encontramos tu inscripción en este dispositivo.');
  const key = pendingKey(p.id);
  if (key === null) fail(S.rounds ? 'No tienes un duelo pendiente para subir imagen.' : 'Podrás subir tu imagen cuando se haga el sorteo.');
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
  if (!m) fail('Formato de imagen no válido.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_IMG || buf[0] !== 0xff || buf[1] !== 0xd8) fail('La imagen no es válida o pesa demasiado.');
  fs.writeFileSync(path.join(IMG, p.id + '_' + key + '.jpg'), buf);
  S.images[p.id] = Object.assign({}, S.images[p.id], { [key]: Date.now() });
  return key;
}

// ------------------------------------------------------------ HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PAGES = { '/': 'index.html', '/pantalla': 'pantalla.html', '/admin': 'admin.html' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((ok, bad) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > (limit || 200000)) { bad(new Error('Solicitud demasiado grande.')); req.destroy(); } });
    req.on('end', () => { try { ok(data ? JSON.parse(data) : {}); } catch (e) { bad(new Error('Solicitud inválida.')); } });
    req.on('error', bad);
  });
}
const sameKey = k => { const a = Buffer.from(String(k || '')), b = Buffer.from(ADMIN_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); };

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (req.method === 'GET' && url === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\ndata: ' + snapshot() + '\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET' && url === '/api/ping') return json(res, 200, { ok: true });
    if (req.method === 'POST' && url === '/api/register') {
      const b = await readBody(req);
      if (!S.regOpen || S.phase !== 'registro') fail('El registro está cerrado.');
      const player = addPlayer(b.name);
      push();
      return json(res, 200, { ok: true, player });
    }
    if (req.method === 'POST' && url === '/api/upload') {
      const b = await readBody(req, MAX_IMG * 1.4);
      const key = uploadImage(b);
      push();
      return json(res, 200, { ok: true, key });
    }
    if (req.method === 'GET' && url.startsWith('/img/')) {
      const name = url.slice(5);
      if (!/^[a-f0-9]{12}_(\d+|t)\.jpg$/.test(name)) return json(res, 404, { error: 'No encontrado' });
      return fs.readFile(path.join(IMG, name), (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
        res.end(buf);
      });
    }
    if (req.method === 'POST' && url === '/api/admin') {
      const b = await readBody(req);
      if (!sameKey(b.key)) return json(res, 401, { error: 'Clave de administrador incorrecta.' });
      const fn = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) && ACTIONS[b.action];
      if (!fn) fail('Acción desconocida.');
      const out = fn(b) || {};
      if (b.action !== 'login') push();
      return json(res, 200, { ok: true, ...out });
    }
    if (req.method === 'GET') {
      const file = path.normalize(path.join(PUB, PAGES[url] || url));
      if (!file.startsWith(PUB + path.sep)) return json(res, 403, { error: 'Prohibido' });
      return fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
    }
    json(res, 404, { error: 'No encontrado' });
  } catch (e) {
    json(res, 400, { error: e.message || 'Error' });
  }
}).listen(PORT, () => {
  console.log('Torneo de Prompts TEINCO 2026 en http://localhost:' + PORT);
  console.log('  Registro: /    Pantalla: /pantalla    Administrador: /admin');
  if (!process.env.ADMIN_KEY) console.log('  AVISO: usando la clave por defecto "admin123". Define ADMIN_KEY antes de publicar.');
});
