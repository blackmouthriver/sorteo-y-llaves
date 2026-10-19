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
