#!/usr/bin/env node
// Mini sala: una franja en la terminal, al lado de Claude Code, con los personajes y sus mascotas caminando.
// Sin dependencias: dibuja con medios bloques de color (▀ = 2 píxeles por carácter) y se conecta por HTTP.
// Teclas: ← → caminar · 1-8 emotes · m mensaje · p mimos · g galletita · c tamaño · s sala grande · q salir
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const Sprites = require('./sprites.js');

const EMOTES = ['👋', '🎉', '☕', '🔥', '😂', '👍', '🤯', '🍕'];
// Tamaños ya dibujados (con contorno). Grande: personaje 18x26, mascota 18x14. Compacto: 10x14 y 10x8.
const DIMS = { false: { aw: 18, ah: 26, pw: 18, ph: 14 }, true: { aw: 10, ah: 14, pw: 10, ph: 8 } };
const FLOOR = ['#c98a65', '#9c5a40'];

// ================= colores =================
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rgbTo256([r, g, b]) {
  const steps = [0, 95, 135, 175, 215, 255];
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  const [qr, qg, qb] = [q(r), q(g), q(b)];
  const dc = (r - steps[qr]) ** 2 + (g - steps[qg]) ** 2 + (b - steps[qb]) ** 2;
  const gi = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const gv = 8 + gi * 10;
  const dg = (r - gv) ** 2 + (g - gv) ** 2 + (b - gv) ** 2;
  return dg < dc ? 232 + gi : 16 + 36 * qr + 6 * qg + qb;
}
const supportsTruecolor = () => /truecolor|24bit/i.test(process.env.COLORTERM || '') || !!process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode' || process.env.TERM_PROGRAM === 'iTerm.app';
const fgCode = (hex, tc) => { const c = hexToRgb(hex); return tc ? `38;2;${c[0]};${c[1]};${c[2]}` : `38;5;${rgbTo256(c)}`; };
const bgCode = (hex, tc) => { const c = hexToRgb(hex); return tc ? `48;2;${c[0]};${c[1]};${c[2]}` : `48;5;${rgbTo256(c)}`; };

// ================= píxeles =================
// Achica una grilla de colores a la mitad tomando el color más común de cada bloque de 2x2 (modo compacto).
function shrink(grid) {
  const out = [];
  for (let y = 0; y < grid.length; y += 2) {
    const line = [];
    for (let x = 0; x < grid[0].length; x += 2) {
      const counts = new Map();
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const c = (grid[y + dy] || [])[x + dx];
        if (c) counts.set(c, (counts.get(c) || 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      line.push(best ? best[0] : null);
    }
    out.push(line);
  }
  return out;
}
const mirror = (grid) => grid.map((r) => [...r].reverse());
function blit(canvas, grid, x, y) {
  grid.forEach((r, ry) => {
    const cy = y + ry;
    if (cy < 0 || cy >= canvas.length) return;
    for (let rx = 0; rx < r.length; rx++) {
      const cx = x + rx;
      if (cx < 0 || cx >= canvas[0].length || !r[rx]) continue;
      canvas[cy][cx] = r[rx];
    }
  });
}
// Achica el dibujo original (no el ya iluminado): a tamaño chico se lee mejor con colores planos y contorno.
// Los ojos tienen prioridad para no perderse.
function shrinkRows(rows) {
  const out = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = '';
    for (let x = 0; x < rows[0].length; x += 2) {
      const counts = {};
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const ch = (rows[y + dy] || '')[x + dx];
        if (ch && ch !== '.') counts[ch] = (counts[ch] || 0) + 1;
      }
      if (counts.E) { line += 'E'; continue; }
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      line += best ? best[0] : '.';
    }
    out.push(line);
  }
  return out;
}
// Grande: mismo motor que la sala del navegador (luz, sombra y contorno de color). Compacto: plano con contorno.
const cache = new Map();
function cached(key, make) { if (!cache.has(key)) { if (cache.size > 300) cache.clear(); cache.set(key, make()); } return cache.get(key); }
function avatarColors(u, frame, compact) {
  return cached(`a|${JSON.stringify([u.avatar, u.custom])}|${frame}|${compact}`, () => {
    const g = Sprites.spriteGrid(u, frame);
    return compact ? Sprites.renderGrid(shrinkRows(g.rows), g.palette, { light: false }) : Sprites.renderGrid(g.rows, g.palette, { light: true });
  });
}
function petColors(kind, frame, compact) {
  return cached(`p|${kind}|${frame}|${compact}`, () => {
    const rows = Sprites.petRows(kind, frame);
    return compact ? Sprites.renderGrid(shrinkRows(rows), Sprites.petPal(kind), { light: false }) : Sprites.renderGrid(rows, Sprites.petPal(kind), { light: true });
  });
}
const hashName = (n) => [...n].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 0);

// ================= texto con emojis (los emojis ocupan 2 columnas) =================
// Emojis que todas las terminales dibujan con 2 columnas (los de "presentación emoji" por defecto).
const WIDE = new Set([0x2615, 0x2b50, 0x2728, 0x26a1, 0x26bd, 0x2705, 0x274c, 0x2753, 0x2757, 0x231a, 0x231b, 0x23f0, 0x23f3, 0x2614, 0x267f, 0x2693, 0x26aa, 0x26ab, 0x26c4, 0x26c5, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2b1b, 0x2b1c, 0x2b55]);
const plain = (s) => String(s || '').replace(/[^\p{L}\p{N}\p{P}\p{Zs}+=<>|~^$]/gu, '').replace(/\s+/g, ' ').trim(); // texto sin emojis
function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0xfe0f || cp === 0x200d) return 0;
  if (cp >= 0x1f000 || WIDE.has(cp) || (cp >= 0x1100 && cp <= 0x115f)) return 2;
  return 1;
}
const textWidth = (s) => [...s].reduce((a, ch) => a + charWidth(ch), 0);
// Recorta al ancho pedido sin partir emojis (trabaja con caracteres completos, no con unidades UTF-16).
function fitText(s, max) {
  const chars = [...String(s)];
  if (textWidth(s) <= max) return String(s);
  const out = [];
  let w = 0;
  for (const ch of chars) {
    const cw = charWidth(ch);
    if (w + cw > max - 1) break; // deja lugar para "…"
    out.push(ch); w += cw;
  }
  return out.join('') + '…';
}
// Fila de celdas: cada celda guarda texto + estilo. Una celda vacía ('') es la segunda mitad de un emoji.
function textRow(cols) { return Array.from({ length: cols }, () => ({ ch: ' ', st: '' })); }
function put(row, col, text, st = '') {
  let c = Math.max(0, col);
  for (const ch of text) {
    const w = charWidth(ch);
    if (w === 0) { if (c > 0) row[c - 1].ch += ch; continue; }
    if (c + w > row.length) break;
    row[c] = { ch, st };
    if (w === 2) row[c + 1] = { ch: '', st };
    c += w;
  }
}
function rowToString(row) {
  let out = '', cur = null;
  for (const cell of row) {
    if (cell.ch === '') continue;
    if (cell.st !== cur) { out += '\x1b[0m' + (cell.st ? `\x1b[${cell.st}m` : ''); cur = cell.st; }
    out += cell.ch;
  }
  return out + '\x1b[0m';
}

// ================= cuadro completo =================
// model: { cols, rows, compact, truecolor, me, meInfo, users, ents, bubbles, flash, now, input }
function buildFrame(model) {
  const { cols, compact, truecolor: tc, now } = model;
  const lines = [];
  if (cols < 44) return ['La mini sala necesita una terminal un poco más ancha.'];
  const { aw, ah, pw, ph } = DIMS[!!compact];
  const pixH = ah + 2; // personaje + piso
  const canvas = Array.from({ length: pixH }, () => Array(cols).fill(null));

  // piso
  for (let x = 0; x < cols; x++) { canvas[pixH - 2][x] = FLOOR[0]; canvas[pixH - 1][x] = FLOOR[1]; }

  const tags = textRow(cols), bubbles = textRow(cols);
  const ents = [...model.ents].sort((a, b) => (a.name === model.me) - (b.name === model.me)); // vos adelante
  for (const e of ents) {
    const u = model.users.find((x) => x.name === e.name);
    if (!u) continue;
    const x = Math.round(e.x);
    // cuadro: pasos al caminar, parpadeo de vez en cuando
    const frame = e.moving ? (e.step % 4 < 2 ? 'paso1' : 'paso2')
      : (now + hashName(u.name) * 97) % 4600 < 160 ? 'parpadeo' : 'quieto';
    let grid = avatarColors(u, frame, compact);
    if (e.facing < 0) grid = mirror(grid);
    blit(canvas, grid, x, pixH - 2 - ah);
    // mascota detrás, mirando hacia donde caminan
    if (u.pet && Sprites.PETS[u.pet.kind]) {
      let pg = petColors(u.pet.kind, e.moving && e.step % 4 >= 2 ? 'paso' : 'quieto', compact);
      if (e.facing > 0) pg = mirror(pg);
      const px = e.facing > 0 ? x - pw - 1 : x + aw + 1;
      const hop = e.petHopUntil > now && Math.floor(now / 150) % 2 ? (compact ? 1 : 2) : 0;
      blit(canvas, pg, px, pixH - 2 - ph - hop);
    }
    // nombre arriba
    const tag = fitText(plain(u.name) || '?', 14);
    const tx = x + Math.floor(aw / 2) - Math.floor(textWidth(tag) / 2);
    put(tags, tx, tag, u.name === model.me ? '1;30;48;5;75' : '1;97;48;5;236');
    // burbuja
    const b = model.bubbles[u.name];
    if (b && b.until > now) {
      const txt = b.emote ? b.text : ` ${fitText(b.text, 28)} `;
      put(bubbles, x + Math.floor(aw / 2) - Math.floor(textWidth(txt) / 2), txt, b.emote ? '' : '30;107');
    }
  }

  // ----- estado de arriba -----
  const status = textRow(cols);
  const present = model.users.filter((u) => u.web || u.mini || u.playing);
  const playing = model.users.filter((u) => u.playing).map((u) => u.name);
  const working = model.users.filter((u) => u.claude === 'working' && u.name !== model.me).map((u) => u.name);
  let left = ` La Sala · ${present.length} ${present.length === 1 ? 'persona' : 'personas'}`;
  if (playing.length) left += ` · jugando: ${playing.join(', ')}`;
  if (working.length) left += ` · con Claude trabajando: ${working.join(', ')}`;
  put(status, 0, fitText(left, cols), '1;97;48;5;24');
  for (let i = textWidth(fitText(left, cols)); i < cols; i++) status[i] = { ch: ' ', st: '1;97;48;5;24' };
  let right = '', rst = '1;97;48;5;24';
  const c = model.meInfo && model.meInfo.claude;
  if (!model.connected) { right = 'sin conexión con la sala, reintentando…'; rst = '1;97;48;5;160'; }
  else if (model.flash && model.flash.until > now) { right = plain(model.flash.text); rst = '1;30;48;5;222'; }
  else if (c && c.state === 'waiting') { right = '¡Tu Claude te necesita!'; rst = Math.floor(now / 500) % 2 ? '1;30;48;5;220' : '1;30;48;5;214'; }
  else if (model.doneUntil > now) { right = 'Tu Claude terminó ✓'; rst = '1;30;48;5;114'; }
  else if (c && c.state === 'working') {
    const s = c.since ? Math.max(0, Math.floor((now + (model.offset || 0) - c.since) / 1000)) : null;
    right = `Tu Claude: ${plain(c.activity) || 'trabajando'}${s !== null ? ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''}`;
  } else if (c && c.state === 'idle') right = 'Tu Claude está libre';
  if (model.meInfo && model.meInfo.hidden && (!c || c.state !== 'waiting')) { right = 'Estás invisible: nadie te ve'; rst = '1;97;48;5;60'; }
  if (right) {
    right = ` ${fitText(right, Math.max(10, cols - textWidth(left) - 3))} `;
    put(status, cols - textWidth(right), right, rst);
  }

  lines.push(rowToString(status));
  lines.push(rowToString(bubbles));
  lines.push(rowToString(tags));

  // ----- píxeles: 2 por carácter -----
  for (let r = 0; r < pixH; r += 2) {
    let out = '', cur = '';
    for (let x = 0; x < cols; x++) {
      const top = canvas[r][x], bot = (canvas[r + 1] || [])[x];
      let st, ch;
      if (!top && !bot) { st = ''; ch = ' '; }
      else if (top && bot) { st = `${fgCode(top, tc)};${bgCode(bot, tc)}`; ch = '▀'; }
      else if (top) { st = `${fgCode(top, tc)};49`; ch = '▀'; }
      else { st = `${fgCode(bot, tc)};49`; ch = '▄'; }
      if (st !== cur) { out += '\x1b[0m' + (st ? `\x1b[${st}m` : ''); cur = st; }
      out += ch;
    }
    lines.push(out + '\x1b[0m');
  }

  // ----- pie: teclas o el mensaje que estás escribiendo -----
  const foot = textRow(cols);
  if (model.input !== null && model.input !== undefined) {
    put(foot, 0, fitText(` Mensaje: ${model.input}▏  (Enter manda · Esc cancela)`, cols), '97;48;5;238');
  } else {
    put(foot, 0, fitText(' ← → caminar · 1-8 emotes ' + EMOTES.join('') + ' · m mensaje · p mimos · g galletita · c tamaño · s sala grande · q salir', cols), '37;48;5;236');
  }
  lines.push(rowToString(foot));
  return lines;
}

// ================= mundo: quién camina por dónde =================
// Busca un lugar donde no haya nadie parado ni yendo. Revisa todas las posiciones posibles y elige al azar
// entre las libres; si no hay ninguna libre (mucha gente), la más alejada de todos.
function freeSpot(model, self, rand, spread = false) {
  const { aw, pw } = DIMS[!!model.compact];
  const min = pw + 2, max = Math.max(min + 1, model.cols - aw - pw - 2);
  const gap = aw + pw + 4;
  const others = model.ents.filter((e) => e !== self).flatMap((e) => [e.x, e.target]);
  const distTo = (x) => (others.length ? Math.min(...others.map((o) => Math.abs(o - x))) : Infinity);
  const free = [];
  let best = min, bestDist = -1;
  for (let x = min; x <= max; x++) {
    const d = distTo(x);
    if (d >= gap) free.push(x);
    if (d > bestDist) { bestDist = d; best = x; }
  }
  // al aparecer: el punto más alejado de todos (reparte parejo); al pasear: cualquiera libre
  if (spread && others.length) return best;
  return free.length ? free[Math.floor(rand() * free.length)] : best;
}

function syncEntities(model, rand = Math.random) {
  const present = model.users.filter((u) => u.web || u.mini || u.playing);
  const names = new Set(present.map((u) => u.name));
  model.ents = model.ents.filter((e) => names.has(e.name));
  for (const u of present) {
    if (model.ents.some((e) => e.name === u.name)) continue;
    const x = freeSpot(model, null, rand, true);
    model.ents.push({ name: u.name, x, target: x, facing: rand() < 0.5 ? -1 : 1, moving: false, step: 0, restUntil: model.now + rand() * 4000, petHopUntil: 0, manualUntil: 0 });
  }
}
function stepWorld(model, rand = Math.random) {
  const { aw, pw } = DIMS[!!model.compact];
  const min = pw + 2, max = Math.max(min + 1, model.cols - aw - pw - 2);
  for (const e of model.ents) {
    e.target = Math.max(min, Math.min(max, e.target));
    const d = e.target - e.x;
    if (Math.abs(d) < 0.6) {
      e.moving = false;
      if (model.now > e.restUntil && model.now > e.manualUntil) {
        e.target = freeSpot(model, e, rand);
        e.restUntil = model.now + 2500 + rand() * 6000;
      }
    } else {
      e.moving = true;
      e.facing = d > 0 ? 1 : -1;
      e.x += Math.sign(d) * Math.min(Math.abs(d), model.compact ? 0.5 : 0.75);
      e.step++;
    }
  }
}

// ================= conexión =================
function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude-sala.json'), 'utf8')); } catch { /* sin config */ }
  return { url: (process.env.SALA_URL || cfg.url || '').replace(/\/+$/, ''), token: process.env.SALA_TOKEN || cfg.token };
}
const lib = (url) => (url.startsWith('https') ? https : http);
function postAction(cfg, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ token: cfg.token, ...body });
    const req = lib(cfg.url).request(cfg.url + '/api/action', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, timeout: 4000 }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false, errors: ['respuesta inválida'] }); } });
    });
    req.on('error', () => resolve({ ok: false, errors: ['No llego a la sala'] }));
    req.on('timeout', () => req.destroy());
    req.end(data);
  });
}
function openStream(cfg, onMsg, onState) {
  let req = null, closed = false, retry = null;
  const connect = () => {
    req = lib(cfg.url).get(cfg.url + '/api/stream?t=' + encodeURIComponent(cfg.token), { headers: { accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) { onState(false, res.statusCode === 401 ? 'token inválido' : `error ${res.statusCode}`); res.resume(); return; }
      onState(true);
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = ev.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
          if (data) { try { onMsg(JSON.parse(data)); } catch { /* ignorar */ } }
        }
      });
      res.on('end', again);
    });
    req.on('error', again);
  };
  function again() { onState(false); if (!closed) { clearTimeout(retry); retry = setTimeout(connect, 3000); } }
  connect();
  return () => { closed = true; clearTimeout(retry); if (req) req.destroy(); };
}
function openBigRoom(cfg) {
  const url = `${cfg.url}/?t=${encodeURIComponent(cfg.token)}`;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch { /* sin navegador */ }
}

// ================= programa =================
function main() {
  const cfg = loadConfig();
  if (!cfg.url || !cfg.token) {
    console.log('La mini sala no está configurada. En Claude Code corré /sala-setup (o pegá el mensaje de invitación).');
    process.exit(1);
  }
  if (!process.stdout.isTTY) { console.log('La mini sala tiene que correr en una terminal.'); process.exit(1); }

  const model = {
    cols: process.stdout.columns || 100, compact: !process.argv.includes('--grande'),
    truecolor: supportsTruecolor(), me: null, meInfo: null, users: [], ents: [], bubbles: {}, flash: null,
    doneUntil: 0, now: Date.now(), input: null, connected: false,
  };
  const flash = (text, ms = 3500) => { model.flash = { text, until: Date.now() + ms }; };
  const bubble = (name, text, emote, ms) => { model.bubbles[name] = { text, emote, until: Date.now() + (ms || (emote ? 2500 : 5000)) }; };
  const bell = () => process.stdout.write('\x07');

  const stop = openStream(cfg, (m) => {
    switch (m.type) {
      case 'me': model.me = m.name; model.meInfo = m; if (m.serverTime) model.offset = m.serverTime - Date.now(); break;
      case 'state': model.users = m.users; syncEntities(model); break;
      case 'chat': bubble(m.name, m.text, m.emote); break;
      case 'claude_needs_you': bell(); break;
      case 'claude_done': model.doneUntil = Date.now() + 20000; bell(); break;
      case 'done': bubble(m.name, '⭐', true); break;
      case 'avatar_ai': bubble(m.name, '✨', true); break;
      case 'pet_event': {
        const e = model.ents.find((x) => x.name === m.name);
        if (e) e.petHopUntil = Date.now() + 1600;
        bubble(m.name, m.anim === 'love' ? '💖' : m.emoji, true, 1600);
        break;
      }
      case 'invited': flash(`${m.from} te desafía a ${m.game === 'tateti' ? 'Ta-te-ti' : m.game === 'cuatro' ? 'Cuatro en línea' : 'Reflejos'}: apretá s para jugar en la sala grande`, 15000); bell(); break;
      case 'bonus': flash(`+${m.coins} monedas por pasar por la sala hoy`); break;
      case 'error': flash(m.text); break;
      default: break;
    }
  }, (ok, why) => { model.connected = ok; if (why) flash(why, 6000); });

  const out = process.stdout;
  out.write('\x1b[?1049h\x1b[?25l');
  const draw = () => {
    model.now = Date.now();
    model.cols = out.columns || model.cols;
    const lines = buildFrame(model);
    let s = '\x1b[H';
    lines.forEach((l, i) => { s += `\x1b[${i + 1};1H${l}\x1b[K`; });
    s += `\x1b[${lines.length + 1};1H\x1b[J`;
    out.write(s);
  };
  const tick = setInterval(() => { model.now = Date.now(); stepWorld(model); draw(); }, 125);
  out.on('resize', draw);

  function quit() {
    clearInterval(tick); stop();
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
    process.exit(0);
  }
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);

  const meEnt = () => model.ents.find((e) => e.name === model.me);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (key) => {
    if (key === '\u0003') return quit();
    if (model.input !== null) {
      if (key === '\x1b') { model.input = null; return draw(); }
      if (key === '\x7f' || key === '\b') { model.input = [...model.input].slice(0, -1).join(''); return draw(); }
      // también sirve pegar texto: si trae un Enter, se manda lo que había hasta ahí
      const nl = key.search(/[\r\n]/);
      const part = nl >= 0 ? key.slice(0, nl) : key;
      if (!part.startsWith('\x1b')) model.input = [...(model.input + part.replace(/[\x00-\x1f\x7f]/g, ''))].slice(0, 90).join('');
      if (nl >= 0) {
        const text = model.input.trim(); model.input = null;
        if (text) { const r = await postAction(cfg, { type: 'chat', text }); if (!r.ok) flash(r.errors[0]); }
      }
      return draw();
    }
    const e = meEnt();
    if (key === 'q') return quit();
    if (key === '\x1b[D' && e) { e.target = e.x - 10; e.manualUntil = Date.now() + 8000; }
    else if (key === '\x1b[C' && e) { e.target = e.x + 10; e.manualUntil = Date.now() + 8000; }
    else if (/^[1-8]$/.test(key)) { const r = await postAction(cfg, { type: 'emote', emoji: EMOTES[Number(key) - 1] }); if (!r.ok) flash(r.errors[0]); }
    else if (key === 'm') model.input = '';
    else if (key === 'p') { const r = await postAction(cfg, { type: 'pet', action: 'cuddle' }); if (!r.ok) flash(r.errors[0]); }
    else if (key === 'g') { const r = await postAction(cfg, { type: 'pet', action: 'buy', item: 'galletita' }); if (!r.ok) flash(r.errors[0]); }
    else if (key === 'c') { model.compact = !model.compact; out.write('\x1b[2J'); }
    else if (key === 's') { openBigRoom(cfg); flash('Abriendo la sala grande…'); }
    draw();
  });
  draw();
}

if (require.main === module) main();
module.exports = { buildFrame, syncEntities, stepWorld, shrink, shrinkRows, mirror, rgbTo256, textWidth, fitText, charWidth, avatarColors };
