'use strict';
// El plugin tiene que estar bien armado: si un JSON está roto, Claude Code no lo carga y nadie se entera.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
const SCRIPT_EVENTS = ['start', 'work', 'tool', 'tool_done', 'notify', 'idle', 'end'];

test('marketplace apunta a un plugin que existe y coincide en nombre y versión', () => {
  const mk = read('.claude-plugin/marketplace.json');
  assert.ok(mk.name && mk.owner && mk.owner.name);
  for (const p of mk.plugins) {
    const dir = path.join(ROOT, p.source);
    assert.ok(fs.existsSync(dir), p.source);
    const manifest = read(path.join(p.source, '.claude-plugin/plugin.json'));
    assert.equal(manifest.name, p.name);
    assert.equal(manifest.version, p.version);
  }
});

test('cada hook es válido, usa CLAUDE_PLUGIN_ROOT y manda un evento que el servidor entiende', () => {
  const { hooks } = read('plugin/hooks/hooks.json');
  const seen = new Set();
  for (const [event, groups] of Object.entries(hooks)) {
    assert.ok(HOOK_EVENTS.includes(event), `evento de hook desconocido: ${event}`);
    for (const g of groups) for (const h of g.hooks) {
      assert.equal(h.type, 'command');
      assert.ok(h.timeout && h.timeout <= 10, 'timeout corto');
      const m = h.command.match(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/report\.js)" (\w+)$/);
      assert.ok(m, h.command);
      assert.ok(fs.existsSync(path.join(ROOT, 'plugin', m[1])));
      assert.ok(SCRIPT_EVENTS.includes(m[2]), m[2]);
      seen.add(m[2]);
    }
  }
  assert.deepEqual([...seen].sort(), [...SCRIPT_EVENTS].sort(), 'todos los estados tienen su hook');
});

test('los comandos tienen descripción y nunca muestran el token', () => {
  const dir = path.join(ROOT, 'plugin/commands');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.deepEqual(files.sort(), ['sala-abrir.md', 'sala-diagnostico.md', 'sala-franja.md', 'sala-invisible.md', 'sala-mini.md', 'sala-personaje.md', 'sala-setup.md']);
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(text, /^---\ndescription: .+\n/, f);
    if (f !== 'sala-invisible.md') assert.match(text, /no muestres el token|Nunca muestres el token/i, f);
  }
});

test('la skill de personaje tiene nombre, descripción y apunta a la API correcta', () => {
  const dir = path.join(ROOT, 'plugin/skills');
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    const fm = text.match(/^---\nname: (.+)\ndescription: (.+)\n---\n/);
    assert.ok(fm, name);
    assert.equal(fm[1], name, 'el nombre coincide con la carpeta');
    assert.ok(fm[2].length > 40 && fm[2].length < 1024);
  }
  const skill = fs.readFileSync(path.join(dir, 'sala-personaje', 'SKILL.md'), 'utf8');
  const cmd = fs.readFileSync(path.join(ROOT, 'plugin/commands/sala-personaje.md'), 'utf8');
  for (const t of [skill, cmd]) {
    assert.match(t, /\/api\/avatar\?t=<token>/);
    assert.match(t, /Nunca muestres el token/);
  }
  // las instrucciones de la skill y del comando son las mismas
  assert.equal(skill.split('---\n').slice(2).join('---\n').trim(), cmd.split('---\n').slice(2).join('---\n').replace(/^Pedido[\s\S]*?no sigas\.\n\n/, '').trim());
});
