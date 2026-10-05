'use strict';
// Mini sala en la terminal: conexión por stream, acciones, dibujo y separación de personajes.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { startSala, browser, sleep } = require('./helpers');
const M = require('../../plugin/scripts/mini.js');

const PLUGIN = path.join(__dirname, '..', '..', 'plugin', 'scripts');
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

// Cliente de stream como el de la mini sala
function stream(port, token) {
  const msgs = [];
  let res0;
  const req = http.get(`http://127.0.0.1:${port}/api/stream?t=${token}`, (res) => {
    res0 = res;
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2);
        const d = ev.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
        if (d) msgs.push(JSON.parse(d));
      }
    });
  });
  return {
    msgs, status: () => res0 && res0.statusCode,
    async next(pred, ms = 3000) { const end = Date.now() + ms; while (Date.now() < end) { const m = msgs.find(pred); if (m) return m; await sleep(20); } throw new Error('timeout en stream'); },
    close() { req.destroy(); },
  };
}
const act = (s, body) => fetch(`${s.url}/api/action`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => { const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch { j = { text: txt }; } return { status: r.status, ...j }; });

describe('Servidor: mini sala', () => {
  test('la mini sala recibe la sala en vivo y cuenta como presente en la sala grande', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const flor = await browser(s.port, s.tokens.Flor);
    t.after(() => flor.close());
    const lud = stream(s.port, s.tokens.Ludwing);
    t.after(() => lud.close());
    await lud.next((m) => m.type === 'hello');
    assert.equal((await lud.next((m) => m.type === 'me')).name, 'Ludwing');
    await flor.waitState(() => flor.user('Ludwing')?.mini === true && flor.user('Ludwing')?.web === false, 3000, 'Ludwing en la mini');
    lud.close();
    await flor.waitState(() => !flor.user('Ludwing'), 3000, 'se fue al cerrar la terminal');
  });

  test('desde la terminal se mandan emotes, mensajes y mimos; nada más', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const flor = await browser(s.port, s.tokens.Flor);
    t.after(() => flor.close());
    const T = s.tokens.Ludwing;
    assert.equal((await act(s, { token: T, type: 'emote', emoji: '🔥' })).ok, true);
    assert.equal((await flor.next((m) => m.type === 'chat' && m.emote)).text, '🔥');
    await sleep(850); // anti spam
    assert.equal((await act(s, { token: T, type: 'chat', text: 'ya vuelvo' })).ok, true);
    assert.equal((await flor.next((m) => m.type === 'chat' && !m.emote)).text, 'ya vuelvo');
    assert.equal((await act(s, { token: T, type: 'pet', action: 'cuddle' })).ok, true);
    assert.equal((await flor.next((m) => m.type === 'pet_event')).anim, 'love');
    // demasiado rápido: el anti spam también aplica a la terminal
    const fast = await act(s, { token: T, type: 'emote', emoji: '👋' });
    const fast2 = await act(s, { token: T, type: 'emote', emoji: '👋' });
    assert.ok(fast.ok || fast2.ok);
    for (const bad of [{ type: 'avatar', avatar: { species: 'alien' } }, { type: 'hide', hidden: true }, { type: 'invite', to: 'Flor', game: 'tateti' }, { type: 'move', x: 1, y: 1 }]) {
      const r = await act(s, { token: T, ...bad });
      assert.equal(r.status, 400, bad.type);
    }
    assert.equal((await act(s, { token: 'falso', type: 'emote', emoji: '🔥' })).status, 401);
    assert.equal((await act(s, { token: T, type: 'emote', emoji: '💩' })).ok, true, 'un emote fuera de la lista no hace nada, pero no rompe');
  });

  test('a alguien que solo está en la mini no se lo puede desafiar, y se explica por qué', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const lud = stream(s.port, s.tokens.Ludwing);
    t.after(() => lud.close());
    await lud.next((m) => m.type === 'me');
    const flor = await browser(s.port, s.tokens.Flor);
    t.after(() => flor.close());
    await flor.waitState(() => flor.user('Ludwing')?.mini);
    flor.send({ type: 'invite', to: 'Ludwing', game: 'tateti' });
    assert.match((await flor.next((m) => m.type === 'error')).text, /mini sala de la terminal/);
  });

  test('la lista blanca de la VPN también cubre a la mini sala', async (t) => {
    const s = await startSala({ allow: '10.99.0.0/16' });
    t.after(() => s.stop());
    const r = await fetch(`${s.url}/api/stream?t=${s.tokens.Flor}`);
    assert.equal(r.status, 403);
    assert.equal((await act(s, { token: s.tokens.Flor, type: 'emote', emoji: '🔥' })).status, 403);
  });
});

describe('Mini sala: dibujo', () => {
  const users = [
    { name: 'Ludwing', mini: true, claude: 'working', avatar: { species: 'humano', skin: '#f1c27d', top: 'buzo', topColor: '#264653', hat: 'auriculares', extra: 'anteojos' }, pet: { kind: 'perrito' } },
    { name: 'Flor', web: true, claude: 'idle', avatar: { species: 'gato', skin: '#e9e4da', top: 'vestido', topColor: '#ff8fab', hat: 'lazo', extra: 'collar' }, pet: { kind: 'slime' } },
    { name: 'Emi', claude: 'working', avatar: { species: 'perro' } },
  ];
  const model = (o) => ({ cols: 100, compact: true, truecolor: true, me: 'Ludwing', meInfo: { claude: { state: 'working', activity: '✏️ escribiendo código', since: Date.now() - 65000 } }, users, ents: [], bubbles: {}, flash: null, doneUntil: 0, now: Date.now(), input: null, connected: true, ...o });

  test('cada fila mide exactamente el ancho de la terminal, con o sin emojis, en los dos tamaños', () => {
    for (const compact of [true, false]) for (const cols of [60, 100, 160]) {
      const m = model({ compact, cols, bubbles: { Flor: { text: '👋', emote: true, until: Date.now() + 9e3 }, Ludwing: { text: 'hola ☕ equipo', until: Date.now() + 9e3 } } });
      M.syncEntities(m, Math.random);
      const lines = M.buildFrame(m);
      assert.equal(lines.length, compact ? 10 : 18);
      for (const l of lines) assert.equal(M.textWidth(strip(l)), cols, `${compact ? 'chico' : 'grande'} ${cols}: ${JSON.stringify(strip(l)).slice(0, 60)}`);
    }
  });

  test('aparecen solo los que están en la sala (navegador o terminal), con su nombre', () => {
    const m = model();
    M.syncEntities(m, Math.random);
    assert.deepEqual(m.ents.map((e) => e.name).sort(), ['Flor', 'Ludwing']);
    const txt = M.buildFrame(m).map(strip).join('\n');
    assert.match(txt, /Ludwing/);
    assert.match(txt, /con Claude trabajando: Emi/);
    assert.match(txt, /Tu Claude: escribiendo código · 1:0\d/);
    assert.ok(!/✏/.test(txt), 'la barra no lleva emojis de ancho dudoso');
  });

  test('los personajes se reparten en lugares distintos y caminan sin salirse', () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ name: 'P' + i, mini: true, avatar: { species: 'humano' } }));
    const m = model({ users: many, cols: 160 });
    M.syncEntities(m, Math.random);
    const xs = m.ents.map((e) => e.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 10 + 10 + 4 - 0.01, `separados: ${xs.map(Math.round)}`);
    for (let i = 0; i < 400; i++) { m.now += 125; M.stepWorld(m, Math.random); }
    for (const e of m.ents) assert.ok(e.x >= 0 && e.x <= m.cols - 10, `dentro: ${e.x}`);
  });

  test('utilidades: achicar sprites, colores para terminales sin truecolor y recortes', () => {
    const g = [['a', 'a', 'b', 'b'], ['a', 'a', 'b', 'b'], [null, null, 'c', 'c'], [null, null, 'c', 'c']];
    assert.deepEqual(M.shrink(g), [['a', 'b'], [null, 'c']]);
    assert.deepEqual(M.mirror([['a', 'b', null]]), [[null, 'b', 'a']]);
    assert.deepEqual(M.shrinkRows(['SSSS', 'SESS', '..TT', '..TT']), ['ES', '.T'], 'los ojos no se pierden al achicar');
    assert.equal(M.rgbTo256([0, 0, 0]), 16);
    assert.equal(M.rgbTo256([255, 255, 255]), 231);
    assert.equal(M.rgbTo256([128, 128, 128]), 244);
    assert.equal(M.textWidth('a🔥b☕'), 6);
    assert.equal(M.fitText('🔥🔥🔥🔥', 5), '🔥🔥…');
    assert.equal(M.fitText('hola', 10), 'hola');
    assert.ok(!/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/.test(M.fitText('ab🔥🔥🔥', 4).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')), 'sin medios emojis');
  });

  test('si la terminal es muy angosta, avisa en vez de romperse', () => {
    assert.match(M.buildFrame(model({ cols: 30 }))[0], /más ancha/);
  });
});

describe('Plugin: mini sala', () => {
  test('el motor de sprites del plugin es idéntico al del servidor', () => {
    assert.equal(fs.readFileSync(path.join(PLUGIN, 'sprites.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'public', 'sprites.js'), 'utf8'));
  });

  test('al abrir Claude, el hook anota dónde está la mini sala sin tocar el resto de la configuración ni imprimir nada', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
    const cfg = path.join(home, '.claude-sala.json');
    fs.writeFileSync(cfg, JSON.stringify({ url: 'http://127.0.0.1:1', token: 'x', invisible: false }));
    const out = await new Promise((res) => {
      const env = { ...process.env, HOME: home, USERPROFILE: home };
      delete env.SALA_URL; delete env.SALA_TOKEN;
      const c = execFile(process.execPath, [path.join(PLUGIN, 'report.js'), 'start'], { env }, (e, so, se) => res(so + se));
      c.stdin.end('{"session_id":"a"}');
    });
    assert.equal(out, '');
    const saved = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    assert.deepEqual([saved.url, saved.token, saved.invisible], ['http://127.0.0.1:1', 'x', false]);
    assert.equal(saved.mini, path.join(PLUGIN, 'mini.js'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('sin configurar, la mini sala explica qué hacer', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
    const out = await new Promise((res) => {
      const env = { ...process.env, HOME: home, USERPROFILE: home };
      delete env.SALA_URL; delete env.SALA_TOKEN;
      execFile(process.execPath, [path.join(PLUGIN, 'mini.js')], { env }, (e, so) => res(so));
    });
    assert.match(out, /no está configurada/);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

test('la mini usa el mismo motor que la sala grande: con luz, sombra y contorno, y cuadros distintos al caminar', () => {
  const u = { name: 'X', avatar: { species: 'humano', hair: 'rulos', hairColor: '#e8c170', skin: '#f1c27d', top: 'remera', topColor: '#4f5bd5', hat: 'ninguno', extra: 'ninguno' } };
  const quieto = M.avatarColors(u, 'quieto', false), paso = M.avatarColors(u, 'paso1', false);
  assert.equal(quieto.length, 26); assert.equal(quieto[0].length, 18);
  assert.notDeepEqual(quieto, paso);
  const colores = new Set(quieto.flat().filter(Boolean));
  assert.ok(colores.size > 12, `con luz y sombra hay más tonos que en la paleta (${colores.size})`);
});

test('el tiempo de "tu Claude está trabajando" no depende de que los relojes de las PCs coincidan', () => {
  const serverNow = Date.now() + 10 * 60e3; // el reloj del servidor va 10 minutos adelantado
  const m = {
    cols: 100, compact: true, truecolor: true, me: 'Yo', users: [], ents: [], bubbles: {}, flash: null, doneUntil: 0,
    now: Date.now(), input: null, connected: true, offset: serverNow - Date.now(),
    meInfo: { claude: { state: 'working', activity: 'leyendo', since: serverNow - 65e3 } },
  };
  assert.match(M.buildFrame(m).map(strip)[0], /Tu Claude: leyendo · 1:0[45]/);
});

test('si estás en modo invisible, la mini te lo recuerda', () => {
  const m = { cols: 100, compact: true, truecolor: true, me: 'Yo', users: [], ents: [], bubbles: {}, flash: null, doneUntil: 0, now: Date.now(), input: null, connected: true, meInfo: { hidden: true, claude: { state: 'idle' } } };
  assert.match(M.buildFrame(m).map(strip)[0], /Estás invisible/);
});

test('franja de Claude Code: tres tamaños (5, 7 y 12 filas), sin piso, mascotas chicas bien dibujadas y la cara quieta al parpadear', () => {
  const Sprites = require('../../plugin/scripts/sprites.js');
  for (const [kind, frames] of Object.entries(M.TINY_PETS)) {
    assert.ok(Sprites.PETS[kind], kind);
    const pal = Sprites.petPal(kind);
    for (const rows of Object.values(frames)) {
      assert.ok(rows.every((r) => r.length === rows[0].length), `${kind}: filas del mismo ancho`);
      for (const ch of rows.join('')) assert.ok(ch === '.' || pal[ch], `${kind}: color ${ch}`);
    }
  }
  const u = { avatar: { species: 'humano', hair: 'corto', top: 'remera' } };
  const q = Sprites.spriteGrid(u, 'quieto').rows;
  assert.equal(M.chibiRows(Sprites.spriteGrid(u, 'parpadeo').rows, q).length, M.chibiRows(q).length);
  const m = { cols: 80, compact: true, franja: true, truecolor: true, me: 'Ana', meInfo: null, ents: [], bubbles: {}, flash: null, doneUntil: 0, now: Date.now(), input: null, connected: true,
    users: [{ name: 'Ana', web: true, claude: 'working', avatar: u.avatar, pet: { kind: 'perrito' } }] };
  for (const [tam, filas, conNombre] of [['chica', 5, true], ['mediana', 7, true], ['grande', 12, false]]) {
    const mt = { ...m, tam, ents: [] };
    M.syncEntities(mt);
    const lines = M.buildFrame(mt);
    assert.equal(lines.length, filas, tam);
    assert.equal(lines.map(strip).join('').includes(M.tiny('Ana')), conNombre, `${tam}: nombre`);
  }
});
