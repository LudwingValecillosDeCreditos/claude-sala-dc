'use strict';
// Gestión del equipo: cada integrante tiene un token y el nombre que vos le asignás.
//   npm run sumar -- "Juan"     crea el token de Juan (o te muestra el que ya tiene)
//   npm run equipo              lista integrantes
//   npm run quitar -- "Juan"    lo saca de la sala
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'team.json');
const PORT = Number(process.env.PORT) || 3000;
let team;
try { team = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { team = { members: {} }; }
const write = () => fs.writeFileSync(FILE, JSON.stringify(team, null, 2));

// Prioriza la IP de la VPN; si no la detecta bien, forzala con SALA_URL=http://10.x.x.x:3000
const ip = require('./lib/net').interfaces()[0]?.address || 'TU-IP';
const url = process.env.SALA_URL || `http://${ip}:${PORT}`;

const args = process.argv.slice(2);
const entries = Object.entries(team.members);

if (args[0] === '--lista' || args.length === 0) {
  if (!entries.length) console.log('No hay integrantes todavía. Usá: npm run sumar -- "Nombre"');
  for (const [token, name] of entries) console.log(`${name.padEnd(20)} ${token.slice(0, 6)}…`);
} else if (args[0] === '--quitar') {
  const name = args.slice(1).join(' ').trim();
  const before = entries.length;
  team.members = Object.fromEntries(entries.filter(([, n]) => n !== name));
  write();
  console.log(Object.keys(team.members).length < before ? `Listo, ${name} ya no está en la sala.` : `No encontré a "${name}".`);
  // el archivo de mensajes no puede seguir teniendo el token de alguien que ya no está
  const msgFile = path.join(__dirname, 'mensajes-para-el-equipo.txt');
  if (fs.existsSync(msgFile)) {
    const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'sala.config.json'), 'utf8')); } catch { return {}; } })();
    const { messagesFile } = require('./lib/invite');
    fs.writeFileSync(msgFile, messagesFile({ members: Object.entries(team.members).map(([t, n]) => ({ name: n, token: t })), url: (process.env.SALA_URL || cfg.url || url).replace(/\/+$/, ''), repo: cfg.repo }));
  }
} else {
  const name = args.join(' ').trim().slice(0, 24);
  let token = entries.find(([, n]) => n === name)?.[0];
  if (!token) {
    token = crypto.randomBytes(12).toString('hex');
    team.members[token] = name;
    write();
    console.log(`Sumaste a ${name}.`);
  } else {
    console.log(`${name} ya estaba en la sala.`);
  }
  const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'sala.config.json'), 'utf8')); } catch { return {}; } })();
  const { inviteMessage, messagesFile } = require('./lib/invite');
  const u = (process.env.SALA_URL || cfg.url || url).replace(/\/+$/, '');
  const members = Object.entries(team.members).map(([t, n]) => ({ name: n, token: t }));
  fs.writeFileSync(path.join(__dirname, 'mensajes-para-el-equipo.txt'), messagesFile({ members, url: u, repo: cfg.repo }));
  console.log(`\nMandale a ${name} este mensaje por privado. Lo pega en su Claude Code y listo:\n`);
  console.log(inviteMessage({ name, token, url: u, repo: cfg.repo }));
  console.log(`\n(También quedó en mensajes-para-el-equipo.txt, y el link ${u}/unirse?t=${token} lo muestra con un botón para copiar.)\n`);

}
