'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/pets');
const { startSala, browser } = require('./helpers');

const H = 3600e3;
const user = (coins = 100) => ({ coins, pet: P.newPet(0) });

describe('Mascota (lógica)', () => {
  test('pierde panza y ánimo despacito, sin bajar de 0', () => {
    const u = user();
    P.tick(u.pet, 5 * H);
    assert.deepEqual([u.pet.hunger, u.pet.happy], [60, 65]);
    P.tick(u.pet, 100 * H);
    assert.deepEqual([u.pet.hunger, u.pet.happy], [0, 0]);
    assert.equal(P.mood(u.pet), 'hambre');
  });
  test('comprar descuenta monedas, no pasa de 100 y avisa si no alcanza', () => {
    const u = user(30);
    assert.ok(P.buy(u, 'pizza', 0).ok);
    assert.deepEqual([u.coins, u.pet.hunger, u.pet.happy], [5, 100, 85]);
    assert.match(P.buy(u, 'galletita', 0).error, /Te faltan 5/);
    u.coins = 50;
    assert.match(P.buy(u, 'galletita', 0).error, /llena/);
    assert.equal(u.coins, 50, 'no cobra si no se pudo');
    assert.equal(P.buy(u, 'caviar', 0).ok, false);
  });
  test('los mimos tienen un minuto de espera', () => {
    const u = user();
    assert.ok(P.cuddle(u, 1000).ok);
    assert.equal(P.cuddle(u, 30e3).ok, false);
    assert.ok(P.cuddle(u, 62e3).ok);
  });
  test('el nombre se limpia y el tipo tiene que existir', () => {
    const u = user();
    P.configure(u, { kind: 'dragón', name: '   Michi   el   gato con nombre larguísimo ' });
    assert.deepEqual([u.pet.kind, u.pet.name], ['perrito', 'Michi el gato']);
    P.configure(u, { kind: 'slime' });
    assert.equal(u.pet.kind, 'slime');
  });
});

describe('Mascota por red', () => {
  test('las monedas se ganan pasando por la sala y jugando, se gastan en la tienda; los demás ven a la mascota comer', async () => {
    const s = await startSala();
    const a = await browser(s.port, s.tokens.Ludwing);
    const b = await browser(s.port, s.tokens.Flor);
    await a.next((m) => m.type === 'bonus');
    const me0 = await a.next((m) => m.type === 'me' && m.coins === 30, 3000, '20 iniciales + 10 del día');
    assert.equal(me0.level, undefined, 'sin niveles');
    a.send({ type: 'pet', action: 'buy', item: 'torta' });
    assert.match((await a.next((m) => m.type === 'error')).text, /Te faltan 30/);
    a.send({ type: 'pet', action: 'buy', item: 'pizza' });
    const after = await a.next((m) => m.type === 'me' && m.coins === 5, 3000, 'pagó la pizza');
    assert.equal(after.pet.hunger, 100);
    const ev = await b.next((m) => m.type === 'pet_event');
    assert.deepEqual([ev.emoji, ev.anim], ['🍕', 'eat']);
    a.send({ type: 'pet', action: 'buy', item: 'pelota' });
    assert.match((await a.next((m) => m.type === 'error')).text, /Te faltan 15/);
    a.send({ type: 'pet', action: 'cuddle' });
    assert.equal((await b.next((m) => m.type === 'pet_event')).anim, 'love');
    a.send({ type: 'pet', action: 'config', kind: 'gatito', name: 'Michi' });
    await b.waitState(() => b.user('Ludwing')?.pet.kind === 'gatito' && b.user('Ludwing')?.pet.name === 'Michi');
    a.close(); b.close(); await s.stop();
  });

  test('los datos de v0.1 se migran solos (monedas, mascota y estadísticas)', async () => {
    const fs = require('fs'), path = require('path'), os = require('os');
    const { createSala } = require('../server');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({ members: { t1: 'Viejo' } }));
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ users: { Viejo: { avatar: { species: 'gato' }, xp: 40, hidden: false, pos: { x: 700, y: 300 } } } }));
    const sala = createSala({ dataDir: dir });
    const u = sala._debug.getUser('Viejo');
    assert.deepEqual([u.xp, u.coins, u.stats.played, typeof u.pet.hunger, u.avatar.species], [40, 20, 0, 'number', 'gato']);
    await sala.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
