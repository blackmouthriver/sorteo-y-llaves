// Efectos de sonido (sintetizados, sin archivos) y voz narradora en español.
// El navegador solo permite sonido después de que la persona toca la página: llamar FX.unlock() desde un clic.
const FX = (() => {
  let ac = null, master = null, voices = [], voice = null;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const state = { sound: store('fx-sound') !== '0', voice: store('fx-voice') !== '0', unlocked: false };

  // ---------- síntesis
  function unlock() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (!master) { master = ac.createGain(); master.gain.value = .8; master.connect(ac.destination); }
      ac.resume();
      state.unlocked = true;
      // iOS y algunos Android exigen que la primera frase se diga dentro del clic
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    } catch (e) {}
  }
  const ok = () => state.sound && ac && ac.state === 'running';
  function tone(freq, dur, type, at, vol, glideTo) {
    if (!ok()) return;
    const t = ac.currentTime + (at || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .22, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur, at, vol, type, f1, f2) {
    if (!ok()) return;
    const t = ac.currentTime + (at || 0), n = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; f.type = type || 'bandpass'; f.frequency.setValueAtTime(f1 || 1200, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || .2, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }
  const SOUNDS = {
    click: () => tone(1400, .05, 'square', 0, .08),
    tick: () => tone(1000, .04, 'square', 0, .07),
    tickHi: () => tone(1500, .09, 'square', 0, .12),
    chime: () => { tone(880, .25, 'sine', 0, .2); tone(1320, .4, 'sine', .1, .18); },
    pop: () => { tone(520, .12, 'triangle', 0, .2, 900); tone(1040, .2, 'sine', .06, .12); },
    lock: () => { tone(660, .18, 'triangle', 0, .22); tone(990, .3, 'triangle', .07, .18); },
    blip: () => tone(1250, .1, 'sine', 0, .15),
    whoosh: () => noise(.7, 0, .25, 'bandpass', 300, 3500),
    gong: () => { [110, 220, 331, 442].forEach((f, i) => tone(f, 3.2 - i * .5, 'sine', 0, .28 / (i + 1))); noise(.4, 0, .08, 'lowpass', 900); },
    horn: () => { [262, 330, 392].forEach(f => { tone(f, .5, 'sawtooth', 0, .08); tone(f * 1.5, .9, 'sawtooth', .45, .07); }); },
    drumroll: () => { for (let i = 0; i < 22; i++) noise(.07, i * .055, .09 + i * .006, 'bandpass', 180); noise(1.4, 1.25, .22, 'highpass', 5000); tone(196, .5, 'sine', 1.22, .3, 60); },
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, 'triangle', i * .14, .22)); [523, 659, 784].forEach(f => tone(f * 2, .9, 'triangle', .62, .12)); },
    sad: () => { [392, 370, 349].forEach((f, i) => tone(f, .45, 'sawtooth', i * .45, .1)); tone(330, 1.2, 'sawtooth', 1.35, .1, 300); },
    applause: () => { for (let i = 0; i < 70; i++) noise(.06, Math.random() * 2.6, .05 + Math.random() * .08, 'bandpass', 1500 + Math.random() * 2500); },
    buzzer: () => { tone(220, .9, 'sawtooth', 0, .18); tone(165, .9, 'square', 0, .14); },
    welcome: () => { tone(784, .18, 'sine', 0, .18); tone(1175, .35, 'sine', .12, .16); },
  };
  const play = name => { try { SOUNDS[name] && SOUNDS[name](); } catch (e) {} };

  // ---------- voz
  const MALE = /(gonzalo|jorge|alvaro|álvaro|tomas|tomás|andres|andrés|gerardo|emilio|alonso|federico|mateo|raul|raúl|pablo|juan|diego|carlos|enrique|jaime|lorenzo|sergio|arnau|dario|darío|santiago|francisco|javier|rodrigo|male|hombre|masculin)/i;
  const FEMALE = /(sabina|helena|laura|paloma|dalia|elena|salome|salomé|lupita|monica|mónica|paulina|marisol|elvira|ximena|camila|female|mujer|femen|google español)/i;
  function score(v) {
    let s = 0;
    if (/natural|neural|online|premium|enhanced|mejorad/i.test(v.name)) s += 50;
    if (MALE.test(v.name)) s += 40;
    if (FEMALE.test(v.name)) s -= 60;
    if (/es-CO/i.test(v.lang)) s += 12; else if (/es-(MX|US|419)/i.test(v.lang)) s += 8; else if (/es-ES/i.test(v.lang)) s += 4;
    if (v.localService === false) s += 3;
    return s;
  }
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang)).sort((a, b) => score(b) - score(a));
    const saved = store('fx-voice-name');
    voice = voices.find(v => v.name === saved) || voices[0] || null;
    listeners.forEach(f => f());
  }
  const listeners = [];
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; setTimeout(loadVoices, 1200); }
  const clean = t => String(t || '').replace(/<[^>]*>/g, ' ').replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s*·\s*/g, '. ').replace(/([.!?])\s*\./g, '$1').replace(/([.!?])(?=[^\s.!?])/g, '$1 ').replace(/\s+/g, ' ').trim();
  function say(text, opts) {
    opts = opts || {};
    if (!state.voice || !state.unlocked || !('speechSynthesis' in window)) return;
    const t = clean(text); if (!t) return;
    if (opts.flush) speechSynthesis.cancel();
    // Frases cortas: suenan más naturales y evitan que Chrome corte la lectura larga
    const parts = t.split(/(?<=[.!?])\s+/);
    let chunk = '';
    const out = [];
    for (const p of parts) { if ((chunk + p).length > 180 && chunk) { out.push(chunk); chunk = ''; } chunk += (chunk ? ' ' : '') + p; }
    if (chunk.trim()) out.push(chunk);
    out.forEach(p => {
      const u = new SpeechSynthesisUtterance(p.trim());
      u.lang = voice ? voice.lang : 'es-CO'; if (voice) u.voice = voice;
      u.rate = opts.rate || 1; u.pitch = .92; u.volume = 1;
      speechSynthesis.speak(u);
    });
  }
  return {
    unlock, play, say, state,
    get voices() { return voices; }, get voice() { return voice; },
    onVoices(f) { listeners.push(f); f(); },
    setVoice(name) { voice = voices.find(v => v.name === name) || voice; store('fx-voice-name', name); },
    setSound(on) { state.sound = on; store('fx-sound', on ? '1' : '0'); },
    setVoiceOn(on) { state.voice = on; store('fx-voice', on ? '1' : '0'); if (!on && 'speechSynthesis' in window) speechSynthesis.cancel(); },
    isMale: v => !!v && MALE.test(v.name) && !FEMALE.test(v.name),
  };
})();
// Duración legible para la voz: "2 minutos", "1 minuto y medio", "45 segundos"
function durText(sec) {
  if (sec < 60) return sec + ' segundos';
  const m = Math.floor(sec / 60), r = sec % 60;
  return (m === 1 ? '1 minuto' : m + ' minutos') + (r === 30 ? ' y medio' : r ? ' y ' + r + ' segundos' : '');
}
