'use strict';
// Nada que mande un cliente (por error o a propósito) puede tirar la sala de todo el equipo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startSala, sleep } = require('./helpers');

test('datos malformados por HTTP y WebSocket no tiran el servidor', async (t) => {
  const s = await startSala();
  t.after(() => s.stop());
  const errors = [];
  const onErr = (e) => errors.push(e && e.message);
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  t.after(() => { process.off('uncaughtException', onErr); process.off('unhandledRejection', onErr); });
  const tok = s.tokens.Ludwing;
  const bodies = ['null', '123', '"x"', '[]', 'true', '{', '{"token":null}', `{"token":["${tok}"]}`,
    `{"token":"${tok}","custom":"x"}`, `{"token":"${tok}","custom":{"rows":null,"palette":null}}`, `{"token":"${tok}","avatar":[1]}`,
    `{"token":"${tok}","type":"pet","action":"buy","item":{}}`, `{"token":"${tok}","type":"chat","text":{"a":1}}`];
  for (const path of ['/api/event', '/api/avatar', '/api/action']) for (const b of bodies) {
    const r = await fetch(s.url + path, { method: 'POST', body: b, signal: AbortSignal.timeout(2000) });
    assert.ok(r.status >= 200 && r.status < 500, `${path} ${b} -> ${r.status}`);
  }
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws?t=${tok}`);
  ws.on('error', () => {});
  await new Promise((r) => ws.on('open', r));
  for (const m of ['null', '0', '[]', '{"type":null}', '{"type":"avatar","avatar":null}', '{"type":"move","x":"1e999","y":null}',
    '{"type":"pet","action":"config","name":{"x":1},"kind":[]}', '{"type":"invite","to":{},"game":[]}', '{"type":"invite_reply","id":{}}',
    '{"type":"game","id":null,"action":"move","cell":"a"}', '{"type":"chat","text":null}', '{"type":"emote","emoji":{}}',
    '{"type":"__proto__"}', JSON.stringify({ type: 'chat', text: 'x'.repeat(6000) })]) {
    if (ws.readyState === 1) ws.send(m);
    await sleep(20);
  }
  await sleep(200);
  assert.equal(await (await fetch(s.url + '/health')).text(), 'ok', 'la sala sigue viva');
  assert.deepEqual(errors, [], 'sin errores sin capturar');
  ws.close();
});
