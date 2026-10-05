'use strict';
// Cómo se conectan las computadoras y los Claude Code con la sala.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startSala, machine, browser, sleep } = require('./helpers');

describe('Conexión de las computadoras y los Claude', () => {
  let s;
  before(async () => { s = await startSala({ members: ['Ludwing', 'Flor', 'Emi'] }); });
  after(() => s.stop());

  test('health y ping identifican a cada uno por su token', async () => {
    assert.equal(await (await fetch(s.url + '/health')).text(), 'ok');
    assert.equal(await (await fetch(`${s.url}/health?t=${s.tokens.Flor}`)).text(), 'ok Flor');
    assert.equal((await fetch(`${s.url}/health?t=inventado`)).status, 401);
    const p = await (await fetch(`${s.url}/api/ping?t=${s.tokens.Emi}`)).json();
    assert.deepEqual([p.ok, p.name, p.version, p.ip], [true, 'Emi', '0.8.1', '127.0.0.1']);
  });

  test('/api/estado da la foto de la sala para la franja de Claude Code', async () => {
    assert.equal((await fetch(`${s.url}/api/estado?t=inventado`)).status, 401);
    await machine(s.url, s.tokens.Flor).hook('start', { session_id: 'franja' });
    const e = await (await fetch(`${s.url}/api/estado?t=${s.tokens.Emi}`)).json();
    assert.equal(e.type, 'state');
    assert.deepEqual(e.team, ['Ludwing', 'Flor', 'Emi']);
    assert.ok(e.users.some((u) => u.name === 'Flor' && u.claude !== 'off'));
  });

  test('la sala sirve sus propias fuentes (anda sin internet) y no deja leer otros archivos', async () => {
    const f = await fetch(s.url + '/fonts/press-start-2p-latin-400-normal.woff2');
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'font/woff2');
    for (const bad of ['/fonts/../server.js', '/fonts/..%2Fserver.js', '/fonts/team.json', '/fonts/nada.woff2']) {
      assert.equal((await fetch(s.url + bad)).status, 404, bad);
    }
    const html = await (await fetch(s.url + '/')).text();
    assert.ok(!html.includes('fonts.googleapis.com'), 'no depende de Google Fonts');
  });

  test('una sesión de Claude: el dueño ve el detalle, los demás solo "trabajando"', async () => {
    const pc = machine(s.url, s.tokens.Ludwing);
    const flor = await browser(s.port, s.tokens.Flor);
    const lud = await browser(s.port, s.tokens.Ludwing);
    const S = { session_id: 'ses-1' };
    const florSees = (pred, label) => flor.waitState(() => pred(flor.user('Ludwing')), 3000, label);
    const ludSees = (pred, label) => lud.next((m) => m.type === 'me' && pred(m.claude), 3000, label);

    let r = await pc.hook('start', S);
    assert.equal(r.code, 0); assert.equal(r.stdout, '', 'el hook nunca debe imprimir');
    await florSees((u) => u && u.claude === 'idle', 'Claude abierto');
    await pc.hook('work', { ...S, prompt: 'arreglá el login' });
    await florSees((u) => u.claude === 'working', 'trabajando');
    await ludSees((c) => c.state === 'working' && c.activity === '💭 pensando' && typeof c.since === 'number', 'el dueño ve el detalle');
    await pc.hook('tool', { ...S, tool_name: 'Edit', tool_input: { file_path: '/secreto.js' } });
    await ludSees((c) => c.activity === '✏️ escribiendo código', 'escribiendo');
    await pc.hook('notify', { ...S, message: 'Claude needs your permission to use Bash' });
    await lud.next((m) => m.type === 'claude_needs_you', 3000, 'aviso al dueño');
    await ludSees((c) => c.state === 'waiting', 'esperando');
    await sleep(100);
    assert.equal(flor.user('Ludwing').claude, 'working', 'para los demás, pedir permiso es solo "trabajando"');
    await pc.hook('tool_done', { ...S, tool_name: 'Bash' });
    await pc.hook('idle', S);
    await lud.next((m) => m.type === 'claude_done', 3000, 'aviso de terminado al dueño');
    await florSees((u) => u.claude === 'idle', 'libre al terminar');
    await pc.hook('end', S);
    await florSees((u) => u && u.claude === 'off', 'Claude cerrado (sigue en la sala porque tiene el navegador abierto)');
    lud.close();
    await florSees((u) => !u, 'se fue de la sala');

    // privacidad: nada de lo que recibió Flor dice qué hizo el Claude de Ludwing ni cuánto tardó
    const raw = JSON.stringify(flor.msgs.filter((m) => m.type !== 'me')); // lo de su propio Claude sí lo puede ver
    for (const leak of ['escribiendo', 'pensando', 'terminal', 'aprobación', 'activity', 'since', 'mins', 'claude_needs_you', 'claude_done']) {
      assert.ok(!raw.includes(leak), `Flor no debería recibir "${leak}"`);
    }
    flor.close(); pc.cleanup();
  });

  test('el aviso de "esperando tu mensaje" no se toma como pedido de permiso', async () => {
    const pc = machine(s.url, s.tokens.Emi);
    await pc.hook('work', { session_id: 'e1' });
    await pc.hook('notify', { session_id: 'e1', message: 'Claude is waiting for your input' });
    await sleep(100);
    assert.equal(s.sala._debug.snapshot().users.find((u) => u.name === 'Emi').claude, 'working');
    await pc.hook('end', { session_id: 'e1' }); pc.cleanup();
  });

  test('usar más Claude no da monedas: la sala no premia la productividad', async () => {
    let t = Date.now();
    const s2 = await startSala({ now: () => t });
    const u = s2.sala._debug.getUser('Flor');
    const c0 = u.coins;
    for (let i = 0; i < 30; i++) s2.sala._debug.handleEvent('Flor', 'f1', 'tool', 'Read');
    assert.equal(u.coins, c0, 'las herramientas no suman');
    // una tarea terminada suma poquito, con tope diario
    for (let i = 0; i < 10; i++) {
      s2.sala._debug.handleEvent('Flor', 'f1', 'work', '');
      t += 61e3;
      s2.sala._debug.handleEvent('Flor', 'f1', 'idle', '');
    }
    assert.equal(u.coins - c0, 10, 'tope de 10 monedas por día por tareas');
    t += 24 * 3600e3;
    s2.sala._debug.handleEvent('Flor', 'f1', 'work', ''); t += 61e3; s2.sala._debug.handleEvent('Flor', 'f1', 'idle', '');
    assert.equal(u.coins - c0, 12, 'al otro día vuelve a sumar');
    await s2.stop();
  });

  test('dos terminales de la misma persona: se muestra la más ocupada', async () => {
    const pc = machine(s.url, s.tokens.Ludwing);
    await pc.hook('start', { session_id: 'A' });
    await pc.hook('work', { session_id: 'B' });
    const st = () => s.sala._debug.snapshot().users.find((u) => u.name === 'Ludwing');
    assert.equal(st().claude, 'working');
    await pc.hook('end', { session_id: 'B' });
    assert.equal(st().claude, 'idle', 'queda la otra terminal, libre');
    await pc.hook('end', { session_id: 'A' });
    assert.equal(st(), undefined);
    pc.cleanup();
  });

  test('si el servidor está apagado o no hay VPN, el hook no traba a Claude', async () => {
    for (const url of ['http://127.0.0.1:1', 'http://10.255.255.1:3000']) {
      const pc = machine(url, s.tokens.Ludwing);
      const r = await pc.hook('work', { session_id: 'x', prompt: 'hola' });
      assert.equal(r.code, 0, url);
      assert.equal(r.stdout + r.stderr, '', url);
      assert.ok(r.ms < 3000, `tardó ${r.ms} ms con ${url}`);
      pc.cleanup();
    }
  });

  test('token incorrecto: el hook sale limpio y el servidor no registra nada', async () => {
    const pc = machine(s.url, 'token-falso');
    const r = await pc.hook('work', { session_id: 'z' });
    assert.equal(r.code, 0);
    assert.ok(![...s.sala._debug.sessions.keys()].some((k) => k.endsWith('::z')));
    pc.cleanup();
  });

  test('sin configurar (/sala-setup nunca corrido) el hook no hace nada', async () => {
    const pc = machine(s.url, s.tokens.Ludwing);
    require('fs').rmSync(require('path').join(pc.home, '.claude-sala.json'));
    const r = await pc.hook('work', { session_id: 'nc' });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
    pc.cleanup();
  });

  test('alguien nuevo se suma sin reiniciar el servidor', async () => {
    const token = s.addMember('Caro');
    await sleep(500); // el servidor relee team.json solo
    const pc = machine(s.url, token);
    const ludwing = await browser(s.port, s.tokens.Ludwing);
    await pc.hook('work', { session_id: 'c1' });
    await ludwing.waitState((st) => st.team.includes('Caro') && ludwing.user('Caro')?.claude === 'working', 3000, 'Caro trabajando');
    await pc.hook('end', { session_id: 'c1' });
    ludwing.close(); pc.cleanup();
  });

  test('el navegador se reconecta y conserva la identidad', async () => {
    let b = await browser(s.port, s.tokens.Flor);
    await b.next((m) => m.type === 'me' && m.name === 'Flor');
    b.close();
    await sleep(50);
    b = await browser(s.port, s.tokens.Flor);
    const me = await b.next((m) => m.type === 'me');
    assert.equal(me.name, 'Flor');
    assert.equal(typeof me.coins, 'number');
    b.close();
  });

  test('un navegador sin token es espectador y no puede modificar nada', async () => {
    const spy = await browser(s.port, null);
    const me = await spy.next((m) => m.type === 'me');
    assert.equal(me.name, null);
    const view = () => JSON.stringify(Object.entries(s.sala._debug.db.users).map(([n, u]) => [n, u.avatar, u.custom, u.hidden, u.pos, u.coins, u.pet.kind, u.pet.name]));
    const before = view();
    spy.send({ type: 'avatar', avatar: { species: 'alien' } });
    spy.send({ type: 'chat', text: 'hola' });
    await sleep(100);
    assert.equal(view(), before);
    spy.close();
  });
});

describe('Invitación, bono diario e historial de chat', () => {
  test('la página de invitación saluda por nombre y trae el comando listo; un token falso no', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const r = await fetch(`${s.url}/unirse?t=${s.tokens.Flor}`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /¡Hola, Flor!/);
    assert.ok(html.includes(`http://127.0.0.1:${s.port}`) && html.includes(s.tokens.Flor), 'trae la dirección y su token');
    assert.equal((await fetch(`${s.url}/unirse?t=falso`)).status, 401);
    const evil = await (await fetch(`${s.url}/unirse?t=%3Cscript%3E`)).text();
    assert.ok(!evil.includes('<script>'));
  });

  test('bono por pasar por la sala una vez por día y historial de los últimos mensajes', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const a = await browser(s.port, s.tokens.Flor);
    assert.equal((await a.next((m) => m.type === 'bonus')).coins, 10);
    a.send({ type: 'chat', text: 'hola equipo' });
    await a.next((m) => m.type === 'chat' && m.text === 'hola equipo');
    a.close();
    const b = await browser(s.port, s.tokens.Flor);
    const log = await b.next((m) => m.type === 'chat_log');
    assert.equal(log.items.at(-1).text, 'hola equipo');
    await sleep(100);
    assert.ok(!b.msgs.some((m) => m.type === 'bonus'), 'el bono es uno por día');
    b.close();
  });
});

describe('Varias computadoras al mismo tiempo', () => {
  test('10 personas con Claude mandando eventos en paralelo', async (t) => {
    const names = Array.from({ length: 10 }, (_, i) => `Dev${i + 1}`);
    const s = await startSala({ members: names });
    const pcs = names.map((n) => machine(s.url, s.tokens[n]));
    const viewer = await browser(s.port, null);
    t.after(async () => { viewer.close(); pcs.forEach((p) => p.cleanup()); await s.stop(); });
    await Promise.all(pcs.map(async (pc, i) => {
      const S = { session_id: 'p' + i };
      await pc.hook('start', S);
      await pc.hook('work', S);
      await Promise.all(['Read', 'Edit', 'Bash'].map((t) => pc.hook('tool', { ...S, tool_name: t })));
    }));
    await viewer.waitState((st) => st.users.length === 10 && st.users.every((u) => u.claude === 'working'), 15000, '10 trabajando');
    await Promise.all(pcs.map((pc, i) => pc.hook('idle', { session_id: 'p' + i })));
    await viewer.waitState((st) => st.users.every((u) => u.claude === 'idle'), 15000, '10 libres');
  });
});

describe('Cuando Claude se cierra de golpe', () => {
  test('"trabajando" se limpia solo, después pasa a ausente y al final desaparece', async () => {
    let t = Date.now();
    const s = await startSala({ now: () => t });
    s.sala._debug.handleEvent('Flor', 'k', 'work', '');
    const st = () => s.sala._debug.snapshot().users.find((u) => u.name === 'Flor');
    assert.equal(st().claude, 'working');
    t += 10 * 60e3; assert.equal(st().claude, 'working', 'una tarea larga sin eventos sigue figurando trabajando');
    t += 11 * 60e3; assert.deepEqual([st().claude, st().away], ['idle', true], 'a los 20 min sin eventos deja de figurar trabajando y queda descansando');
    t += 4 * 3600e3; assert.equal(st(), undefined);
    await s.stop();
  });
});

describe('Privacidad del hook', () => {
  test('solo viajan evento, sesión, token y nombre de herramienta; con modo invisible no viaja nada', async () => {
    const got = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push(JSON.parse(b)); res.end(); }); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}`;
    const pc = machine(url, 'tok');
    await pc.hook('work', { session_id: 's', prompt: 'mi contraseña es 1234', cwd: '/home/yo/proyecto-secreto', transcript_path: '/tmp/t.jsonl' });
    await pc.hook('tool', { session_id: 's', tool_name: 'Write', tool_input: { file_path: '/home/yo/.env', content: 'API_KEY=xyz' } });
    assert.equal(got.length, 2);
    for (const body of got) {
      assert.deepEqual(Object.keys(body).sort(), body.tool ? ['event', 'session', 'token', 'tool'] : ['event', 'session', 'token']);
      const raw = JSON.stringify(body);
      for (const secret of ['1234', 'proyecto-secreto', '.env', 'API_KEY', 'transcript']) assert.ok(!raw.includes(secret), secret);
    }
    pc.setConfig({ invisible: true });
    await pc.hook('work', { session_id: 's' });
    assert.equal(got.length, 2, 'invisible no manda nada');
    pc.cleanup();
    srv.close();
  });
});

describe('Detalles de tiempo', () => {
  test('el bono diario usa el día local del servidor, y "me" trae la hora del servidor para corregir relojes', async (t) => {
    // 23:30 hora local: en UTC-3 ya sería "mañana", pero el día local es el mismo
    let now = new Date(2026, 9, 3, 23, 30).getTime();
    const s = await startSala({ now: () => now });
    t.after(() => s.stop());
    const a = await browser(s.port, s.tokens.Flor);
    assert.equal((await a.next((m) => m.type === 'bonus')).coins, 10);
    const me = await a.next((m) => m.type === 'me');
    assert.equal(me.serverTime, now);
    a.close();
    now = new Date(2026, 9, 3, 23, 59).getTime();
    const b = await browser(s.port, s.tokens.Flor);
    await b.next((m) => m.type === 'me');
    await sleep(80);
    assert.ok(!b.msgs.some((m) => m.type === 'bonus'), 'mismo día local: sin segundo bono');
    b.close();
    now = new Date(2026, 9, 4, 0, 1).getTime();
    const c = await browser(s.port, s.tokens.Flor);
    await c.next((m) => m.type === 'bonus', 2000, 'nuevo día local: bono de nuevo');
    c.close();
  });

  test('la invitación le dice al otro cuánto tiempo tiene para aceptar', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const a = await browser(s.port, s.tokens.Ludwing);
    const b = await browser(s.port, s.tokens.Flor);
    await a.waitState((st) => st.users.filter((u) => u.web).length === 2);
    a.send({ type: 'invite', to: 'Flor', game: 'tateti' });
    assert.equal(typeof (await b.next((m) => m.type === 'invited')).expiresIn, 'number');
    a.close(); b.close();
  });
});
