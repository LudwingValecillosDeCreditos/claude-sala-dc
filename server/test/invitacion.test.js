'use strict';
// Lo que cada integrante le pega a su Claude Code, y el arranque en un paso.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { inviteMessage, messagesFile } = require('../lib/invite');
const { startSala } = require('./helpers');

test('el mensaje trae todo lo que Claude necesita para instalar solo', () => {
  const m = inviteMessage({ name: 'Flor', token: 'abc123', url: 'http://10.8.0.5:3000', repo: 'ludwing/la-sala' });
  for (const must of [
    'node -v', '.claude-sala.json', '"url": "http://10.8.0.5:3000"', '"token": "abc123"',
    'http://10.8.0.5:3000/api/ping?t=<token>', 'No toques ~/.claude/settings.json', '/sala-abrir',
    '/plugin marketplace add ludwing/la-sala', '/plugin install sala@sala-equipo', 'no lo muestres',
  ]) assert.ok(m.includes(must), must);
  // la ruta de Windows sale con una sola barra
  assert.ok(m.includes('%USERPROFILE%\\.claude-sala.json'));
  // el JSON de configuración que trae el mensaje es JSON válido
  JSON.parse(m.match(/\{"url".*\}/)[0]);
});

test('sin repositorio todavía, el archivo de mensajes lo avisa', () => {
  const f = messagesFile({ members: [{ name: 'Emi', token: 't1' }], url: 'http://x:3000', repo: null });
  assert.match(f, /Todavía no configuraste el repositorio/);
  assert.match(f, /USUARIO\/REPO/);
  assert.match(f, /PARA: Emi/);
});

test('la página de invitación muestra el mensaje listo para copiar, con el repo configurado', async (t) => {
  const s = await startSala();
  t.after(() => s.stop());
  fs.writeFileSync(path.join(s.dir, 'sala.config.json'), JSON.stringify({ repo: 'ludwing/la-sala' }));
  // el repo se lee al crear la sala: levanto otra sobre la misma carpeta
  const { createSala } = require('../server');
  const sala = createSala({ dataDir: s.dir, timing: { teamWatch: 100 } });
  const port = await sala.listen(0, '127.0.0.1');
  t.after(() => sala.close());
  const html = await (await fetch(`http://127.0.0.1:${port}/unirse?t=${s.tokens.Flor}`)).text();
  assert.match(html, /Copiar mensaje/);
  assert.match(html, /ludwing\/la-sala/);
  assert.ok(html.includes(`&quot;token&quot;: &quot;${s.tokens.Flor}&quot;`), 'el mensaje va escapado dentro de la página');
});

test('iniciar sin preguntas genera los mensajes de todo el equipo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ini-'));
  fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({ members: { aaa: 'Ludwing', bbb: 'Flor' } }));
  fs.writeFileSync(path.join(dir, 'sala.config.json'), JSON.stringify({ repo: 'ludwing/la-sala', url: 'http://10.8.0.5:3000' }));
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'iniciar.js'), '--solo-mensajes', '--no-preguntar'], { env: { ...process.env, SALA_DATA_DIR: dir }, encoding: 'utf8' });
  assert.match(out, /Equipo: +Ludwing, Flor/);
  const f = fs.readFileSync(path.join(dir, 'mensajes-para-el-equipo.txt'), 'utf8');
  assert.match(f, /PARA: Ludwing[\s\S]*"token": "aaa"/);
  assert.match(f, /PARA: Flor[\s\S]*"token": "bbb"/);
  assert.match(f, /http:\/\/10\.8\.0\.5:3000/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('los datos privados no se suben al repositorio', () => {
  const ignore = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
  for (const f of ['server/team.json', 'server/data.json', 'server/sala.config.json', 'server/mensajes-para-el-equipo.txt']) assert.ok(ignore.includes(f), f);
});

test('al sacar a alguien del equipo, su mensaje (con su token) desaparece del archivo', () => {
  const dir = path.join(__dirname, '..');
  const backup = {};
  for (const f of ['team.json', 'mensajes-para-el-equipo.txt', 'sala.config.json']) { const p = path.join(dir, f); backup[f] = fs.existsSync(p) ? fs.readFileSync(p) : null; }
  try {
    fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({ members: {} }));
    const run = (...a) => execFileSync(process.execPath, [path.join(dir, 'equipo.js'), ...a], { encoding: 'utf8', env: { ...process.env, SALA_URL: 'http://10.8.0.5:3000' } });
    run('Flor'); run('Emi');
    const file = path.join(dir, 'mensajes-para-el-equipo.txt');
    assert.match(fs.readFileSync(file, 'utf8'), /PARA: Flor/);
    const florToken = Object.entries(JSON.parse(fs.readFileSync(path.join(dir, 'team.json'))).members).find(([, n]) => n === 'Flor')[0];
    run('--quitar', 'Flor');
    const after = fs.readFileSync(file, 'utf8');
    assert.ok(!after.includes('PARA: Flor') && !after.includes(florToken), 'ni el mensaje ni el token de Flor');
    assert.match(after, /PARA: Emi/);
  } finally {
    for (const [f, v] of Object.entries(backup)) { const p = path.join(dir, f); if (v === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, v); }
  }
});

test('el mensaje menciona las dos formas de ver la sala', () => {
  const m = inviteMessage({ name: 'Flor', token: 't', url: 'http://x:3000', repo: 'a/b' });
  assert.match(m, /\/sala-abrir/);
  assert.match(m, /\/sala-mini/);
});
