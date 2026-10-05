'use strict';
// npm run diagnostico — revisa que tu PC esté lista para recibir al equipo por la VPN.
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('./lib/net');

const PORT = Number(process.env.PORT) || 3000;
const ok = (t) => console.log('  ✅ ' + t);
const warn = (t) => console.log('  ⚠️  ' + t);
const bad = (t) => console.log('  ❌ ' + t);

(async () => {
  console.log('\nDiagnóstico de La Sala\n');
  const [major] = process.versions.node.split('.').map(Number);
  major >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node}: necesitás 18 o más`);

  try { require.resolve('ws'); ok('Dependencias instaladas'); } catch { bad('Falta instalar dependencias: npm install'); }

  const team = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'team.json'), 'utf8')); } catch { return null; } })();
  const members = team ? Object.values(team.members || {}) : [];
  members.length ? ok(`Equipo: ${members.join(', ')}`) : warn('No hay integrantes: npm run sumar -- "Nombre"');

  const ifs = net.interfaces();
  if (!ifs.length) bad('No encontré ninguna interfaz de red activa');
  for (const i of ifs) (i.vpn ? ok : console.log.bind(null, '  •'))(`${i.vpn ? 'VPN detectada' : 'Red'}: ${i.address} (${i.name})`);
  if (!ifs.some((i) => i.vpn)) warn('No reconocí ninguna interfaz como VPN. Si están conectados, usá la IP que te da tu cliente de VPN.');

  if (process.env.SALA_PERMITIR) {
    try {
      const allow = net.parseAllowList(process.env.SALA_PERMITIR);
      ok(`Lista blanca activa: ${process.env.SALA_PERMITIR}`);
      for (const i of ifs) if (!allow(i.address)) warn(`${i.address} (${i.name}) queda afuera de la lista blanca`);
    } catch (e) { bad(e.message); }
  } else {
    warn('Sin lista blanca: cualquiera que llegue a tu PC puede ver la sala. Recomendado: SALA_PERMITIR=<rango de la VPN>');
  }

  const running = await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 1500 }, (res) => resolve(res.statusCode));
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
  if (running === 200) ok(`El servidor responde en el puerto ${PORT}`);
  else if (running === 403) warn(`El servidor está andando pero la lista blanca no deja entrar a 127.0.0.1 (normal si no la agregaste)`);
  else warn(`El servidor no está corriendo en el puerto ${PORT}. Levantalo con: npm start`);

  console.log('\nSi alguien de la VPN no llega:');
  console.log('  • Windows: permití Node en el Firewall para redes privadas (o abrí el puerto ' + PORT + ' TCP).');
  console.log('  • macOS: aceptá el aviso de "conexiones entrantes" la primera vez.');
  console.log('  • Linux: sudo ufw allow from <rango-vpn> to any port ' + PORT + ' proto tcp');
  console.log('  • Algunas VPN bloquean el tráfico entre clientes (client-to-client). Si pasa eso, lo tiene que habilitar quien administra la VPN.\n');
})();
