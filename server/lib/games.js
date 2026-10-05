'use strict';
// Lógica pura de los minijuegos. No sabe nada de red ni de timers: el servidor la orquesta.
// Jugadores: índice 0 y 1 dentro de game.players.

const GAME_TYPES = {
  tateti: { label: 'Ta-te-ti', emoji: '❌' },
  cuatro: { label: 'Cuatro en línea', emoji: '🔴' },
  reflejos: { label: 'Reflejos', emoji: '⚡' },
};

const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const ROWS = 6, COLS = 7;
const REFLEJOS_TO_WIN = 2;
const MIN_REACTION_MS = 80; // por debajo de esto no es humano: se toma como 80

const fail = (error) => ({ ok: false, error });

function create(type, players, { id, random = Math.random } = {}) {
  if (!GAME_TYPES[type]) throw new Error('Juego desconocido: ' + type);
  if (!Array.isArray(players) || players.length !== 2 || players[0] === players[1]) throw new Error('Se necesitan dos jugadores distintos');
  const g = { id, type, players: [...players], status: 'playing', winner: null, reason: null, line: null };
  if (type === 'tateti') { g.board = Array(9).fill(null); g.turn = random() < 0.5 ? 0 : 1; }
  if (type === 'cuatro') { g.board = Array(ROWS * COLS).fill(null); g.turn = random() < 0.5 ? 0 : 1; g.last = null; }
  if (type === 'reflejos') {
    g.turn = null; g.score = [0, 0]; g.round = 0; g.phase = 'idle'; g.hits = [null, null]; g.lastRound = null; g.delay = 0;
  }
  return g;
}

function finish(g, winnerIdx, reason) {
  g.status = 'over';
  g.winner = winnerIdx === null ? null : g.players[winnerIdx];
  g.reason = reason;
}

function connect4Line(board, row, col, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [row * COLS + col];
    for (const s of [1, -1]) {
      let r = row + dr * s, c = col + dc * s;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === p) {
        cells.push(r * COLS + c); r += dr * s; c += dc * s;
      }
    }
    if (cells.length >= 4) return cells.sort((a, b) => a - b);
  }
  return null;
}

// Jugada por turnos (ta-te-ti y cuatro en línea)
function move(g, player, m = {}) {
  const idx = g.players.indexOf(player);
  if (idx < 0) return fail('No estás en esta partida');
  if (g.status !== 'playing') return fail('La partida ya terminó');
  if (g.type === 'reflejos') return fail('En Reflejos no hay turnos');
  if (g.turn !== idx) return fail('No es tu turno');

  if (g.type === 'tateti') {
    const cell = Number(m.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || g.board[cell] !== null) return fail('Esa casilla no está disponible');
    g.board[cell] = idx;
    const line = LINES3.find((l) => l.every((i) => g.board[i] === idx));
    if (line) { g.line = line; finish(g, idx, 'linea'); }
    else if (g.board.every((v) => v !== null)) finish(g, null, 'empate');
    else g.turn = 1 - idx;
    return { ok: true };
  }

  // cuatro en línea
  const col = Number(m.col);
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return fail('Columna inválida');
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) if (g.board[r * COLS + col] === null) { row = r; break; }
  if (row < 0) return fail('Esa columna está llena');
  g.board[row * COLS + col] = idx;
  g.last = row * COLS + col;
  const line = connect4Line(g.board, row, col, idx);
  if (line) { g.line = line; finish(g, idx, 'linea'); }
  else if (g.board.every((v) => v !== null)) finish(g, null, 'empate');
  else g.turn = 1 - idx;
  return { ok: true };
}

// ---------- Reflejos: el que toca primero cuando aparece "¡YA!" gana la ronda ----------
// El tiempo lo mide cada navegador desde que recibe el "¡YA!", así la latencia de la VPN no le da ventaja a nadie.
function reflejosStartRound(g, random = Math.random) {
  if (g.status !== 'playing') return 0;
  g.round += 1;
  g.phase = 'wait';
  g.hits = [null, null];
  g.delay = 1500 + Math.floor(random() * 3000);
  return g.delay;
}

function reflejosGo(g, round) {
  if (g.status === 'playing' && g.phase === 'wait' && g.round === round) { g.phase = 'go'; return true; }
  return false;
}

function endRound(g, winnerIdx, reason, foul = null) {
  g.phase = 'result';
  g.lastRound = { winner: winnerIdx === null ? null : g.players[winnerIdx], reason, hits: g.hits.map((h) => (h ? { ...h } : null)), foul };
  if (winnerIdx !== null) {
    g.score[winnerIdx] += 1;
    if (g.score[winnerIdx] >= REFLEJOS_TO_WIN) finish(g, winnerIdx, 'puntos');
  }
  return { ok: true, roundOver: true };
}

function reflejosHit(g, player, m = {}) {
  const idx = g.players.indexOf(player);
  if (idx < 0) return fail('No estás en esta partida');
  if (g.type !== 'reflejos') return fail('Acción inválida');
  if (g.status !== 'playing') return fail('La partida ya terminó');
  if (g.phase !== 'wait' && g.phase !== 'go') return fail('Esperá la próxima ronda');
  if (g.hits[idx]) return fail('Ya jugaste esta ronda');

  if (g.phase === 'wait' || m.early) {
    g.hits[idx] = { early: true };
    return endRound(g, 1 - idx, 'adelantado', player);
  }
  const ms = Number(m.ms);
  if (!Number.isFinite(ms)) return fail('Tiempo inválido');
  g.hits[idx] = { ms: Math.max(MIN_REACTION_MS, Math.min(5000, Math.round(ms))) };
  if (g.hits[1 - idx]) return reflejosResolve(g, g.round);
  return { ok: true, waiting: true };
}

// Se llama cuando tocaron los dos o cuando se vence el tiempo de la ronda.
function reflejosResolve(g, round) {
  if (g.status !== 'playing' || g.round !== round || (g.phase !== 'go' && g.phase !== 'wait')) return { ok: true, stale: true };
  const [a, b] = g.hits.map((h) => (h && h.ms ? h.ms : null));
  if (a !== null && b !== null) return endRound(g, a === b ? null : a < b ? 0 : 1, a === b ? 'empate' : 'mas_rapido');
  if (a !== null) return endRound(g, 0, 'solo_uno');
  if (b !== null) return endRound(g, 1, 'solo_uno');
  return endRound(g, null, 'nadie');
}

function forfeit(g, player) {
  const idx = g.players.indexOf(player);
  if (idx < 0 || g.status !== 'playing') return false;
  finish(g, 1 - idx, 'abandono');
  g.quitter = player;
  return true;
}

// Lo que ven los jugadores: sin el delay secreto de Reflejos.
function publicView(g) {
  const { delay, ...rest } = g;
  return JSON.parse(JSON.stringify(rest));
}

module.exports = {
  GAME_TYPES, ROWS, COLS, MIN_REACTION_MS,
  create, move, forfeit, publicView,
  reflejosStartRound, reflejosGo, reflejosHit, reflejosResolve,
};
