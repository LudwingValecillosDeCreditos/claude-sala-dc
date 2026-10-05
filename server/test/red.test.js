'use strict';
// Acceso por VPN: lista blanca y conexión por IP de red (no localhost), como llegan los compañeros.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const net = require('../lib/net');
const { startSala, machine, browser } = require('./helpers');

const lanIp = net.interfaces()[0]?.address;

describe('Lista blanca (SALA_PERMITIR)', () => {
  test('interpreta rangos, IPs sueltas e IPv4 mapeadas a IPv6', () => {
    const ok = net.parseAllowList('10.8.0.0/24, 100.64.0.0/10, 127.0.0.1');
    assert.equal(ok('10.8.0.77'), true);
    assert.equal(ok('::ffff:10.8.0.77'), true);
    assert.equal(ok('10.8.1.1'), false);
    assert.equal(ok('100.101.5.9'), true, 'rango típico de Tailscale');
    assert.equal(ok('::1'), true, 'localhost IPv6 = 127.0.0.1');
    assert.equal(ok('192.168.0.20'), false);
    assert.equal(ok('fe80::1'), false);
    assert.equal(net.parseAllowList('')('8.8.8.8'), true, 'vacío deja pasar a todos');
    assert.throws(() => net.parseAllowList('10.0.0.0/33'));
    assert.throws(() => net.parseAllowList('cualquiera'));
  });

  test('una IP fuera de la VPN no ve la sala, ni por HTTP ni por WebSocket, y su hook no rompe', async () => {
    const s = await startSala({ allow: '10.99.0.0/16' });
    assert.equal((await fetch(s.url + '/health')).status, 403);
    assert.equal((await fetch(s.url + '/', {})).status, 403);
    await assert.rejects(browser(s.port, s.tokens.Flor));
    const pc = machine(s.url, s.tokens.Flor);
    const r = await pc.hook('work', { session_id: 'q' });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
    assert.equal(s.sala._debug.sessions.size, 0);
    pc.cleanup(); await s.stop();
  });

  test('una IP dentro de la lista blanca entra normal', async () => {
    const s = await startSala({ allow: '127.0.0.1/32' });
    assert.equal(await (await fetch(`${s.url}/health?t=${s.tokens.Ludwing}`)).text(), 'ok Ludwing');
    const b = await browser(s.port, s.tokens.Ludwing);
    b.close(); await s.stop();
  });
});

describe('Conexión por IP de red (como por la VPN)', { skip: !lanIp && 'sin interfaz de red' }, () => {
  test('el servidor escucha en todas las interfaces y ve la IP real de quien se conecta', async () => {
    const s = await startSala();
    const url = `http://${lanIp}:${s.port}`;
    const p = await (await fetch(`${url}/api/ping?t=${s.tokens.Flor}`)).json();
    assert.equal(p.name, 'Flor');
    assert.equal(p.ip, lanIp, 'el servidor tiene que ver la IP de red, no localhost');
    const pc = machine(url, s.tokens.Flor);
    await pc.hook('work', { session_id: 'v' });
    assert.equal(s.sala._debug.snapshot().users.find((u) => u.name === 'Flor').claude, 'working');
    pc.cleanup(); await s.stop();
  });

  test('con la lista blanca en la IP de la "VPN", localhost queda afuera y la VPN entra', async () => {
    const s = await startSala({ allow: `${lanIp}/32` });
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/health`)).status, 403);
    assert.equal((await fetch(`http://${lanIp}:${s.port}/health`)).status, 200);
    await s.stop();
  });
});
