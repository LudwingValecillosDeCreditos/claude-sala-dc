'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/games');
const { startSala, machine, browser, sleep } = require('./helpers');

const first = () => 0; // "random" que hace empezar siempre al primer jugador

describe('Ta-te-ti (lógica)', () => {
  test('gana con tres en línea y marca la línea', () => {
    const g = G.create('tateti', ['A', 'B'], { random: first });
    for (const [p, c] of [['A', 0], ['B', 3], ['A', 1], ['B', 4], ['A', 2]]) assert.ok(G.move(g, p, { cell: c }).ok);
    assert.deepEqual([g.status, g.winner, g.line], ['over', 'A', [0, 1, 2]]);
  });
  test('rechaza jugar fuera de turno, casillas ocupadas o inválidas y a extraños', () => {
    const g = G.create('tateti', ['A', 'B'], { random: first });
    assert.equal(G.move(g, 'B', { cell: 0 }).ok, false);
    G.move(g, 'A', { cell: 4 });
    assert.equal(G.move(g, 'B', { cell: 4 }).ok, false);
    assert.equal(G.move(g, 'B', { cell: 9 }).ok, false);
    assert.equal(G.move(g, 'B', { cell: '1; DROP' }).ok, false);
    assert.equal(G.move(g, 'C', { cell: 1 }).ok, false);
  });
  test('empate con el tablero lleno', () => {
    const g = G.create('tateti', ['A', 'B'], { random: first });
    // A B A / A B B / B A A
    for (const [p, c] of [['A', 0], ['B', 1], ['A', 2], ['B', 4], ['A', 3], ['B', 5], ['A', 7], ['B', 6], ['A', 8]]) assert.ok(G.move(g, p, { cell: c }).ok, `${p}${c}`);
    assert.deepEqual([g.status, g.winner, g.reason], ['over', null, 'empate']);
  });
});

describe('Cuatro en línea (lógica)', () => {
  test('las fichas caen y gana en vertical', () => {
    const g = G.create('cuatro', ['A', 'B'], { random: first });
    for (const [p, c] of [['A', 0], ['B', 1], ['A', 0], ['B', 1], ['A', 0], ['B', 1], ['A', 0]]) assert.ok(G.move(g, p, { col: c }).ok);
    assert.equal(g.board[5 * 7 + 0], 0, 'la primera ficha quedó abajo de todo');
    assert.equal(g.winner, 'A');
    assert.equal(g.line.length, 4);
  });
  test('gana en diagonal', () => {
    const g = G.create('cuatro', ['A', 'B'], { random: first });
    const seq = [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3];
    seq.forEach((c, i) => assert.ok(G.move(g, i % 2 ? 'B' : 'A', { col: c }).ok, `jugada ${i}`));
    assert.equal(g.winner, 'A');
  });
  test('una columna llena no acepta más fichas', () => {
    const g = G.create('cuatro', ['A', 'B'], { random: first });
    for (let i = 0; i < 6; i++) assert.ok(G.move(g, i % 2 ? 'B' : 'A', { col: 3 }).ok);
    assert.equal(G.move(g, 'A', { col: 3 }).error, 'Esa columna está llena');
  });
});

describe('Reflejos (lógica)', () => {
  test('el que se adelanta pierde la ronda', () => {
    const g = G.create('reflejos', ['A', 'B']);
    G.reflejosStartRound(g, () => 0);
    const r = G.reflejosHit(g, 'A', {});
    assert.ok(r.roundOver);
    assert.deepEqual(g.score, [0, 1]);
    assert.equal(g.lastRound.foul, 'A');
  });
  test('gana la ronda el más rápido y la partida el primero en llegar a 2', () => {
    const g = G.create('reflejos', ['A', 'B']);
    for (let i = 0; i < 2; i++) {
      G.reflejosStartRound(g, () => 0);
      assert.ok(G.reflejosGo(g, g.round));
      assert.ok(G.reflejosHit(g, 'B', { ms: 300 }).waiting);
      assert.ok(G.reflejosHit(g, 'A', { ms: 210 }).roundOver);
    }
    assert.deepEqual([g.status, g.winner, g.score], ['over', 'A', [2, 0]]);
  });
  test('tiempos imposibles se recortan y nadie puede tocar dos veces', () => {
    const g = G.create('reflejos', ['A', 'B']);
    G.reflejosStartRound(g, () => 0); G.reflejosGo(g, 1);
    G.reflejosHit(g, 'A', { ms: 5 });
    assert.equal(g.hits[0].ms, G.MIN_REACTION_MS);
    assert.equal(G.reflejosHit(g, 'A', { ms: 100 }).ok, false);
  });
  test('si nadie toca, la ronda queda sin dueño; y lo que ven los jugadores no incluye el tiempo secreto', () => {
    const g = G.create('reflejos', ['A', 'B']);
    G.reflejosStartRound(g, () => 0.5); G.reflejosGo(g, 1);
    G.reflejosResolve(g, 1);
    assert.deepEqual(g.score, [0, 0]);
    assert.equal(G.publicView(g).delay, undefined);
    assert.equal(G.reflejosResolve(g, 1).stale, true, 'una resolución vieja no hace nada');
  });
});

// ---------- partidas reales entre dos navegadores ----------
async function setup(opts) {
  const s = await startSala({ random: first, ...opts });
  const a = await browser(s.port, s.tokens.Ludwing);
  const b = await browser(s.port, s.tokens.Flor);
  await a.waitState((st) => st.users.filter((u) => u.web).length === 2, 3000, 'los dos con la sala abierta');
  return { s, a, b };
}
async function play(a, b, type) {
  a.send({ type: 'invite', to: 'Flor', game: type });
  const inv = await b.next((m) => m.type === 'invited', 3000, 'invitación');
  assert.deepEqual([inv.from, inv.game], ['Ludwing', type]);
  b.send({ type: 'invite_reply', id: inv.id, accept: true });
  const ga = await a.next((m) => m.type === 'game');
  await b.next((m) => m.type === 'game');
  return ga.game;
}

describe('Partidas por red', () => {
  test('ta-te-ti completo: jugadas, ganador, monedas y estadísticas', async () => {
    const { s, a, b } = await setup();
    const coins0 = { L: s.sala._debug.getUser('Ludwing').coins, F: s.sala._debug.getUser('Flor').coins };
    const g = await play(a, b, 'tateti');
    await a.waitState((st) => a.user('Ludwing')?.playing === 'tateti' && st.games.length === 1, 3000, 'figuran jugando');
    for (const [who, cell] of [[a, 0], [b, 3], [a, 1], [b, 4], [a, 2]]) {
      who.send({ type: 'game', id: g.id, action: 'move', cell });
      await a.next((m) => m.type === 'game' && m.game.board[cell] !== null, 3000, 'jugada ' + cell);
    }
    const over = await b.next((m) => m.type === 'game' && m.game.status === 'over');
    assert.equal(over.game.winner, 'Ludwing');
    await a.next((m) => m.type === 'game_over' && m.winner === 'Ludwing');
    const L = s.sala._debug.getUser('Ludwing'), F = s.sala._debug.getUser('Flor');
    assert.equal(L.coins - coins0.L, 13, 'ganador: 10 + 3');
    assert.equal(F.coins - coins0.F, 3, 'perdedor: 3 por jugar');
    assert.deepEqual([L.stats, F.stats], [{ played: 1, wins: 1 }, { played: 1, wins: 0 }]);
    a.close(); b.close(); await s.stop();
  });

  test('cuatro en línea por red y jugada fuera de turno rechazada', async () => {
    const { s, a, b } = await setup();
    const g = await play(a, b, 'cuatro');
    b.send({ type: 'game', id: g.id, action: 'move', col: 0 });
    assert.equal((await b.next((m) => m.type === 'error')).text, 'No es tu turno');
    for (const [who, col] of [[a, 0], [b, 1], [a, 0], [b, 1], [a, 0], [b, 1], [a, 0]]) {
      who.send({ type: 'game', id: g.id, action: 'move', col });
      await b.next((m) => m.type === 'game', 3000);
    }
    assert.equal(b.msgs.filter((m) => m.type === 'game').pop().game.winner, 'Ludwing');
    a.close(); b.close(); await s.stop();
  });

  test('reflejos por red: cada navegador mide su tiempo y gana el más rápido', async () => {
    const { s, a, b } = await setup();
    const auto = (br, ms) => br.ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type === 'game' && m.game.phase === 'go' && !m.game.hits[m.game.players.indexOf(br === a ? 'Ludwing' : 'Flor')]) {
        br.send({ type: 'game', id: m.game.id, action: 'hit', ms });
      }
    });
    auto(a, 180); auto(b, 260);
    await play(a, b, 'reflejos');
    const over = await a.next((m) => m.type === 'game' && m.game.status === 'over', 5000, 'fin de reflejos');
    assert.deepEqual([over.game.winner, over.game.score], ['Ludwing', [2, 0]]);
    a.close(); b.close(); await s.stop();
  });

  test('reflejos: adelantarse le da la ronda al rival', async () => {
    const { s, a, b } = await setup({ timing: { reflejosScale: 1 } }); // espera real de 1,5 s para poder adelantarse
    const g = await play(a, b, 'reflejos');
    await b.next((m) => m.type === 'game' && m.game.phase === 'wait', 3000, 'fase de espera');
    b.send({ type: 'game', id: g.id, action: 'hit', early: true });
    const r = await a.next((m) => m.type === 'game' && m.game.phase === 'result');
    assert.deepEqual([r.game.lastRound.foul, r.game.score], ['Flor', [1, 0]]);
    a.close(); b.close(); await s.stop();
  });

  test('se puede desafiar a alguien mientras su Claude trabaja; no si no tiene la sala abierta', async () => {
    const { s, a, b } = await setup();
    const pc = machine(s.url, s.tokens.Flor);
    await pc.hook('work', { session_id: 'w' });
    await a.waitState(() => a.user('Flor')?.claude === 'working');
    a.send({ type: 'invite', to: 'Flor', game: 'tateti' });
    const inv = await b.next((m) => m.type === 'invited', 3000, 'invitación aunque su Claude trabaje');
    b.send({ type: 'invite_reply', id: inv.id, accept: false });
    b.close();
    await a.waitState(() => a.user('Flor')?.web === false);
    a.send({ type: 'invite', to: 'Flor', game: 'tateti' });
    assert.match((await a.next((m) => m.type === 'error')).text, /no tiene la sala abierta/);
    a.send({ type: 'invite', to: 'Ludwing', game: 'tateti' });
    assert.match((await a.next((m) => m.type === 'error')).text, /vos mismo/);
    pc.cleanup(); a.close(); await s.stop();
  });

  test('invitación rechazada y vencida', async () => {
    const { s, a, b } = await setup();
    a.send({ type: 'invite', to: 'Flor', game: 'cuatro' });
    let inv = await b.next((m) => m.type === 'invited');
    b.send({ type: 'invite_reply', id: inv.id, accept: false });
    assert.equal((await a.next((m) => m.type === 'invite_declined')).by, 'Flor');
    a.send({ type: 'invite', to: 'Flor', game: 'cuatro' });
    inv = await b.next((m) => m.type === 'invited');
    await a.next((m) => m.type === 'invite_expired', 2000, 'vencimiento');
    await b.next((m) => m.type === 'invite_gone' && m.id === inv.id);
    b.send({ type: 'invite_reply', id: inv.id, accept: true });
    assert.match((await b.next((m) => m.type === 'error')).text, /ya no está vigente/);
    a.close(); b.close(); await s.stop();
  });

  test('si alguien se desconecta en plena partida, pierde por abandono', async () => {
    const { s, a, b } = await setup();
    await play(a, b, 'tateti');
    b.close();
    const over = await a.next((m) => m.type === 'game' && m.game.status === 'over', 3000, 'abandono');
    assert.deepEqual([over.game.winner, over.game.reason], ['Ludwing', 'abandono']);
    a.close(); await s.stop();
  });

  test('recargar la página no cuenta como abandono y recupera la partida', async () => {
    const { s, a, b } = await setup({ timing: { disconnectGrace: 800 } });
    const g = await play(a, b, 'tateti');
    b.close();
    await sleep(150);
    const b2 = await browser(s.port, s.tokens.Flor);
    const back = await b2.next((m) => m.type === 'game', 3000, 'partida recuperada');
    assert.equal(back.game.id, g.id);
    await sleep(1000);
    assert.equal(s.sala._debug.liveGames.get(g.id).status, 'playing');
    a.close(); b2.close(); await s.stop();
  });
});
