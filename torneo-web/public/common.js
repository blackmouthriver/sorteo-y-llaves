// Utilidades compartidas por las tres pantallas.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let STATE = null, clockOffset = 0;
const now = () => Date.now() + clockOffset;

function connect(onState) {
  const es = new EventSource('/api/stream');
  es.onmessage = e => { const d = JSON.parse(e.data); clockOffset = d.now - Date.now(); STATE = d; onState(d); };
  setInterval(() => fetch('/api/ping').catch(() => {}), 240000); // mantiene despierto el servidor gratuito
}
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(j.error || 'No se pudo completar la acción.'); err.status = r.status; throw err; }
  return j;
}
const player = id => (STATE.players.find(p => p.id === id)) || null;
function avatar(p, cls) {
  return p ? '<span class="av ' + (cls || '') + '" style="background:' + p.avatar.color + '">' + p.avatar.emoji + '</span>'
           : '<span class="av ghost ' + (cls || '') + '">?</span>';
}
function roundName(r, total) {
  const left = total - r;
  return { 1: 'Final', 2: 'Semifinal', 3: 'Cuartos de final', 4: 'Octavos de final' }[left] || 'Ronda de ' + Math.pow(2, left);
}
function remaining(t) { return !t ? null : t.running ? Math.max(0, t.endsAt - now()) : t.remaining; }
function fmt(ms) { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function podium(s) {
  if (!s.rounds) return {};
  const T = s.rounds.length, f = s.rounds[T - 1][0], out = {};
  if (f.winner) { out.first = f[f.winner]; out.second = f[f.winner === 'a' ? 'b' : 'a']; }
  const t = s.third;
  if (t && t.a && t.b) { if (t.winner) { out.third = t[t.winner]; out.fourth = t[t.winner === 'a' ? 'b' : 'a']; } }
  else if (t) out.third = t.a || t.b;
  return out;
}
function stageLeft(s) { return s && s.stage && s.stage.endsAt ? Math.max(0, s.stage.endsAt - now()) : null; }
const STAGE_NAME = { prep: 'Preparando', ref: 'Referencia', upload: 'Carga de imágenes', results: 'Resultados' };
function refKey(s, key) { return key === 't' ? s.rounds.length - 1 : +key; }

// Reduce la imagen y la convierte a JPEG antes de subirla
function toJpeg(file) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = .88, d = c.toDataURL('image/jpeg', q);
      while (d.length > 3.5e6 && q > .4) { q -= .15; d = c.toDataURL('image/jpeg', q); }
      ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('No se pudo abrir esa imagen. Prueba con un JPG o PNG.')); };
    img.src = url;
  });
}
