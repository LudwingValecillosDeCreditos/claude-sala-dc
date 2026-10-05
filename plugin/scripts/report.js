#!/usr/bin/env node
// Reporta tu estado a La Sala. Reglas de oro:
//  - Nunca imprime nada: en algunos hooks lo que sale por stdout se suma al contexto de Claude.
//  - Nunca bloquea: timeout corto y siempre sale con código 0, aunque el servidor esté apagado.
//  - Solo manda el evento, el id de sesión y el nombre de la herramienta. Nada de prompts ni código.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const event = process.argv[2];
const CONFIG_FILE = path.join(os.homedir(), '.claude-sala.json');

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  return {
    url: process.env.SALA_URL || cfg.url,
    token: process.env.SALA_TOKEN || cfg.token,
    invisible: cfg.invisible === true,
  };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), 300);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
  });
}

// Guarda dónde quedó instalada la mini sala, para que /sala-mini la encuentre (la ruta cambia entre versiones del plugin).
function rememberMiniPath() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const mini = path.join(__dirname, 'mini.js');
    if (raw.mini !== mini) { raw.mini = mini; fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 2)); }
  } catch { /* sin configurar todavía */ }
}

async function main() {
  if (event === 'start') rememberMiniPath();
  const cfg = loadConfig();
  if (!cfg.url || !cfg.token || cfg.invisible || typeof fetch !== 'function') return;

  let input = {};
  try { input = JSON.parse((await readStdin()) || '{}'); } catch {}

  let ev = event;
  if (ev === 'notify') {
    // Solo nos interesa cuando Claude pide permiso, no el aviso de "esperando tu mensaje".
    const isPermission = input.notification_type === 'permission_prompt' ||
      /permission|permiso/i.test(String(input.message || ''));
    if (!isPermission) return;
    ev = 'waiting';
  }

  const body = {
    token: cfg.token,
    session: String(input.session_id || 'default').slice(0, 64),
    event: ev,
    tool: ev === 'tool' ? String(input.tool_name || '').slice(0, 60) : undefined,
  };

  await fetch(cfg.url.replace(/\/+$/, '') + '/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1500),
  });
}

main().catch(() => {}).finally(() => process.exit(0));
