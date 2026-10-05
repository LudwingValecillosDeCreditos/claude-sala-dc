'use strict';
// Arranque en un paso (lo llaman iniciar.bat / iniciar.command / iniciar.sh):
//  1. instala lo que falta
//  2. la primera vez pregunta el repositorio y los nombres del equipo
//  3. genera mensajes-para-el-equipo.txt (lo que cada uno le pega a su Claude Code)
//  4. levanta la sala
// Opciones: --solo-mensajes (no levanta el servidor)  --no-preguntar (no hace preguntas)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const DIR = process.env.SALA_DATA_DIR || __dirname;
const CONFIG = path.join(DIR, 'sala.config.json');
const TEAM = path.join(DIR, 'team.json');
const OUT = path.join(DIR, 'mensajes-para-el-equipo.txt');
const args = process.argv.slice(2);
const ONLY_MESSAGES = args.includes('--solo-mensajes');
const ASK = !args.includes('--no-preguntar') && process.stdin.isTTY;

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const line = (t = '') => console.log(t);

function ask(question) {
  if (!ASK) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  line('\n  La Sala — arranque\n');

  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) { line(`  Necesitás Node 18 o más (tenés ${process.versions.node}). Bajalo de https://nodejs.org`); process.exit(1); }

  try { require.resolve('ws'); } catch {
    line('  Instalando lo necesario (solo la primera vez)…');
    const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) { line('  No pude instalar las dependencias. Probá a mano: npm install'); process.exit(1); }
  }

  const net = require('./lib/net');
  const { messagesFile, REPO_PLACEHOLDER } = require('./lib/invite');

  // ---- configuración ----
  const config = readJSON(CONFIG, {});
  if (!config.repo) {
    const repo = await ask('  Repositorio de GitHub del plugin (usuario/repo). Si todavía no lo tenés, apretá Enter: ');
    if (/^[\w.-]+\/[\w.-]+$/.test(repo)) { config.repo = repo; writeJSON(CONFIG, config); }
    else if (repo) line('  Eso no parece "usuario/repo". Lo dejo para después.');
  }
  const port = Number(process.env.PORT) || config.port || 3000;
  const ip = net.interfaces()[0];
  const url = (process.env.SALA_URL || config.url || `http://${ip ? ip.address : 'localhost'}:${port}`).replace(/\/+$/, '');

  // ---- equipo ----
  const team = readJSON(TEAM, { members: {} });
  if (!Object.keys(team.members).length) {
    const names = await ask('  Nombres del equipo, separados por coma (incluite vos): ');
    for (const n of names.split(',').map((s) => s.trim().slice(0, 24)).filter(Boolean)) {
      team.members[crypto.randomBytes(12).toString('hex')] = n;
    }
    writeJSON(TEAM, team);
  }
  const members = Object.entries(team.members).map(([token, name]) => ({ name, token }));

  // ---- mensajes ----
  fs.writeFileSync(OUT, messagesFile({ members, url, repo: config.repo }));

  line('');
  line(`  Dirección de la sala: ${url}${ip && ip.vpn ? '  (IP de la VPN)' : ''}`);
  if (!ip || !ip.vpn) line('  Ojo: no reconocí una IP de VPN. Si es otra, ponela en sala.config.json como "url".');
  line(`  Repositorio:          ${config.repo || REPO_PLACEHOLDER + '  (falta: volvé a abrir "iniciar" cuando lo tengas)'}`);
  line(`  Equipo:               ${members.map((m) => m.name).join(', ') || '(nadie todavía)'}`);
  line('');
  line(`  Los mensajes para pasarle a cada uno están en:\n    ${OUT}`);
  line('  Mandale a cada persona SOLO su mensaje, por privado: lo pega en su Claude Code y listo.');
  line('  Vos también: pegá el tuyo en tu Claude Code.');
  line('  Para sumar a alguien más: npm run sumar -- "Nombre" (y volvé a abrir "iniciar").');
  line('');

  if (ONLY_MESSAGES) return;

  const { createSala } = require('./server');
  const sala = createSala({ dataDir: DIR, repo: config.repo });
  await sala.listen(port).catch((e) => {
    line(e.code === 'EADDRINUSE' ? `  El puerto ${port} ya está en uso: ¿la sala ya está abierta en otra ventana?` : String(e));
    process.exit(1);
  });
  line(`  La sala está abierta en ${url} 🛋️`);
  if (net.firewallAbierto(port) === false) {
    const vpn = net.interfaces().find((x) => x.vpn);
    line('  ❌ El Firewall de Windows no deja entrar a los demás (tu PC sí ve la sala, ellos no).');
    line('     Abrí PowerShell como administrador y pegá esto una sola vez:');
    line('     ' + net.comandoFirewall(port, vpn && vpn.name));
  }
  line('  Dejá esta ventana abierta mientras el equipo use la sala. Para cerrarla: Ctrl+C.\n');
  const stop = () => sala.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
