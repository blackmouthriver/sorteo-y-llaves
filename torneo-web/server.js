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

const fresh = () => ({ phase: 'registro', regOpen: true, players: [], cupos: null, duration: 180, refDuration: 60, rounds: null,
  third: null, activeRound: -1, stage: null, drawAt: 0, event: null, phaseEvent: null, undo: null, images: {}, refs: {}, seq: 0 });

let S = fresh();
try { S = Object.assign(fresh(), JSON.parse(fs.readFileSync(DATA, 'utf8'))); } catch (e) { /* primer arranque */ }

// ------------------------------------------------------------ tiempo real (SSE)
const clients = new Set();
let saveTimer = null;
function snapshot() {
  const { undo, players, refs, ...pub } = S;
  const shown = {};
  for (const [r, ref] of Object.entries(refs || {})) if (revealed(+r, true)) shown[r] = ref;
  return JSON.stringify({ ...pub, refs: shown, players: players.map(({ token, ...p }) => p), hasUndo: !!undo, now: Date.now() });
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
const isFinal = r => S.rounds && r === S.rounds.length - 1;

// ------------------------------------------------------------ etapas de cada fase
// prep -> ref (todos ven la referencia) -> upload (suben su imagen) -> results (se muestran y se decide)
function setStage(name, secs) {
  S.stage = { name, endsAt: secs ? Date.now() + secs * 1000 : 0 };
  if (name === 'results') autoResolve();
}
// Al cerrar la carga: quien no subió imagen pierde automáticamente.
function autoResolve() {
  const r = S.activeRound, list = S.rounds[r].map((mt, m) => ({ mt, m, key: String(r) }));
  if (isFinal(r) && thirdPlayable()) list.push({ mt: S.third, third: true, key: 't' });
  let snap = null;
  for (const it of list) {
    const mt = it.mt;
    if (mt.winner || mt.bye || !mt.a || !mt.b) continue;
    const ha = hasImg(mt.a, it.key), hb = hasImg(mt.b, it.key);
    if (ha === hb) { mt.noImg = !ha; continue; } // ambos o ninguno: decide el administrador
    if (!snap) snap = undoSnap();
    decide(r, it.m, !!it.third, ha ? 'a' : 'b', true);
  }
  if (snap) { S.undo = snap; S.event = { id: S.seq + 1, type: 'auto' }; }
}
setInterval(() => {
  if (S.phase === 'torneo' && S.stage && S.stage.endsAt && Date.now() >= S.stage.endsAt) {
    if (S.stage.name === 'ref') setStage('upload', S.duration);
    else if (S.stage.name === 'upload') setStage('results');
    push();
  }
}, 500);

const hasImg = (id, key) => !!(S.images[id] && S.images[id][key]);
const undoSnap = () => JSON.stringify({ rounds: S.rounds, third: S.third, phase: S.phase });

function decide(r, m, isThird, key, auto) {
  const T = S.rounds.length, mt = isThird ? S.third : S.rounds[r][m];
  mt.winner = key; if (auto) mt.auto = true;
  const w = mt[key], l = mt[key === 'a' ? 'b' : 'a'];
  let type = 'third';
  if (!isThird) {
    const slot = m % 2 ? 'b' : 'a';
    type = r === T - 1 ? 'champion' : 'win';
    if (r + 1 < T) S.rounds[r + 1][m >> 1][slot] = w;
    if (r === T - 2) { S.third = S.third || { a: null, b: null, winner: null, third: true }; S.third[slot] = l; }
  }
  if (!auto) S.event = { id: S.seq + 1, type, winner: w, loser: l, r };
  if (S.rounds[T - 1][0].winner && (!thirdPlayable() || S.third.winner)) S.phase = 'fin';
}

const ACTIONS = {
  login() {},
  config(b) {
    for (const [f, label] of [['duration', 'subir la imagen'], ['refDuration', 'ver la referencia']]) {
      if (b[f] === undefined) continue;
      const d = Math.round(Number(b[f]));
      if (!(d >= 5 && d <= 3600)) fail('El tiempo para ' + label + ' debe estar entre 5 y 3600 segundos.');
      S[f] = d;
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
      activeRound: -1, stage: null, event: null, phaseEvent: null, undo: null });
  },
  // Referencia de una ronda: texto y/o imagen que todos deben seguir
  setRef(b) {
    if (!S.rounds) fail('Haz el sorteo primero; así se conocen las rondas.');
    const r = parseInt(b.r, 10);
    if (!(r >= 0 && r < S.rounds.length)) fail('Ronda no válida.');
    if (r < S.activeRound || (r === S.activeRound && S.stage && S.stage.name !== 'prep')) fail('Esa ronda ya mostró su referencia.');
    const ref = Object.assign({ text: '', img: 0 }, S.refs[r]);
    if (b.text !== undefined) ref.text = String(b.text).slice(0, 2000);
    if (b.removeImg) { ref.img = 0; try { fs.unlinkSync(path.join(IMG, 'ref_' + r + '.jpg')); } catch (e) {} }
    if (b.image) { fs.writeFileSync(path.join(IMG, 'ref_' + r + '.jpg'), jpeg(b.image)); ref.img = Date.now(); }
    S.refs[r] = ref;
  },
  startPhase() {
    if (!S.rounds) fail('Primero haz el sorteo.');
    const r = S.activeRound + 1;
    if (r >= S.rounds.length) fail('Ya se inició la final.');
    if (r > 0 && S.rounds[r - 1].some(m => !m.winner)) fail('Aún faltan enfrentamientos por definir en la fase actual.');
    S.activeRound = r; S.phase = 'torneo'; setStage('prep');
    S.phaseEvent = { id: S.seq + 1, r };
  },
  stage(b) {
    if (S.phase !== 'torneo' || !S.stage) fail('Inicia la fase primero.');
    const st = S.stage.name;
    if (b.cmd === 'ref' && st === 'prep') {
      const ref = S.refs[S.activeRound];
      if (!ref || (!ref.text && !ref.img)) fail('Primero guarda la referencia (texto o imagen) de esta ronda.');
      setStage('ref', S.refDuration);
    } else if (b.cmd === 'upload' && (st === 'prep' || st === 'ref')) setStage('upload', S.duration);
    else if (b.cmd === 'results' && st === 'upload') setStage('results');
    else if (b.cmd === 'add30' && S.stage.endsAt) S.stage.endsAt += 30000;
    else fail('Esa acción no aplica en esta etapa.');
  },
  setWinner(b) {
    if (S.phase !== 'torneo' || !S.stage || S.stage.name !== 'results') fail('Primero cierra la carga de imágenes para ver los resultados.');
    const T = S.rounds.length, r = S.activeRound, isThird = !!b.third, m = parseInt(b.m, 10);
    if (isThird && (r !== T - 1 || !thirdPlayable())) fail('El duelo por el tercer puesto se juega en la fase final.');
    const mt = isThird ? S.third : S.rounds[r][m];
    if (!mt || !mt.a || !mt.b || mt.winner) fail('Ese enfrentamiento no se puede definir ahora.');
    S.undo = undoSnap();
    decide(r, m, isThird, b.side === 'b' ? 'b' : 'a', false);
  },
  undo() {
    if (!S.undo) fail('No hay un resultado para deshacer.');
    Object.assign(S, JSON.parse(S.undo), { undo: null, event: null });
  },
  resetTournament() {
    clearImages();
    Object.assign(S, { phase: 'registro', regOpen: true, rounds: null, third: null, activeRound: -1, stage: null,
      drawAt: 0, event: null, phaseEvent: null, undo: null });
  },
  wipe() { clearImages(); const seq = S.seq; S = fresh(); S.seq = seq; },
  // Recupera el torneo desde la copia que guarda el navegador del administrador (por si el servidor se reinicia).
  restore(b) {
    const d = b.state;
    if (!d || !Array.isArray(d.players) || d.players.length > MAX_PLAYERS) fail('Copia de respaldo inválida.');
    const base = fresh();
    for (const k of Object.keys(base)) if (k !== 'undo' && k !== 'seq' && d[k] !== undefined) base[k] = d[k];
    base.seq = S.seq; base.event = null; base.phaseEvent = null;
    const imgs = {};
    for (const [pid, keys] of Object.entries(base.images || {}))
      for (const [k, v] of Object.entries(keys || {}))
        if (/^[a-f0-9]{12}$/.test(pid) && /^(\d+|t)$/.test(k) && fs.existsSync(path.join(IMG, pid + '_' + k + '.jpg'))) (imgs[pid] = imgs[pid] || {})[k] = v;
    base.images = imgs;
    const refs = {};
    for (const [r, ref] of Object.entries(S.refs || {})) refs[r] = ref; // la copia del navegador no trae referencias ocultas
    base.refs = refs;
    S = base;
    if (S.phase === 'torneo' && (!S.stage || S.stage.endsAt)) setStage(S.stage && S.stage.name === 'results' ? 'results' : 'prep');
  },
  getRefs() { return { refs: S.refs }; },
};

// ------------------------------------------------------------ imágenes
function clearImages() {
  S.images = {}; S.refs = {};
  try { for (const f of fs.readdirSync(IMG)) fs.unlinkSync(path.join(IMG, f)); } catch (e) {}
}
function jpeg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) fail('Formato de imagen no válido.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_IMG || buf[0] !== 0xff || buf[1] !== 0xd8) fail('La imagen no es válida o pesa demasiado.');
  return buf;
}
// Duelo del concursante en la fase activa: "0", "1"... o "t" para tercer puesto
function activeKey(id) {
  if (!S.rounds || S.activeRound < 0) return null;
  const r = S.activeRound;
  for (const mt of S.rounds[r]) if ((mt.a === id || mt.b === id) && !mt.winner && !mt.bye) return String(r);
  if (isFinal(r) && S.third && !S.third.winner && (S.third.a === id || S.third.b === id)) return 't';
  return null;
}
function uploadImage(b) {
  const p = S.players.find(x => x.id === b.id);
  if (!p || !p.token || typeof b.token !== 'string' || b.token !== p.token) fail('No encontramos tu inscripción en este dispositivo.');
  if (S.phase !== 'torneo' || !S.stage || S.stage.name !== 'upload') fail('La carga de imágenes no está abierta en este momento.');
  const key = activeKey(p.id);
  if (key === null) fail('No tienes un duelo en esta fase.');
  fs.writeFileSync(path.join(IMG, p.id + '_' + key + '.jpg'), jpeg(b.image));
  S.images[p.id] = Object.assign({}, S.images[p.id], { [key]: Date.now() });
  return key;
}
// ¿Ya se puede mostrar el contenido de la ronda r a todos?
function revealed(r, forRef) {
  if (S.phase === 'fin') return true;
  if (r < S.activeRound) return true;
  if (r > S.activeRound || !S.stage) return false;
  return S.stage.name === 'results' || (forRef && S.stage.name === 'ref');
}
const keyRound = k => k === 't' ? (S.rounds ? S.rounds.length - 1 : 99) : +k;

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
      const name = url.slice(5), q = new URLSearchParams(req.url.split('?')[1] || '');
      const mp = /^([a-f0-9]{12})_(\d+|t)\.jpg$/.exec(name), mr = /^ref_(\d+)\.jpg$/.exec(name);
      if (!mp && !mr) return json(res, 404, { error: 'No encontrado' });
      const owner = mp && S.players.find(p => p.id === mp[1]);
      const ok = sameKey(q.get('key')) || (mr ? revealed(+mr[1], true) : (revealed(keyRound(mp[2])) || (owner && owner.token && q.get('tk') === owner.token)));
      if (!ok) { res.writeHead(403); return res.end(); }
      return fs.readFile(path.join(IMG, name), (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
        res.end(buf);
      });
    }
    if (req.method === 'POST' && url === '/api/admin') {
      const b = await readBody(req, MAX_IMG * 1.4);
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
