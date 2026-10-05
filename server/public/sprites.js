// Motor de pixel art de La Sala. Lo usan el navegador (window.Sprites), el servidor y la mini sala (require).
// Un sprite es una grilla de caracteres: cada carácter es un color de la paleta y '.' es transparente.
// Al dibujar se agregan luz, sombra y un contorno del color de cada parte (no hace falta dibujarlos).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sprites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 16, H = 24;          // personajes
  const INK = '#1a1c2c';
  const HEX = /^#[0-9a-f]{6}$/i;

  const safeColor = (c) => (HEX.test(c) ? c : '#cccccc');
  const toRgb = (hex) => { const n = parseInt(safeColor(hex).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function shade(hex, amt) { const [r, g, b] = toRgb(hex); return toHex(r + amt, g + amt, b + amt); }
  function mix(a, b, t) { const A = toRgb(a), B = toRgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const luma = (hex) => { const [r, g, b] = toRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b; };
  // Luz cálida y sombra fría: se ve más "pintado a mano" que aclarar/oscurecer gris.
  const lighten = (c) => mix(c, '#fff4d6', 0.28);
  const darken = (c) => mix(c, '#29366f', 0.32);

  // ---------- grilla de colores: luz, sombra y contorno ----------
  // Devuelve una matriz (alto+2) x (ancho+2) de colores o null.
  function renderGrid(rows, pal, opts) {
    const { outline = INK, light = false } = opts || {};
    const h = rows.length, w = rows[0].length, GW = w + 2, GH = h + 2;
    const base = Array.from({ length: GH }, () => Array(GW).fill(null));
    rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const c = pal[r[x]]; if (r[x] !== '.' && c) base[y + 1][x + 1] = c; } });
    const at = (x, y) => (base[y] && base[y][x]) || null;
    const grid = base.map((r) => r.slice());
    if (light) {
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const c = base[y][x];
        if (!c || luma(c) < 60) continue; // ojos, bocas y detalles oscuros quedan intactos
        const up = at(x, y - 1), down = at(x, y + 1), left = at(x - 1, y), right = at(x + 1, y);
        if (!up || (!left && up !== c)) grid[y][x] = lighten(c);            // luz desde arriba a la izquierda
        else if (!right || !down) grid[y][x] = darken(c);                    // sombra del lado opuesto
        else if (down !== c && luma(down) >= 60 && luma(c) < 235) grid[y][x] = mix(c, darken(c), 0.5); // sombra suave donde cambia el material
      }
    }
    if (outline) {
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        if (base[y][x]) continue;
        const n = at(x, y + 1) || at(x, y - 1) || at(x - 1, y) || at(x + 1, y);
        if (n) grid[y][x] = mix(darken(n), outline, 0.62); // contorno del color de la parte, no negro parejo
      }
    }
    return grid;
  }

  function gridToSVG(grid, label) {
    const GH = grid.length, GW = grid[0].length;
    let rects = '';
    for (let y = 0; y < GH; y++) {
      let x = 0;
      while (x < GW) {
        const c = grid[y][x];
        if (!c) { x++; continue; }
        let x2 = x + 1;
        while (x2 < GW && grid[y][x2] === c) x2++;
        rects += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${c}"/>`;
        x = x2;
      }
    }
    const safe = String(label || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const aria = label ? `role="img" aria-label="${safe}"` : 'aria-hidden="true"';
    return `<svg class="px" viewBox="0 0 ${GW} ${GH}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" ${aria}>${rects}</svg>`;
  }
  const pixelSVG = (rows, pal, opts) => gridToSVG(renderGrid(rows, pal, opts), opts && opts.label);

  function overlay(grid, map, dy) {
    map.forEach((r, y) => { const gy = y + (dy || 0); if (!grid[gy]) return; for (let x = 0; x < r.length && x < W; x++) if (r[x] !== '.') grid[gy][x] = r[x] === '_' ? '.' : r[x]; });
  }

  // ---------- partes del personaje ----------
  const E = '................';
  const HEADS = {
    humano: [E, E,
      '.....SSSSSS.....', '....SSSSSSSS....', '...SSSSSSSSSS...', '...SSSSSSSSSS...', '...SSSSSSSSSS...',
      '...SSESSSSESS...', '...SSESSSSESS...', '...SSSSSSSSSS...', '...SSSSmmSSSS...', '....SSSSSSSS....', '......SSSS......'],
    alien: ['..YY........YY..', '....K......K....',
      '.....SSSSSS.....', '....SSSSSSSS....', '...SSSSSSSSSS...', '..SSSSSSSSSSSS..', '..SEEESSSSEEES..',
      '..SEWESSSSEWES..', '..SEEESSSSEEES..', '...SSSSSSSSSS...', '....SSSmmSSS....', '.....SSSSSS.....', '......SSSS......'],
    perro: [E, E,
      '.....SSSSSS.....', '....SSSSSSSS....', '..dSSSSSSSSSSd..', '.ddSSSSSSSSSSdd.', '.ddSSESSSSESSdd.',
      '.ddSSSSSSSSSSdd.', '.ddSSLLLLLLSSdd.', '..dSLLLNNLLLSd..', '....SLLLLLLS....', '.....SSSSSS.....', '......SSSS......'],
    gato: [E, '...SS......SS...',
      '...SpSSSSSSpS...', '...SSSSSSSSSS...', '...SSSSSSSSSS...', '..SSSSSSSSSSSS..', '..SSSESSSSESSS..',
      '..SSSESSSSESSS..', 'wwSSSSSppSSSSSww', '..SSSSSSSSSSSS..', '...SSSSmmSSSS...', '....SSSSSSSS....', '......SSSS......'],
  };
  // Peinados (solo humanos): desde la fila 0
  const HAIRS = {
    corto: [E, E, '.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHSSSSSSHH...', '...H........H...'],
    largo: [E, E, '.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '..HHHSSSSSSHHH..', '..HH........HH..',
      '..HH........HH..', '..HH........HH..', '..HH........HH..', '..HH........HH..', '..HH........HH..', '...H........H...'],
    rulos: [E, '.....H.HH.H.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '..HHHHHHHHHHHH..', '..HHHSSSSSSHHH..', '..H.H......H.H..', '..H..........H..'],
    rapado: [E, E, '.....hhhhhh.....', '....hhhhhhhh....', '...hhSSSSSShh...'],
    colita: [E, E, '.....HHHHHH.....', '....HHHHHHHHH...', '...HHHHHHHHHHHH.', '...HHSSSSSSHHHH.', '...H........HHH.', '.............HH.', '.............H..'],
    pelado: [],
  };
  const BODY = [
    '....TTTTTTTT....', '...TTTTTTTTTT...', '..TTTTTTTTTTTT..', '..TT.TTTTTT.TT..', '..TT.TTTTTT.TT..',
    '..SS.TTTTTT.SS..', '.....PPPPPP.....', '.....PP..PP.....', '.....PP..PP.....', '.....PP..PP.....', '....FFF..FFF....'];
  const CHISPA = [E, E, E, E,
    '.......YY.......', '......YYYY......', '.......YY.......', E,
    '.....SSSSSS.....', '....SSSSSSSS....', '...SSSSSSSSSS...', '..SSSSSSSSSSSS..', '..SWSSSSSSSSSS..', '.SWSSSSSSSSSSSS.',
    '.SSSSESSSSESSSS.', '.SSSSESSSSESSSS.', '.SSSSSSSSSSSSSS.', '.SSSSSSmmSSSSSS.', '.SSSSSSSSSSSSSS.',
    '.TTTTTTTTTTTTTT.', '.tTTTTTTTTTTTTt.', '.SSSSSSSSSSSSSS.', '..SSSSSSSSSSSS..', '...FF......FF...'];
  const SPECIES = ['humano', 'alien', 'perro', 'gato', 'chispa'];

  // Ropa: [fila, mapa] sobre el cuerpo (filas 13 a 23)
  const TOPS = {
    remera: [[13, '......tttt......'], [17, '..SS........SS..']],
    buzo: [[12, '....tt....tt....'], [14, '......W..W......'], [15, '......W..W......'], [17, '.....tttttt.....']],
    traje: [[13, '......WWWW......'], [14, '......WRRW......'], [15, '.......RR.......'], [16, '.......RR.......'], [17, '........r.......']],
    campera: [[13, '.....t....t.....'], [14, '.......Z........'], [15, '.......Z........'], [16, '.......Z........'], [17, '.....t.Z..t.....'], [18, '.......Z........']],
    vestido: [[17, '..SS........SS..'], [18, '.....tttttt.....'], [19, '....TTTTTTTT....'], [20, '...TTTTTTTTTT...'], [21, '...tttttttttt...']],
    overol: [[13, '.....D....D.....'], [14, '.....D....D.....'], [15, '.....YDDDDY.....'], [16, '.....DDDDDD.....'], [17, '.....DDDDDD.....'],
      [18, '.....DDDDDD.....'], [19, '.....DDDDDD.....'], [20, '.....DD..DD.....'], [21, '.....DD..DD.....'], [22, '.....DD..DD.....']],
  };
  const HATS = {
    gorra: [E, '.....CCCCCC.....', '....CCCCCCCC....', '...CCCCCCCCCC...', '...ccccccccccccc'],
    corona: ['....Y..YY..Y....', '....YY.YY.YY....', '....YYYRRYYY....', '....YYYYYYYY....'],
    auriculares: [E, '.....KKKKKK.....', '....K......K....', '...K........K...', '...K........K...', '..RR........RR..', '..RR........RR..', '..RR........RR..'],
    gorro: ['.......WW.......', '.....OOOOOO.....', '....OOOOOOOO....', '...OOOOOOOOOO...', '...oooooooooo...'],
    galera: ['.....KKKKKK.....', '.....KKKKKK.....', '.....RRRRRR.....', '...KKKKKKKKKK...'],
    lazo: [E, E, '........pp.pp...', '........ppRpp...', '........pp.pp...'],
    panuelo: [E, E, '.....RRRRRR.....', '....RRWRRWRR....', '...RRRRRRRRRR...', '............RR..', '.............RR.'],
    cuernos: ['..h..........h..', '..hh........hh..', '...hh......hh...'],
  };
  const EXTRAS = {
    anteojos: [E, E, E, E, E, E, '....KKK..KKK....', '....K.KKKK.K....', '....K.K..K.K....', '....KKK..KKK....'],
    lentes: [E, E, E, E, E, E, E, '...KKKKKKKKKK...', '....KKK..KKK....'],
    bufanda: [E, E, E, E, E, E, E, E, E, E, E, E, '....RRRRRRRR....', '....RRRRRRRR....', '........RR......', '........RR......', '........rr......'],
    barba: [E, E, E, E, E, E, E, E, E, '...H........H...', '...HHHH..HHHH...', '....HHHHHHHH....', '......HHHH......'],
    parche: [E, E, E, E, E, E, '...KKKKKKKKKK...', '....KKK.........', '....KKK.........'],
    capa: [E, E, E, E, E, E, E, E, E, E, E, E, E, '...V........V...', '..V..........V..', '.V............V.',
      '.V............V.', '.V............V.', '.V............V.', '.V............V.', '.V............V.', '.VV..........VV.'],
    collar: [E, E, E, E, E, E, E, E, E, E, E, E, E, '.....Y....Y.....', '......Y..Y......', '.......RR.......'],
  };
  const HAIR_COLORS = ['#3b2a20', '#1a1c2c', '#e8c170', '#b85a3a', '#94b0c2', '#ff8fab', '#41a6f6', '#38b764'];

  const CATALOG = {
    species: SPECIES,
    tops: ['ninguno', ...Object.keys(TOPS)],
    hats: ['ninguno', ...Object.keys(HATS)],
    extras: ['ninguno', ...Object.keys(EXTRAS)],
    hairs: Object.keys(HAIRS),
    hairColors: HAIR_COLORS,
  };

  // ---------- cuadros de animación ----------
  // Parpadeo: de cada ojo queda solo la línea de abajo.
  function blink(grid, eyeKey, skinKey, fromRow, toRow) {
    for (let x = 0; x < W; x++) {
      for (let y = fromRow; y <= toRow; y++) {
        const isEye = (k) => k === eyeKey || k === 'W';
        if (!isEye(grid[y][x])) continue;
        let end = y;
        while (end + 1 <= toRow && isEye(grid[end + 1][x])) end++;
        for (let k = y; k < end; k++) grid[k][x] = skinKey;
        grid[end][x] = eyeKey;
        y = end;
      }
    }
  }
  // Paso: levanta un pie (sirve para cualquier sprite parado en la última fila, incluidos los de IA).
  function liftFoot(grid, side) {
    const xs = side === 'izq' ? [0, 1, 2, 3, 4, 5, 6, 7] : [8, 9, 10, 11, 12, 13, 14, 15];
    const last = grid.length - 1;
    for (const x of xs) {
      if (grid[last][x] === '.') continue;
      grid[last - 1][x] = grid[last][x];
      grid[last][x] = '.';
    }
  }
  const FRAMES = ['quieto', 'parpadeo', 'paso1', 'paso2'];

  // Devuelve el personaje del editor como grilla + paleta (solo los colores que usa).
  function avatarGrid(a, frame) {
    const sp = SPECIES.includes(a.species) ? a.species : 'humano';
    const animal = sp === 'perro' || sp === 'gato';
    const S = safeColor(a.skin || '#f1c27d');
    const T = a.top === 'ninguno' ? S : safeColor(a.topColor || '#4f5bd5');
    const Hc = HAIR_COLORS.includes(a.hairColor) ? a.hairColor : HAIR_COLORS[0];
    const pal = {
      S, s: shade(S, -30), T, t: shade(T, -45), H: Hc, h: mix(Hc, S, 0.45), E: '#1a1c2c', W: '#f4f4f4', m: shade(S, -80),
      P: animal ? shade(S, -30) : '#29366f', F: animal ? shade(S, -50) : '#2b2d42', K: '#1a1c2c',
      Y: '#ffcd75', R: '#b13e53', r: '#7a2236', C: '#257179', c: '#1a5a60', O: '#ef7d57', o: '#b85a3a',
      d: shade(S, -50), L: shade(S, 45), N: '#1a1c2c', p: '#ff8fa3', w: '#1a1c2c',
      Z: '#94b0c2', D: '#3b5dc9', V: '#5d275d', B: '#ff8fa3',
    };
    let grid;
    if (sp === 'chispa') {
      grid = CHISPA.map((r) => r.split(''));
      if (a.hat && a.hat !== 'ninguno') for (const y of [4, 5, 6]) grid[y] = E.split('');
      if (a.top === 'ninguno') grid = grid.map((r) => r.map((c) => (c === 'T' || c === 't' ? 'S' : c)));
    } else {
      grid = [...HEADS[sp], ...BODY].map((r) => r.split(''));
      if (sp === 'humano') {
        overlay(grid, HAIRS[a.hair] || HAIRS.corto, 0);
        // mejillas
        grid[10][4] = grid[10][4] === 'S' ? 'B' : grid[10][4];
        grid[10][11] = grid[10][11] === 'S' ? 'B' : grid[10][11];
      }
      for (const [y, row] of TOPS[a.top] || []) overlay(grid, [row], y);
    }
    if (HATS[a.hat]) overlay(grid, HATS[a.hat], sp === 'chispa' ? 6 : 0);
    if (EXTRAS[a.extra]) overlay(grid, EXTRAS[a.extra], sp === 'chispa' ? 7 : 0);
    if (frame === 'parpadeo') {
      if (sp === 'chispa') blink(grid, 'E', 'S', 14, 15);
      else if (!(EXTRAS[a.extra] && (a.extra === 'lentes'))) blink(grid, 'E', 'S', 5, 10);
    }
    if (frame === 'paso1') liftFoot(grid, 'izq');
    if (frame === 'paso2') liftFoot(grid, 'der');
    const rows = grid.map((r) => r.join(''));
    const used = {};
    for (const r of rows) for (const ch of r) if (ch !== '.' && pal[ch]) used[ch] = pal[ch];
    return { rows, palette: used };
  }
  // Los diseños de IA no tienen ojos marcados: parpadear no aplica, caminar sí.
  function customGrid(c, frame) {
    if (frame !== 'paso1' && frame !== 'paso2') return c;
    const grid = c.rows.map((r) => r.split(''));
    liftFoot(grid, frame === 'paso1' ? 'izq' : 'der');
    return { rows: grid.map((r) => r.join('')), palette: c.palette };
  }
  const SPRITE_OPTS = { light: true };
  const avatarSVG = (a, label, frame) => { const g = avatarGrid(a, frame); return pixelSVG(g.rows, g.palette, { ...SPRITE_OPTS, label }); };
  const customSVG = (c, label, frame) => { const g = customGrid(c, frame); return pixelSVG(g.rows, g.palette, { ...SPRITE_OPTS, label }); };
  const spriteGrid = (u, frame) => (u.custom ? customGrid(u.custom, frame) : avatarGrid(u.avatar || {}, frame));

  // ---------- diseños hechos con IA ----------
  const KEY = /^[A-Za-z0-9]$/;
  const RULES = [
    `rows: exactamente ${H} textos de ${W} caracteres. La fila 0 es la de arriba y la ${H - 1} es el piso: los pies tienen que tocar la fila ${H - 1}.`,
    "Cada carácter es un píxel. '.' es transparente; cualquier otro carácter tiene que ser una clave de palette.",
    'palette: hasta 16 colores. Claves de un solo carácter (letra o número), colores en formato #rrggbb.',
    'La sala agrega sola la luz, la sombra y el contorno de color alrededor de la figura: pintá con colores planos y no dibujes contorno.',
    'Personaje de pie, de frente y centrado; la cabeza en la mitad de arriba. Dejá las columnas 0 y 15 casi vacías.',
    'Se ve chico (unos 60 px de alto): formas grandes y simples, buen contraste, ojos de 1 o 2 píxeles bien oscuros.',
    'Para que camine bien, que tenga dos pies separados apoyados en la última fila: uno en la mitad izquierda y otro en la derecha.',
  ];

  function validateCustom(c) {
    const errors = [];
    if (!c || typeof c !== 'object') return { ok: false, errors: ['Falta el diseño (rows y palette)'] };
    const { rows, palette } = c;
    const pal = {};
    if (!palette || typeof palette !== 'object' || Array.isArray(palette)) errors.push('Falta palette (un objeto { "A": "#rrggbb" })');
    else {
      const keys = Object.keys(palette);
      if (keys.length > 16) errors.push(`palette tiene ${keys.length} colores; el máximo es 16`);
      if (!keys.length) errors.push('palette está vacía');
      for (const k of keys) {
        if (!KEY.test(k)) errors.push(`Clave de color inválida "${k}": tiene que ser una sola letra o número`);
        else if (typeof palette[k] !== 'string' || !HEX.test(palette[k])) errors.push(`El color de "${k}" tiene que ser #rrggbb`);
        else pal[k] = palette[k].toLowerCase();
      }
    }
    let filled = 0;
    if (!Array.isArray(rows) || rows.length !== H) errors.push(`rows tiene que tener ${H} filas (tiene ${Array.isArray(rows) ? rows.length : 0})`);
    else {
      const unknown = new Set();
      rows.forEach((r, i) => {
        if (typeof r !== 'string' || r.length !== W) { errors.push(`La fila ${i} tiene que tener ${W} caracteres (tiene ${typeof r === 'string' ? r.length : 0})`); return; }
        for (const ch of r) {
          if (ch === '.') continue;
          if (!KEY.test(ch)) { if (!unknown.has(ch)) { unknown.add(ch); errors.push(`Carácter inválido "${ch}" en la fila ${i}`); } }
          else if (!pal[ch]) { if (!unknown.has(ch)) { unknown.add(ch); errors.push(`"${ch}" (fila ${i}) no está en palette`); } }
          else filled++;
        }
      });
    }
    if (!errors.length && filled < 40) errors.push(`El diseño tiene ${filled} píxeles; tiene que tener al menos 40`);
    if (!errors.length && !/[^.]/.test(rows[H - 1])) errors.push(`Los pies tienen que tocar la última fila (fila ${H - 1})`);
    if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
    const used = {};
    for (const r of rows) for (const ch of r) if (ch !== '.') used[ch] = pal[ch];
    return { ok: true, custom: { rows: rows.slice(), palette: used } };
  }

  // ---------- mascotas: 16 x 12, miran a la izquierda; dos cuadros (quieto / paso) ----------
  const PET_W = 16, PET_H = 12;
  const PETS = {
    perrito: {
      pal: { S: '#c68642', d: '#8d5524', L: '#f1d3a8', N: '#1a1c2c', E: '#1a1c2c', T: '#ff8fa3' },
      rows: ['................', '...dd...........', '..dSSSS.........', '..dSSESS......S.', 'NLLSSSSS.....SS.', '.LLLSSSSSSSSSSS.',
        '..T.SSSSSSSSSSS.', '....SSSSSSSSSSS.', '....SSLLLLLSSSS.', '....SS.SS..SS.SS', '....SS.SS..SS.SS', '....dd.dd..dd.dd'],
      walk: ['................', '...dd...........', '..dSSSS.......S.', '..dSSESS.....SS.', 'NLLSSSSS.....S..', '.LLLSSSSSSSSSSS.',
        '..T.SSSSSSSSSSS.', '....SSSSSSSSSSS.', '....SSLLLLLSSSS.', '.....SSS...SSS..', '.....S.S...S.S..', '.....d.d...d.d..'],
    },
    gatito: {
      pal: { S: '#9aa1b5', s: '#6f7690', p: '#ff8fa3', E: '#1a1c2c', W: '#f4f4f4' },
      rows: ['.S..S...........', '.SSSS..........S', 'SSSSSS........S.', 'SSSESS........S.', 'SSpSSS.......S..', '.SWWSSSSSSSSSS..',
        '..WWSsSSsSSSSS..', '...WSSsSSsSSSS..', '...SSSSSSSSSSS..', '...SS.SS..SS.SS.', '...SS.SS..SS.SS.', '...ss.ss..ss.ss.'],
      walk: ['.S..S...........', '.SSSS...........', 'SSSSSS........SS', 'SSSESS........S.', 'SSpSSS.......S..', '.SWWSSSSSSSSSS..',
        '..WWSsSSsSSSSS..', '...WSSsSSsSSSS..', '...SSSSSSSSSSS..', '....SSS...SSS...', '....S.S...S.S...', '....s.s...s.s...'],
    },
    pollito: {
      pal: { Y: '#ffcd75', y: '#e8a317', o: '#ef7d57', E: '#1a1c2c' },
      rows: ['......YY........', '.....YYYY.......', '....YYYYYY......', '...YYYYYYYY.....', '..oYEYYYYYYY....', 'ooYYYYYYYYYYY...',
        '..YYYYYyyyYYYY..', '..YYYYyyyyyYYYY.', '...YYYYyyyYYYY..', '....YYYYYYYYY...', '......o..o......', '.....oo.oo......'],
      walk: ['................', '......YY........', '.....YYYY.......', '....YYYYYY......', '..oYEYYYYYYY....', 'ooYYYYYYYYYYYY..',
        '..YYYYYyyyYYYYY.', '..YYYYyyyyyYYYY.', '...YYYYyyyYYYY..', '....YYYYYYYYY...', '.....o....o.....', '....oo...oo.....'],
    },
    slime: {
      pal: { G: '#7bd389', g: '#4a9e63', W: '#f4f4f4', E: '#1a1c2c' },
      rows: ['................', '................', '......GGGG......', '....GGGGGGGG....', '...GWWGGGGGGG...', '..GWGGGGGGGGGG..',
        '..GGGEGGGGEGGG..', '.GGGGEGGGGEGGGG.', '.GGGGGGggGGGGGG.', 'GGGGGGGGGGGGGGGG', 'GGGGGGGGGGGGGGGG', '.gggggggggggggg.'],
      walk: ['................', '................', '................', '.....GGGGGG.....', '...GWWGGGGGGG...', '..GWGGGGGGGGGG..',
        '.GGGGEGGGGEGGGG.', '.GGGGEGGGGEGGGG.', 'GGGGGGGggGGGGGGG', 'GGGGGGGGGGGGGGGG', 'GGGGGGGGGGGGGGGG', '.gggggggggggggg.'],
    },
  };
  const petRows = (kind, frame) => { const p = PETS[kind] || PETS.perrito; return frame === 'paso' ? p.walk : p.rows; };
  const petPal = (kind) => (PETS[kind] || PETS.perrito).pal;
  const petCache = {};
  function petSVG(kind, frame) {
    const k = `${kind}:${frame || 'quieto'}`;
    return petCache[k] || (petCache[k] = pixelSVG(petRows(kind, frame), petPal(kind), { light: true }));
  }

  return {
    W, H, PET_W, PET_H, RULES, CATALOG, SPECIES, HEADS, HAIRS, TOPS, HATS, EXTRAS, PETS, FRAMES, HAIR_COLORS,
    safeColor, shade, mix, renderGrid, gridToSVG, pixelSVG, avatarGrid, customGrid, spriteGrid, avatarSVG, customSVG,
    validateCustom, petSVG, petRows, petPal,
  };
});
