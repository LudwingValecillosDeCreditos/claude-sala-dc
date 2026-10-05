'use strict';
// La Sala — servidor para la red del equipo (LAN o VPN).
// - POST /api/event  recibe los eventos de los hooks de Claude Code
// - GET  /api/ping    diagnóstico de conexión
// - GET  /health      chequeo simple (con ?t=token dice de quién es)
// - WS   /ws          sincroniza la sala, la mascota y los minijuegos
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const games = require('./lib/games');
const pets = require('./lib/pets');
const net = require('./lib/net');
const Sprites = require('./public/sprites.js');
const { inviteMessage } = require('./lib/invite');

const VERSION = '0.8.1';

const CATALOG = {
  ...Sprites.CATALOG, // especies, ropa, sombreros y accesorios: misma fuente que dibuja el navegador
  skins: ['#f1c27d', '#ffdbac', '#c68642', '#8d5524', '#7bd389', '#8ecae6', '#c3a6ff', '#f4a261', '#e9e4da', '#6b4f3a'],
  topColors: ['#4f5bd5', '#2a9d8f', '#e9c46a', '#e63946', '#6d597a', '#264653', '#f1f1f1', '#ff8fab'],
  emotes: ['👋', '🎉', '☕', '🔥', '😂', '👍', '🤯', '🍕'],
  petKinds: pets.PET_KINDS,
  shop: pets.SHOP,
  games: games.GAME_TYPES,
};
const DEFAULT_AVATAR = { species: 'humano', skin: '#f1c27d', top: 'remera', topColor: '#4f5bd5', hat: 'ninguno', extra: 'ninguno', hair: 'corto', hairColor: '#3b2a20' };
// La sala no premia usar más Claude: las monedas salen de pasar el rato, jugar y cuidar la mascota.
const REWARDS = { daily: { coins: 10 }, task: { coins: 2 }, taskDailyCap: 10, played: { coins: 3 }, win: { coins: 10 } };
const RANK = { lobby: 0, afk: 1, idle: 2, working: 3, waiting: 4 };

const readJSON = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function createSala(opts = {}) {
  const dataDir = opts.dataDir || __dirname;
  const DATA_FILE = path.join(dataDir, 'data.json');
  const TEAM_FILE = path.join(dataDir, 'team.json');
  const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
  const now = opts.now || Date.now;
  const random = opts.random || Math.random;
  const T = {
    afk: 15 * 60e3, staleWork: 20 * 60e3, sessionTtl: 4 * 3600e3,
    invite: 60e3, disconnectGrace: 8e3, gameKeep: 15e3, teamWatch: 2000,
    reflejosStart: 1500, reflejosScale: 1, reflejosWindow: 3000, reflejosPause: 2500,
    broadcastDelay: 120,
    ...(opts.timing || {}),
  };
  const repo = opts.repo || readJSON(path.join(dataDir, 'sala.config.json'), {}).repo || null;
  const allowed = net.parseAllowList(opts.allow !== undefined ? opts.allow : process.env.SALA_PERMITIR);

  // ---------- timers (todos registrados para poder cerrar limpio) ----------
  const timers = new Set();
  let closed = false;
  const later = (fn, ms) => { if (closed) return null; const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const cancel = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };

  // ---------- persistencia ----------
  let team = readJSON(TEAM_FILE, { members: {} });
  const db = readJSON(DATA_FILE, { users: {} });
  let saveTimer = null;
  function save() {
    cancel(saveTimer);
    saveTimer = later(() => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch {} }, 300);
  }
  function flushSave() { cancel(saveTimer); try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch {} }

  const teamNames = () => [...new Set(Object.values(team.members || {}))];
  const nameForToken = (t) => (typeof t === 'string' && Object.prototype.hasOwnProperty.call(team.members || {}, t) ? team.members[t] : null);
  const randomLounge = () => ({ x: 620 + random() * 320, y: 200 + random() * 170 });

  function getUser(name) {
    let u = db.users[name], dirty = false;
    if (!u) { u = db.users[name] = { avatar: { ...DEFAULT_AVATAR }, xp: 0, hidden: false, pos: randomLounge() }; dirty = true; }
    // migraciones desde v0.1
    if (u.coins === undefined) { u.coins = 20; dirty = true; }
    if (!u.pet) { u.pet = pets.newPet(now()); dirty = true; }
    if (!u.stats) { u.stats = { played: 0, wins: 0 }; dirty = true; }
    if (u.custom === undefined) { u.custom = null; dirty = true; }
    if (dirty) save();
    return u;
  }
  // Día calendario de la PC del servidor (no UTC: en Argentina el día cambiaría a las 21 h).
  const today = () => { const d = new Date(now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function award(u, r) { u.coins += r.coins || 0; save(); }
  function awardTask(u) {
    const d = today();
    if (u.taskDay !== d) { u.taskDay = d; u.taskCoins = 0; }
    const give = Math.min(REWARDS.task.coins, REWARDS.taskDailyCap - u.taskCoins);
    if (give > 0) { u.taskCoins += give; award(u, { coins: give }); }
  }

  function cleanAvatar(a) {
    const out = { ...DEFAULT_AVATAR };
    if (!a || typeof a !== 'object') return out;
    const fields = { species: 'species', top: 'tops', hat: 'hats', extra: 'extras', skin: 'skins', topColor: 'topColors', hair: 'hairs', hairColor: 'hairColors' };
    for (const [key, list] of Object.entries(fields)) if (CATALOG[list].includes(a[key])) out[key] = a[key];
    return out;
  }

  const chatLog = []; // últimos mensajes, solo en memoria

  // ---------- presencia de Claude ----------
  const sessions = new Map(); // "Nombre::sessionId" -> { name, state, activity, last, workStart }

  function activityFor(tool) {
    if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return '✏️ escribiendo código';
    if (tool === 'Bash' || tool === 'BashOutput') return '⌨️ en la terminal';
    if (/^(Read|Grep|Glob|LS)$/.test(tool)) return '📖 leyendo código';
    if (/^(WebSearch|WebFetch)$/.test(tool)) return '🌐 buscando en la web';
    if (tool === 'Task' || tool === 'Agent') return '🤝 delegando a un agente';
    if (tool === 'TodoWrite') return '📝 armando la lista de tareas';
    if (tool.startsWith('mcp__')) return '🔌 usando una integración';
    return '⚙️ trabajando';
  }

  function handleEvent(name, sessionId, event, tool) {
    const key = name + '::' + sessionId;
    const t = now();
    if (event === 'end') { sessions.delete(key); changed(); return true; }
    const known = ['start', 'work', 'tool', 'tool_done', 'waiting', 'idle'];
    if (!known.includes(event)) return false;

    let s = sessions.get(key);
    if (!s) { s = { name, state: 'idle', activity: null, last: t, workStart: null }; sessions.set(key, s); }
    s.last = t;
    const u = getUser(name);

    if (event === 'start') { s.state = 'idle'; s.activity = null; s.workStart = null; }
    if (event === 'work') { s.workStart = s.workStart || t; s.state = 'working'; s.activity = '💭 pensando'; }
    if (event === 'tool') { s.workStart = s.workStart || t; s.state = 'working'; s.activity = activityFor(tool); }
    if (event === 'tool_done') { s.workStart = s.workStart || t; s.state = 'working'; s.activity = s.activity && !s.activity.startsWith('❗') ? s.activity : '⚙️ trabajando'; }
    if (event === 'waiting') {
      if (s.state !== 'waiting') sendTo(name, { type: 'claude_needs_you' }); // solo a su dueño
      s.state = 'waiting'; s.activity = '❗ esperando tu aprobación';
    }
    if (event === 'idle') {
      const dur = s.workStart ? t - s.workStart : 0;
      if (s.state === 'working' || s.state === 'waiting') {
        if (dur >= 60e3) {
          awardTask(u);
          if (!u.hidden) broadcast({ type: 'done', name }); // sin duración: no es un tablero de productividad
        }
        sendTo(name, { type: 'claude_done' });
      }
      s.state = 'idle'; s.activity = null; s.workStart = null;
    }
    changed();
    return true;
  }

  function presence() {
    const t = now();
    const names = teamNames();
    const out = new Map();
    for (const [key, s] of sessions) {
      if (t - s.last > T.sessionTtl || !names.includes(s.name)) { sessions.delete(key); continue; }
      let st = s.state;
      if ((st === 'working' || st === 'waiting') && t - s.last > T.staleWork) st = 'idle';
      if (st === 'idle' && t - s.last > T.afk) st = 'afk';
      const prev = out.get(s.name);
      if (!prev || RANK[st] > RANK[prev.state]) {
        out.set(s.name, { state: st, activity: st === 'working' || st === 'waiting' ? s.activity : null, since: st === 'working' || st === 'waiting' ? s.workStart : null });
      }
    }
    return out;
  }

  // ---------- juegos ----------
  const liveGames = new Map(); // id -> game
  const invites = new Map();   // id -> { id, from, to, game, timer }
  const playingOf = (name) => [...liveGames.values()].find((g) => g.status === 'playing' && g.players.includes(name)) || null;

  function pushGame(g) {
    const msg = { type: 'game', game: games.publicView(g) };
    for (const p of g.players) sendTo(p, msg);
  }

  function startGame(type, players) {
    const g = games.create(type, players, { id: crypto.randomUUID(), random });
    liveGames.set(g.id, g);
    pushGame(g);
    changed();
    if (type === 'reflejos') scheduleRound(g, T.reflejosStart);
    return g;
  }

  function scheduleRound(g, wait) {
    later(() => {
      if (g.status !== 'playing') return;
      const delay = games.reflejosStartRound(g, random);
      const round = g.round;
      pushGame(g);
      later(() => {
        if (!games.reflejosGo(g, round)) return;
        pushGame(g);
        later(() => { if (games.reflejosResolve(g, round).roundOver) afterRound(g); }, T.reflejosWindow);
      }, delay * T.reflejosScale);
    }, wait);
  }

  function afterRound(g) {
    pushGame(g);
    if (g.status === 'over') onGameOver(g);
    else scheduleRound(g, T.reflejosPause);
  }

  function onGameOver(g) {
    if (g.rewarded) return;
    g.rewarded = true;
    for (const p of g.players) {
      const u = getUser(p);
      u.stats.played += 1;
      if (!(g.reason === 'abandono' && p === g.quitter)) award(u, REWARDS.played);
    }
    if (g.winner) { const w = getUser(g.winner); w.stats.wins += 1; award(w, REWARDS.win); }
    broadcast({ type: 'game_over', gameType: g.type, players: g.players, winner: g.winner, reason: g.reason });
    later(() => liveGames.delete(g.id), T.gameKeep);
    changed();
  }

  function availability(target) {
    const names = teamNames();
    if (!names.includes(target)) return 'No está en el equipo';
    if (!webNames().has(target)) {
      return miniNames().has(target)
        ? `${target} está en la mini sala de la terminal: para jugar tiene que abrir la sala grande`
        : `${target} no tiene la sala abierta`;
    }
    if (getUser(target).hidden) return `${target} no está disponible`;
    if (playingOf(target)) return `${target} ya está jugando`;
    return null; // que su Claude esté trabajando es justamente el mejor momento para jugar
  }

  function dropInvite(inv, notify) {
    cancel(inv.timer);
    invites.delete(inv.id);
    if (notify) { sendTo(inv.to, { type: 'invite_gone', id: inv.id }); }
  }

  function handleInvite(ws, m) {
    const me = ws.me;
    const type = String(m.game || '');
    const to = String(m.to || '');
    if (!games.GAME_TYPES[type]) return wsError(ws, 'Ese juego no existe');
    if (to === me) return wsError(ws, 'No podés desafiarte a vos mismo');
    if (getUser(me).hidden) return wsError(ws, 'Estás invisible: desactivalo para jugar');
    if (playingOf(me)) return wsError(ws, 'Ya estás en una partida');
    const why = availability(to);
    if (why) return wsError(ws, why);
    for (const inv of invites.values()) if (inv.from === me && inv.to === to) dropInvite(inv, true);
    const inv = { id: crypto.randomUUID(), from: me, to, game: type };
    inv.timer = later(() => {
      if (!invites.has(inv.id)) return;
      invites.delete(inv.id);
      sendTo(inv.from, { type: 'invite_expired', id: inv.id, to });
      sendTo(inv.to, { type: 'invite_gone', id: inv.id });
    }, T.invite);
    invites.set(inv.id, inv);
    sendTo(to, { type: 'invited', id: inv.id, from: me, game: type, expiresIn: T.invite });
    ws.send(JSON.stringify({ type: 'invite_sent', id: inv.id, to, game: type }));
  }

  function handleInviteReply(ws, m) {
    const inv = invites.get(String(m.id || ''));
    if (!inv || inv.to !== ws.me) return wsError(ws, 'Esa invitación ya no está vigente');
    dropInvite(inv, false);
    if (!m.accept) { sendTo(inv.from, { type: 'invite_declined', id: inv.id, by: ws.me }); return; }
    if (playingOf(inv.from) || playingOf(inv.to) || !webNames().has(inv.from)) {
      return wsError(ws, `${inv.from} ya no está disponible`);
    }
    startGame(inv.game, [inv.from, inv.to]);
  }

  function handleGameAction(ws, m) {
    const g = liveGames.get(String(m.id || ''));
    if (!g) return wsError(ws, 'Esa partida ya no existe');
    let res;
    if (m.action === 'move') res = games.move(g, ws.me, m);
    else if (m.action === 'hit') res = games.reflejosHit(g, ws.me, m);
    else if (m.action === 'leave') res = games.forfeit(g, ws.me) ? { ok: true } : { ok: false, error: 'No podés abandonar esta partida' };
    else return;
    if (!res.ok) return wsError(ws, res.error);
    if (g.type === 'reflejos' && res.roundOver) return afterRound(g);
    pushGame(g);
    if (g.status === 'over') onGameOver(g);
  }

  function onUserGone(name) {
    for (const inv of [...invites.values()]) {
      if (inv.from === name) dropInvite(inv, true);
      else if (inv.to === name) { dropInvite(inv, false); sendTo(inv.from, { type: 'invite_declined', id: inv.id, by: name }); }
    }
    later(() => {
      if (webNames().has(name)) return; // volvió (por ejemplo, recargó la página)
      const g = playingOf(name);
      if (g && games.forfeit(g, name)) { pushGame(g); onGameOver(g); }
    }, T.disconnectGrace);
  }

  // ---------- snapshot y difusión ----------
  let wss = null;
  const streams = new Set(); // mini salas conectadas desde la terminal
  const actionLast = new Map();
  const allClients = () => (wss ? [...wss.clients, ...streams] : [...streams]);
  function miniNames() {
    const set = new Set();
    for (const c of streams) if (c.me && c.readyState === 1) set.add(c.me);
    return set;
  }
  function webNames() {
    const set = new Set();
    if (!wss) return set;
    for (const c of wss.clients) if (c.me && c.readyState === 1) set.add(c.me);
    return set;
  }

  // Lo que ven todos. A propósito NO incluye qué hace cada Claude, cuánto tarda ni si pide permiso:
  // eso lo ve solo su dueño (meInfo). La sala es para pasar el rato, no para medir a nadie.
  function snapshot() {
    const users = [];
    const web = webNames();
    const t = now();
    const pres = presence();
    const mini = miniNames();
    const names = new Set([...pres.keys(), ...web, ...mini]);
    for (const name of teamNames()) {
      if (!names.has(name)) continue;
      const u = getUser(name);
      if (u.hidden) continue;
      const p = pres.get(name);
      const g = playingOf(name);
      pets.tick(u.pet, t);
      users.push({
        name,
        claude: !p ? 'off' : p.state === 'working' || p.state === 'waiting' ? 'working' : 'idle',
        away: !!p && p.state === 'afk' && !web.has(name),
        web: web.has(name), mini: mini.has(name), playing: g ? g.type : null,
        avatar: u.avatar, custom: u.custom, pos: u.pos, pet: pets.publicPet(u.pet),
      });
    }
    const live = [...liveGames.values()].filter((g) => g.status === 'playing').map((g) => ({ id: g.id, type: g.type, players: g.players }));
    return { type: 'state', team: teamNames(), users, games: live };
  }

  function meInfo(name) {
    if (!name) return { type: 'me', name: null };
    const u = getUser(name);
    pets.tick(u.pet, now());
    const p = presence().get(name);
    const claude = p ? { state: p.state === 'afk' ? 'idle' : p.state, activity: p.activity, since: p.since } : { state: 'off', activity: null, since: null };
    // serverTime: cada cliente corrige la diferencia entre su reloj y el del servidor
    return { type: 'me', name, hidden: u.hidden, avatar: u.avatar, custom: u.custom, coins: u.coins, stats: u.stats, pet: pets.publicPet(u.pet), claude, serverTime: now() };
  }

  function sendTo(name, msg) {
    if (!wss) return;
    const data = JSON.stringify(msg);
    for (const c of allClients()) if (c.me === name && c.readyState === 1) c.send(data);
  }
  function broadcast(msg) {
    if (!wss) return;
    const data = JSON.stringify(msg);
    for (const c of allClients()) if (c.readyState === 1) c.send(data);
  }
  function wsError(ws, text) { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', text })); }

  let changeTimer = null;
  function changed() {
    if (changeTimer) return;
    changeTimer = later(() => {
      changeTimer = null;
      if (!wss) return;
      const snap = JSON.stringify(snapshot());
      for (const c of allClients()) {
        if (c.readyState !== 1) continue;
        c.send(snap);
        if (c.me) c.send(JSON.stringify(meInfo(c.me)));
      }
    }, T.broadcastDelay);
  }
  const heartbeat = setInterval(changed, 30e3);

  fs.watchFile(TEAM_FILE, { interval: T.teamWatch }, () => {
    team = readJSON(TEAM_FILE, team);
    for (const c of allClients()) c.me = nameForToken(c.token);
    changed();
  });

  // ---------- HTTP ----------
  function reply(res, code, text = '', type = 'text/plain') {
    res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' });
    res.end(text);
  }

  function readJSONBody(req, limit) {
    return new Promise((resolve) => {
      let body = '', over = false;
      req.on('data', (c) => { body += c; if (body.length > limit) { over = true; req.destroy(); } });
      req.on('end', () => {
        if (over) return resolve({ error: 'demasiado grande' });
        let j;
        try { j = JSON.parse(body); } catch { return resolve({ error: 'json inválido' }); }
        if (!isObj(j)) return resolve({ error: 'se esperaba un objeto JSON' });
        resolve({ json: j });
      });
      req.on('error', () => resolve({ error: 'error de lectura' }));
    });
  }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const json = (res, code, obj) => reply(res, code, JSON.stringify(obj), 'application/json');
  const previewPath = (name) => '/api/avatar.svg?name=' + encodeURIComponent(name);

  // Lo que necesita Claude Code para diseñar: estado actual, catálogo, reglas y el personaje actual como grilla.
  function avatarInfo(name) {
    const u = getUser(name);
    return {
      ok: true, name, mode: u.custom ? 'ia' : 'editor',
      avatar: u.avatar, custom: u.custom,
      base: u.custom || Sprites.avatarGrid(u.avatar),
      catalog: { species: CATALOG.species, tops: CATALOG.tops, hats: CATALOG.hats, extras: CATALOG.extras, skins: CATALOG.skins, topColors: CATALOG.topColors },
      rules: Sprites.RULES, size: { width: Sprites.W, height: Sprites.H },
      preview: previewPath(name),
    };
  }

  async function handleAvatarPost(req, res) {
    const { json: j, error } = await readJSONBody(req, 16384);
    if (error) return json(res, 400, { ok: false, errors: [error] });
    const name = nameForToken(j.token);
    if (!name) return json(res, 401, { ok: false, errors: ['token inválido'] });
    const u = getUser(name);
    if (j.custom !== undefined && j.custom !== null) {
      const v = Sprites.validateCustom(j.custom);
      if (!v.ok) return json(res, 400, { ok: false, errors: v.errors, rules: Sprites.RULES });
      u.custom = v.custom;
    } else if (j.custom === null) {
      u.custom = null;
    }
    if (j.avatar !== undefined) {
      if (!j.avatar || typeof j.avatar !== 'object') return json(res, 400, { ok: false, errors: ['avatar tiene que ser un objeto'] });
      const bad = Object.entries(j.avatar).filter(([k, v]) => {
        const list = { species: 'species', top: 'tops', hat: 'hats', extra: 'extras', skin: 'skins', topColor: 'topColors', hair: 'hairs', hairColor: 'hairColors' }[k];
        return !list || !CATALOG[list].includes(v);
      });
      if (bad.length) return json(res, 400, { ok: false, errors: bad.map(([k, v]) => `"${k}: ${v}" no está en el catálogo`) });
      u.avatar = cleanAvatar({ ...u.avatar, ...j.avatar });
      if (j.custom === undefined) u.custom = null; // eligió del catálogo: vuelve al editor
    }
    save();
    if (!u.hidden && (j.custom || j.avatar)) broadcast({ type: 'avatar_ai', name });
    changed();
    return json(res, 200, { ...avatarInfo(name), saved: true });
  }

  function joinPage(name, token, origin) {
    const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const msg = name ? inviteMessage({ name, token, url: origin, repo }) : '';
    const body = !name
      ? '<h1>Link vencido</h1><p>Este link de invitación no es válido. Pedile uno nuevo a quien administra la sala.</p>'
      : `<h1>¡Hola, ${esc(name)}!</h1>
        <p>La Sala es un lugar para pasar el rato con el equipo mientras tu Claude trabaja: charlar, cuidar tu mascota o jugar una partida. Te avisa cuando tu Claude te necesita.</p>
        <p><b>Para instalarla:</b> copiá este mensaje y pegáselo a tu Claude Code. Él hace el resto.</p>
        <pre id="msg">${esc(msg)}</pre>
        <p><button onclick="navigator.clipboard.writeText(document.getElementById('msg').textContent);this.textContent='¡Copiado! Pegalo en Claude Code'">Copiar mensaje</button>
           <a class="go" href="/?t=${encodeURIComponent(token)}">Ver la sala ahora</a></p>
        <p class="small">El mensaje tiene tu token: no lo compartas. Los demás solo ven si tu Claude está trabajando o no; qué hace y cuánto tarda lo ves solo vos.</p>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unirse a La Sala</title>
      <style>
        @font-face { font-family: "Pixelify Sans"; src: url(/fonts/pixelify-sans-latin-400-normal.woff2) format("woff2"); }
        @font-face { font-family: "Press Start 2P"; src: url(/fonts/press-start-2p-latin-400-normal.woff2) format("woff2"); }
        body { margin: 0; background: #1a1c2c; color: #f4f4f4; font: 17px/1.45 "Pixelify Sans", monospace; display: grid; place-items: center; min-height: 100vh; padding: 20px; box-sizing: border-box; font-variant-ligatures: none; font-feature-settings: "liga" 0; }
        main { background: #333c57; border: 4px solid #0b0c14; box-shadow: 0 0 0 4px #73eff7; padding: 22px; max-width: 640px; width: 100%; }
        h1 { font: 18px/1.4 "Press Start 2P", monospace; color: #73eff7; margin: 0 0 12px; }
        ol { padding-left: 0; list-style: none; display: grid; gap: 12px; }
        .cmd { display: flex; gap: 8px; margin-top: 4px; }
        code { flex: 1; background: #1a1c2c; border: 2px solid #0b0c14; padding: 6px 8px; overflow-x: auto; white-space: nowrap; }
        button, .go { font: inherit; background: #3b5dc9; color: #fff; border: 2px solid #0b0c14; padding: 6px 12px; cursor: pointer; text-decoration: none; display: inline-block; }
        .small { color: #94b0c2; font-size: 15px; }
        pre { background: #1a1c2c; border: 2px solid #0b0c14; padding: 10px; white-space: pre-wrap; word-break: break-word; font: 14px/1.4 "Pixelify Sans", monospace; max-height: 340px; overflow: auto; }
        p .go { margin-left: 8px; }
      </style></head><body><main>${body}</main></body></html>`;
  }

  const server = http.createServer((req, res) => {
    if (!allowed(req.socket.remoteAddress)) return reply(res, 403, 'Esta IP no tiene acceso a La Sala');
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/api/event') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        let j;
        try { j = JSON.parse(body); } catch { return reply(res, 400, 'json inválido'); }
        if (!isObj(j)) return reply(res, 400, 'se esperaba un objeto JSON');
        const name = nameForToken(j.token);
        if (!name) return reply(res, 401, 'token inválido');
        const ok = handleEvent(name, String(j.session || 'default').slice(0, 64), String(j.event || ''), String(j.tool || ''));
        reply(res, ok ? 204 : 400, ok ? '' : 'evento desconocido');
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const tok = url.searchParams.get('t');
      const name = nameForToken(tok);
      if (!name) return reply(res, 401, 'token inválido');
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(': la sala\n\n');
      const client = {
        me: name, token: tok, lastMsg: 0, readyState: 1, res,
        send(data) { if (this.readyState === 1) res.write(`data: ${data}\n\n`); },
      };
      client.keepAlive = setInterval(() => res.write(': ping\n\n'), 25e3);
      streams.add(client);
      req.on('close', () => { clearInterval(client.keepAlive); client.readyState = 3; streams.delete(client); changed(); });
      greet(client);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      readJSONBody(req, 2048).then(({ json: j, error }) => {
        if (res.headersSent) return;
        if (error) return json(res, 400, { ok: false, errors: [error] });
        const name = nameForToken(j.token);
        if (!name) return json(res, 401, { ok: false, errors: ['token inválido'] });
        const allowed = j.type === 'emote' || j.type === 'chat' || (j.type === 'pet' && (j.action === 'cuddle' || j.action === 'buy'));
        if (!allowed) return json(res, 400, { ok: false, errors: ['Esa acción no está disponible desde la terminal'] });
        const errors = [];
        const pseudo = { me: name, readyState: 1, lastMsg: actionLast.get(name) || 0, send(data) { const m = JSON.parse(data); if (m.type === 'error') errors.push(m.text); } };
        safely(() => handleMessage(pseudo, j));
        actionLast.set(name, pseudo.lastMsg);
        json(res, errors.length ? 400 : 200, { ok: !errors.length, errors });
      }).catch(() => { if (!res.headersSent) json(res, 500, { ok: false, errors: ['error interno'] }); });
      return;
    }
    if (url.pathname === '/api/avatar') {
      if (req.method === 'POST') { handleAvatarPost(req, res).catch(() => { if (!res.headersSent) json(res, 500, { ok: false, errors: ['error interno'] }); }); return; }
      const name = nameForToken(url.searchParams.get('t'));
      if (!name) return json(res, 401, { ok: false, errors: ['token inválido'] });
      return json(res, 200, avatarInfo(name));
    }
    if (req.method === 'GET' && url.pathname === '/api/avatar.svg') {
      const name = url.searchParams.get('name');
      if (!name || !teamNames().includes(name)) return reply(res, 404, 'no encontrado');
      const u = getUser(name);
      const svg = (u.custom ? Sprites.customSVG(u.custom, name) : Sprites.avatarSVG(u.avatar, name))
        .replace('<svg ', '<svg width="216" height="312" style="background:#c9d6df" ');
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-cache' });
      return res.end(svg);
    }
    if (req.method === 'GET' && url.pathname === '/sprites.js') {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      fs.createReadStream(path.join(__dirname, 'public', 'sprites.js')).pipe(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/ping') {
      const name = nameForToken(url.searchParams.get('t'));
      if (!name) return reply(res, 401, JSON.stringify({ ok: false, error: 'token inválido' }), 'application/json');
      return reply(res, 200, JSON.stringify({ ok: true, name, version: VERSION, time: now(), ip: net.normalizeIp(req.socket.remoteAddress) }), 'application/json');
    }
    // la franja de Claude Code pregunta cada pocos segundos (no puede quedarse escuchando /api/stream)
    if (req.method === 'GET' && url.pathname === '/api/estado') {
      if (!nameForToken(url.searchParams.get('t'))) return json(res, 401, { ok: false, errors: ['token inválido'] });
      return json(res, 200, snapshot());
    }
    if (req.method === 'GET' && url.pathname === '/unirse') {
      const t = url.searchParams.get('t');
      const name = nameForToken(t);
      res.writeHead(name ? 200 : 401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(joinPage(name, t, `${url.protocol === 'https:' ? 'https' : 'http'}://${req.headers.host}`));
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      const t = url.searchParams.get('t');
      if (!t) return reply(res, 200, 'ok');
      const name = nameForToken(t);
      return name ? reply(res, 200, 'ok ' + name) : reply(res, 401, 'token inválido');
    }
    const font = req.method === 'GET' && url.pathname.match(/^\/fonts\/([a-z0-9-]+\.woff2)$/);
    if (font) {
      const file = path.join(__dirname, 'public', 'fonts', font[1]);
      if (!fs.existsSync(file)) return reply(res, 404, 'no encontrado');
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=604800' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      fs.createReadStream(INDEX_FILE).pipe(res);
      return;
    }
    reply(res, 404, 'no encontrado');
  });

  // ---------- WebSocket ----------
  wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 4096,
    verifyClient: (info) => allowed(info.req.socket.remoteAddress),
  });

  // Un mensaje raro nunca tiene que tirar la sala de todo el equipo: se registra y se sigue.
  function safely(fn) {
    try { return fn(); } catch (e) { (opts.log || console.error)('La Sala: error procesando un mensaje:', e && e.message); return undefined; }
  }

  // Lo que recibe cualquiera que se conecta (navegador o mini sala de la terminal).
  function greet(ws) {
  ws.send(JSON.stringify({ type: 'hello', catalog: CATALOG, version: VERSION }));
  if (ws.me) {
    const u = getUser(ws.me);
    if (u.lastVisit !== today()) {
      u.lastVisit = today();
      award(u, REWARDS.daily);
      ws.send(JSON.stringify({ type: 'bonus', coins: REWARDS.daily.coins }));
    }
  }
  ws.send(JSON.stringify({ type: 'chat_log', items: chatLog }));
  ws.send(JSON.stringify(meInfo(ws.me)));
  ws.send(JSON.stringify(snapshot()));
  if (ws.me) {
    const g = playingOf(ws.me);
    if (g) ws.send(JSON.stringify({ type: 'game', game: games.publicView(g) }));
    for (const inv of invites.values()) if (inv.to === ws.me) ws.send(JSON.stringify({ type: 'invited', id: inv.id, from: inv.from, game: inv.game }));
  }
    changed();
  }

  // Mensajes de un cliente ya identificado: navegador (WebSocket) o mini sala (/api/action).
  function handleMessage(ws, m) {
    const u = getUser(ws.me);
    const t = now();

    switch (m.type) {
      case 'avatar': u.avatar = cleanAvatar(m.avatar); save(); changed(); break;
      case 'custom_clear': u.custom = null; save(); changed(); break;
      case 'move': {
        const x = Number(m.x), y = Number(m.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const cx = Math.min(970, Math.max(30, x));
        u.pos = { x: cx, y: Math.min(cx > 560 ? 400 : 605, Math.max(150, y)) }; // la sala de juegos se llena sola
        save(); changed(); break;
      }
      case 'hide': u.hidden = !!m.hidden; save(); changed(); break;
      case 'chat':
      case 'emote': {
        if (t - ws.lastMsg < 800) return;
        ws.lastMsg = t;
        if (u.hidden) return wsError(ws, 'Estás invisible: nadie vería tu mensaje.');
        if (m.type === 'emote') {
          if (CATALOG.emotes.includes(m.emoji)) broadcast({ type: 'chat', name: ws.me, text: m.emoji, emote: true });
        } else {
          const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
          if (text) {
            chatLog.push({ name: ws.me, text, t });
            if (chatLog.length > 40) chatLog.shift();
            broadcast({ type: 'chat', name: ws.me, text, t });
          }
        }
        break;
      }
      case 'pet': {
        let r;
        if (m.action === 'buy') r = pets.buy(u, String(m.item || ''), t);
        else if (m.action === 'cuddle') r = pets.cuddle(u, t);
        else if (m.action === 'config') { pets.configure(u, m); r = { ok: true }; }
        else return;
        if (!r.ok) return wsError(ws, r.error);
        save();
        if (m.action !== 'config' && !u.hidden) {
          const anim = !r.item ? 'love' : r.item.hunger > 0 ? 'eat' : 'play';
          broadcast({ type: 'pet_event', name: ws.me, emoji: r.item ? r.item.emoji : '💖', anim });
        }
        changed();
        break;
      }
      case 'invite': handleInvite(ws, m); break;
      case 'invite_reply': handleInviteReply(ws, m); break;
      case 'game': handleGameAction(ws, m); break;
      default: break;
    }
  }

  wss.on('error', () => { /* errores del servidor WebSocket: no tiran la sala */ });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    ws.token = url.searchParams.get('t');
    ws.me = nameForToken(ws.token);
    ws.lastMsg = 0;
    greet(ws);
    changed();

    // Mensajes demasiado grandes o conexiones cortadas: se cierra esa conexión, la sala sigue.
    ws.on('error', () => { try { ws.terminate(); } catch { /* ya cerrada */ } });
    ws.on('message', (raw) => {
      if (!ws.me) return;
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!isObj(m)) return;
      safely(() => handleMessage(ws, m));
    });

    ws.on('close', () => {
      if (ws.me && !webNames().has(ws.me)) onUserGone(ws.me);
      changed();
    });
  });

  function listen(port = Number(process.env.PORT) || 3000, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve(server.address().port));
    });
  }

  async function close() {
    closed = true;
    clearInterval(heartbeat);
    fs.unwatchFile(TEAM_FILE);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    flushSave();
    for (const c of wss.clients) c.terminate();
    for (const c of streams) { clearInterval(c.keepAlive); c.readyState = 3; c.res.end(); }
    streams.clear();
    await new Promise((r) => wss.close(() => r()));
    await new Promise((r) => server.close(() => r()));
  }

  return { listen, close, server, _debug: { sessions, liveGames, invites, db, getUser, snapshot, handleEvent } };
}

module.exports = { createSala, CATALOG, VERSION };

if (require.main === module) {
  const sala = createSala();
  sala.listen().then((port) => {
    const ips = net.interfaces();
    console.log(`\n  La Sala v${VERSION} está abierta 🛋️`);
    console.log(`  Local:  http://localhost:${port}`);
    for (const i of ips) console.log(`  ${i.vpn ? 'VPN: ' : 'Red: '}  http://${i.address}:${port}   (${i.name})${i.vpn ? '  ← probablemente la que va en /sala-setup' : ''}`);
    const allow = process.env.SALA_PERMITIR;
    console.log(allow
      ? `\n  Acceso limitado a: ${allow}`
      : '\n  Acceso: cualquier equipo que llegue a esta PC. Para dejar entrar solo a la VPN usá SALA_PERMITIR (mirá el README).');
    const team = readJSON(path.join(__dirname, 'team.json'), { members: {} });
    if (!Object.keys(team.members || {}).length) console.log('\n  Todavía no hay integrantes. Sumalos con: npm run sumar -- "Nombre"');
    console.log('');
  }).catch((e) => {
    console.error(e.code === 'EADDRINUSE' ? '\n  El puerto ya está en uso. Probá con otro: PORT=3001 npm start\n' : e);
    process.exit(1);
  });
  const shutdown = () => sala.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
