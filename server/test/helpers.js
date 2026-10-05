'use strict';
// Simuladores para las pruebas: servidor aislado, "computadoras" con su propio HOME y navegadores por WebSocket.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const WebSocket = require('ws');
const { createSala } = require('../server');

const REPORT = path.join(__dirname, '..', '..', 'plugin', 'scripts', 'report.js');

const FAST = {
  broadcastDelay: 10, teamWatch: 100, disconnectGrace: 250, invite: 600, gameKeep: 400,
  reflejosStart: 40, reflejosScale: 0.02, reflejosWindow: 400, reflejosPause: 60,
};

async function startSala({ members = ['Ludwing', 'Flor'], timing = {}, allow = '', host = '0.0.0.0', now, random } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-'));
  const tokens = {};
  const team = { members: {} };
  for (const name of members) { const t = crypto.randomBytes(8).toString('hex'); tokens[name] = t; team.members[t] = name; }
  fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify(team));
  const sala = createSala({ dataDir: dir, timing: { ...FAST, ...timing }, allow, now, random });
  const port = await sala.listen(0, host);
  return {
    sala, dir, tokens, port, url: `http://127.0.0.1:${port}`,
    addMember(name) {
      const t = crypto.randomBytes(8).toString('hex');
      team.members[t] = name; tokens[name] = t;
      fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify(team));
      return t;
    },
    async stop() { await sala.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// Una "computadora" del equipo: HOME propio con ~/.claude-sala.json, igual que después de /sala-setup
function machine(url, token, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
  const cfg = { url, token, invisible: false, ...extra };
  fs.writeFileSync(path.join(home, '.claude-sala.json'), JSON.stringify(cfg));
  // Lo mismo que hace Claude Code: corre el comando del hook y le pasa el JSON del evento por stdin
  const hook = (event, input = {}) => new Promise((resolve) => {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.SALA_URL; delete env.SALA_TOKEN;
    const started = Date.now();
    const child = execFile(process.execPath, [REPORT, event], { env, timeout: 10000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr, ms: Date.now() - started });
    });
    child.stdin.end(JSON.stringify(input));
  });
  return { home, hook, setConfig(c) { fs.writeFileSync(path.join(home, '.claude-sala.json'), JSON.stringify({ ...cfg, ...c })); }, cleanup() { fs.rmSync(home, { recursive: true, force: true }); } };
}

// Un navegador con la sala abierta
class Browser {
  constructor(port, token) {
    this.msgs = [];
    this.cursor = 0;
    this.state = null;
    this.me = null;
    this.waiters = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws${token ? '?t=' + token : ''}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type === 'state') this.state = m;
      if (m.type === 'me') this.me = m;
      this.msgs.push(m);
      for (const w of [...this.waiters]) w();
    });
    this.opened = new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej); });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  // Espera el próximo mensaje (desde el cursor) que cumpla la condición
  next(pred, timeout = 3000, label = 'mensaje') {
    return new Promise((resolve, reject) => {
      const check = () => {
        for (let i = this.cursor; i < this.msgs.length; i++) {
          if (pred(this.msgs[i])) { this.cursor = i + 1; done(); resolve(this.msgs[i]); return true; }
        }
        return false;
      };
      const done = () => { clearTimeout(timer); this.waiters = this.waiters.filter((w) => w !== check); };
      const timer = setTimeout(() => { done(); reject(new Error(`Timeout esperando ${label}. Últimos: ${JSON.stringify(this.msgs.slice(-3)).slice(0, 400)}`)); }, timeout);
      if (!check()) this.waiters.push(check);
    });
  }
  // Espera a que el estado de la sala cumpla la condición (mira el último y los que lleguen)
  waitState(pred, timeout = 3000, label = 'estado') {
    return new Promise((resolve, reject) => {
      const check = () => { if (this.state && pred(this.state)) { done(); resolve(this.state); return true; } return false; };
      const done = () => { clearTimeout(timer); this.waiters = this.waiters.filter((w) => w !== check); };
      const timer = setTimeout(() => { done(); reject(new Error(`Timeout esperando ${label}. Estado: ${JSON.stringify(this.state).slice(0, 500)}`)); }, timeout);
      if (!check()) this.waiters.push(check);
    });
  }
  user(name) { return this.state && this.state.users.find((u) => u.name === name); }
  close() { this.ws.close(); }
}

async function browser(port, token) { const b = new Browser(port, token); await b.opened; return b; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { startSala, machine, browser, sleep, REPORT };
