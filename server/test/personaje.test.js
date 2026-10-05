'use strict';
// Personaje: catálogo completo, diseños hechos con IA desde Claude Code y su validación.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Sprites = require('../public/sprites.js');
const { startSala, browser } = require('./helpers');

// Un diseño como el que dibujaría Claude: astronauta con casco
const ASTRONAUTA = {
  rows: [
    '................', '.....GGGGGG.....', '....GWWWWWWG....', '...GWBBBBBBWG...', '...GWBSSSSBWG...', '...GWBSESESBWG..'.slice(0, 16),
    '...GWBSSSSBWG...', '...GWBBBBBBWG...', '....GWWWWWWG....', '.....GGGGGG.....', '......WWWW......', '....WWWWWWWW....',
    '...WWWRRWWWWW...', '..WWWWRRWWWWWW..', '..WW.WWWWWW.WW..', '..WW.WWOOWW.WW..', '..GG.WWWWWW.GG..', '.....WWWWWW.....',
    '.....WW..WW.....', '.....WW..WW.....', '.....WW..WW.....', '.....WW..WW.....', '....GGG..GGG....', '....GGG..GGG....'],
  palette: { G: '#566c86', W: '#f4f4f4', B: '#29366f', S: '#f1c27d', E: '#1a1c2c', R: '#b13e53', O: '#ffcd75' },
};

describe('Sprites', () => {
  test('todas las combinaciones del editor generan un sprite válido de 16x24', () => {
    let n = 0;
    for (const species of Sprites.CATALOG.species) for (const top of Sprites.CATALOG.tops) for (const hat of Sprites.CATALOG.hats) for (const extra of Sprites.CATALOG.extras) {
      const g = Sprites.avatarGrid({ species, top, hat, extra, skin: '#8ecae6', topColor: '#e63946' });
      const v = Sprites.validateCustom(g);
      assert.ok(v.ok, `${species}/${top}/${hat}/${extra}: ${v.errors && v.errors[0]}`);
      n++;
    }
    assert.ok(n > 2000);
  });

  test('todas las combinaciones con peinados y cuadros de animación (quieto, parpadeo, pasos) son válidas', () => {
    let n = 0;
    for (const species of Sprites.CATALOG.species) for (const top of Sprites.CATALOG.tops) for (const hat of Sprites.CATALOG.hats) for (const extra of Sprites.CATALOG.extras) for (const hair of Sprites.CATALOG.hairs) for (const frame of Sprites.FRAMES) {
      const v = Sprites.validateCustom(Sprites.avatarGrid({ species, top, hat, extra, hair, hairColor: '#e8c170', skin: '#c68642', topColor: '#2a9d8f' }, frame));
      assert.ok(v.ok, `${species}/${top}/${hat}/${extra}/${hair}/${frame}: ${v.errors && v.errors[0]}`);
      n++;
    }
    assert.ok(n > 60000);
  });

  test('parpadear cierra solo los ojos y caminar levanta un pie por vez, también en diseños de IA', () => {
    const a = { species: 'humano', hair: 'corto', top: 'remera', hat: 'ninguno', extra: 'ninguno', skin: '#f1c27d', topColor: '#4f5bd5' };
    const diff = (x, y) => x.rows.map((r, i) => (r !== y.rows[i] ? i : null)).filter((i) => i !== null);
    const q = Sprites.avatarGrid(a, 'quieto');
    assert.deepEqual(diff(q, Sprites.avatarGrid(a, 'parpadeo')), [7]);
    assert.deepEqual(diff(q, Sprites.avatarGrid(a, 'paso1')), [22, 23]);
    assert.notDeepEqual(Sprites.avatarGrid(a, 'paso1').rows, Sprites.avatarGrid(a, 'paso2').rows);
    const c = Sprites.customGrid(ASTRONAUTA, 'paso1');
    assert.ok(Sprites.validateCustom(c).ok);
    assert.notDeepEqual(c.rows, ASTRONAUTA.rows);
    assert.deepEqual(Sprites.customGrid(ASTRONAUTA, 'parpadeo'), ASTRONAUTA, 'los diseños de IA no parpadean');
  });

  test('los personajes guardados antes de los peinados se siguen dibujando (pelo corto castaño)', () => {
    const viejo = { species: 'humano', skin: '#f1c27d', top: 'remera', topColor: '#4f5bd5', hat: 'ninguno', extra: 'ninguno' };
    assert.deepEqual(Sprites.avatarGrid(viejo), Sprites.avatarGrid({ ...viejo, hair: 'corto', hairColor: '#3b2a20' }));
  });

  test('la luz y la sombra no tocan ojos ni detalles oscuros', () => {
    const g = Sprites.renderGrid(['.....', '.SES.', '.SSS.'], { S: '#f1c27d', E: '#1a1c2c' }, { light: true });
    assert.equal(g[2][3], '#1a1c2c', 'el ojo queda igual');
    assert.notEqual(g[2][2], '#f1c27d', 'la piel del borde se ilumina o sombrea');
  });

  test('cada opción del catálogo tiene su dibujo', () => {
    for (const t of Sprites.CATALOG.tops.slice(1)) assert.ok(Sprites.TOPS[t], t);
    for (const h of Sprites.CATALOG.hats.slice(1)) assert.ok(Sprites.HATS[h], h);
    for (const e of Sprites.CATALOG.extras.slice(1)) assert.ok(Sprites.EXTRAS[e], e);
    for (const [name, map] of Object.entries({ ...Sprites.HATS, ...Sprites.EXTRAS })) for (const r of map) assert.equal(r.length, 16, name);
  });

  test('la validación de diseños rechaza todo lo que esté mal y explica qué', () => {
    assert.ok(Sprites.validateCustom(ASTRONAUTA).ok);
    const cases = [
      [{ ...ASTRONAUTA, rows: ASTRONAUTA.rows.slice(1) }, /24 filas/],
      [{ ...ASTRONAUTA, rows: ASTRONAUTA.rows.map((r, i) => (i === 3 ? r + '.' : r)) }, /fila 3 tiene que tener 16/],
      [{ ...ASTRONAUTA, rows: ASTRONAUTA.rows.map((r, i) => (i === 5 ? 'X' + r.slice(1) : r)) }, /"X" \(fila 5\) no está en palette/],
      [{ ...ASTRONAUTA, rows: ASTRONAUTA.rows.map((r, i) => (i === 5 ? '<' + r.slice(1) : r)) }, /Carácter inválido/],
      [{ ...ASTRONAUTA, palette: { ...ASTRONAUTA.palette, W: 'blanco' } }, /#rrggbb/],
      [{ ...ASTRONAUTA, palette: { ...ASTRONAUTA.palette, '..': '#000000' } }, /Clave de color inválida/],
      [{ ...ASTRONAUTA, palette: Object.fromEntries('ABCDEFGHIJKLMNOPQ'.split('').map((k) => [k, '#000000'])) }, /máximo es 16/],
      [{ rows: Array(24).fill('................').map((r, i) => (i === 23 ? '.......W........' : r)), palette: { W: '#ffffff' } }, /al menos 40/],
      [{ ...ASTRONAUTA, rows: [...ASTRONAUTA.rows.slice(0, 23), '................'] }, /última fila/],
      [null, /Falta el diseño/],
    ];
    for (const [c, re] of cases) {
      const v = Sprites.validateCustom(c);
      assert.equal(v.ok, false);
      assert.match(v.errors.join(' | '), re);
    }
  });

  test('los colores no usados se descartan y el SVG no contiene nada inyectable', () => {
    const v = Sprites.validateCustom({ ...ASTRONAUTA, palette: { ...ASTRONAUTA.palette, Z: '#123456' } });
    assert.equal(v.custom.palette.Z, undefined);
    const svg = Sprites.customSVG(v.custom, 'Emi"><script>alert(1)</script>');
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('aria-label="Emi&quot;&gt;&lt;script&gt;'));
  });
});

describe('Personaje con IA desde Claude Code', () => {
  test('flujo completo: Claude lee el personaje, sube un diseño, el resto lo ve y se puede volver al editor', async (t) => {
    const s = await startSala();
    t.after(() => s.stop());
    const flor = await browser(s.port, s.tokens.Flor);
    const T = s.tokens.Ludwing;
    const lud = await browser(s.port, T); // Ludwing con la sala abierta
    t.after(() => { flor.close(); lud.close(); });

    // 1) lo que hace /sala-personaje primero
    const info = await (await fetch(`${s.url}/api/avatar?t=${T}`)).json();
    assert.equal(info.mode, 'editor');
    assert.equal(info.base.rows.length, 24);
    assert.ok(info.rules.length >= 5);
    assert.ok(info.catalog.hats.includes('galera'));
    assert.equal((await fetch(`${s.url}/api/avatar?t=malo`)).status, 401);

    // 2) diseño con errores: el servidor explica qué corregir
    let r = await fetch(`${s.url}/api/avatar`, { method: 'POST', body: JSON.stringify({ token: T, custom: { ...ASTRONAUTA, rows: ASTRONAUTA.rows.slice(2) } }) });
    assert.equal(r.status, 400);
    const err = await r.json();
    assert.match(err.errors[0], /24 filas/);
    assert.ok(err.rules);

    // 3) diseño válido: todos lo ven
    r = await fetch(`${s.url}/api/avatar`, { method: 'POST', body: JSON.stringify({ token: T, custom: ASTRONAUTA }) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).mode, 'ia');
    await flor.next((m) => m.type === 'avatar_ai' && m.name === 'Ludwing', 3000, 'aviso de personaje nuevo');
    await flor.waitState(() => flor.user('Ludwing')?.custom?.rows[1] === ASTRONAUTA.rows[1], 3000, 'Flor ve el astronauta');

    // 4) vista previa para abrir desde la terminal
    const svg = await fetch(`${s.url}/api/avatar.svg?name=Ludwing`);
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.match(await svg.text(), /^<svg width="216"/);
    assert.equal((await fetch(`${s.url}/api/avatar.svg?name=Desconocido`)).status, 404);

    // 5) "más grande el casco": Claude parte del diseño actual
    const again = await (await fetch(`${s.url}/api/avatar?t=${T}`)).json();
    assert.deepEqual(again.base.rows, ASTRONAUTA.rows);

    // 6) pedido que entra en el catálogo: vuelve al editor
    r = await fetch(`${s.url}/api/avatar`, { method: 'POST', body: JSON.stringify({ token: T, avatar: { species: 'gato', hat: 'galera', extra: 'capa' } }) });
    const back = await r.json();
    assert.deepEqual([back.mode, back.avatar.species, back.avatar.hat, back.avatar.extra], ['editor', 'gato', 'galera', 'capa']);
    r = await fetch(`${s.url}/api/avatar`, { method: 'POST', body: JSON.stringify({ token: T, avatar: { hat: 'sombrero-de-mago' } }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).errors[0], /no está en el catálogo/);

    // 7) desde el navegador también se puede volver al editor
    await fetch(`${s.url}/api/avatar`, { method: 'POST', body: JSON.stringify({ token: T, custom: ASTRONAUTA }) });
    await lud.next((m) => m.type === 'me' && m.custom, 3000);
    lud.send({ type: 'custom_clear' });
    await flor.waitState(() => flor.user('Ludwing')?.custom === null, 3000, 'vuelve al editor');
  });

  test('la lista blanca de la VPN también protege la API del personaje', async () => {
    const s = await startSala({ allow: '10.99.0.0/16' });
    assert.equal((await fetch(`${s.url}/api/avatar?t=${s.tokens.Flor}`)).status, 403);
    assert.equal((await fetch(`${s.url}/api/avatar`, { method: 'POST', body: '{}' })).status, 403);
    await s.stop();
  });

  test('un cuerpo gigante no tumba al servidor', async () => {
    const s = await startSala();
    const huge = JSON.stringify({ token: s.tokens.Flor, custom: { rows: Array(5000).fill('x'.repeat(16)), palette: {} } });
    const r = await fetch(`${s.url}/api/avatar`, { method: 'POST', body: huge }).catch(() => null);
    assert.ok(!r || r.status === 400);
    assert.equal(await (await fetch(s.url + '/health')).text(), 'ok');
    await s.stop();
  });
});
