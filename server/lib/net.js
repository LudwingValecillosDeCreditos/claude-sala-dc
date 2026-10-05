'use strict';
// Utilidades de red: lista blanca por rango (para dejar entrar solo a la VPN) y detección de IPs probables de VPN.
const os = require('os');

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

// "10.8.0.0/24,127.0.0.1" -> función (ip) => boolean. Vacío = deja pasar a todos.
function parseAllowList(spec) {
  const rules = String(spec || '').split(',').map((s) => s.trim()).filter(Boolean).map((r) => {
    const [base, bitsStr] = r.split('/');
    const bits = bitsStr === undefined ? 32 : Number(bitsStr);
    const n = ipToInt(base);
    if (n === null || !Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error('Rango inválido en SALA_PERMITIR: ' + r);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return { net: (n & mask) >>> 0, mask };
  });
  if (!rules.length) return () => true;
  return (rawIp) => {
    const n = ipToInt(normalizeIp(rawIp));
    if (n === null) return false;
    return rules.some((r) => ((n & r.mask) >>> 0) === r.net);
  };
}

const VPN_NAME = /^(tun|tap|wg|utun|ppp|tailscale|zt|nordlynx|proton|ipsec|vpn)/i;
function inRange(ip, cidr) { return parseAllowList(cidr)(ip); }

function interfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal) continue;
      const vpn = VPN_NAME.test(name) || inRange(i.address, '100.64.0.0/10') || /vpn|wireguard|openvpn|forti|cisco|anyconnect|zerotier/i.test(name);
      out.push({ name, address: i.address, netmask: i.netmask, vpn });
    }
  }
  return out.sort((a, b) => Number(b.vpn) - Number(a.vpn));
}

module.exports = { parseAllowList, normalizeIp, interfaces, ipToInt };
