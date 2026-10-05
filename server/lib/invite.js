'use strict';
// Mensaje que cada integrante le pega a su Claude Code para que instale y configure todo solo.
// Lleva el token de esa persona: se manda por privado.

const REPO_PLACEHOLDER = 'USUARIO/REPO';

function inviteMessage({ name, token, url, repo }) {
  const r = repo || REPO_PLACEHOLDER;
  return `Hola Claude. Instalá "La Sala", la sala del equipo, en esta computadora. Mis datos:
- Nombre: ${name}
- Servidor: ${url}
- Token personal: ${token} (es privado: no lo muestres en tus respuestas)
- Repositorio del plugin: ${r}

Pasos:
1. Corré \`node -v\`. Si Node no está instalado o es menor a la versión 18, decime cómo instalarlo y no sigas.
2. Creá el archivo .claude-sala.json en mi carpeta de usuario (~/.claude-sala.json; en Windows %USERPROFILE%\\.claude-sala.json) con este contenido:
   {"url": "${url}", "token": "${token}", "invisible": false}
3. Probá la conexión pidiendo ${url}/api/ping?t=<token>. Tiene que responder ok con el nombre ${name}. Si no responde, decime que revise la VPN y no sigas.
4. No toques ~/.claude/settings.json: el plugin lo instalo yo con comandos. Cuando termines, mostrame estas instrucciones tal cual:
   "Listo. Ahora escribí estos dos comandos acá, de a uno (si pregunta algo, aceptá):
   /plugin marketplace add ${r}
   /plugin install sala@sala-equipo
   Después cerrá y volvé a abrir Claude Code, y escribí /sala-abrir (la sala en el navegador) o /sala-mini (una franja en la terminal)."`;
}

function messagesFile({ members, url, repo }) {
  const head = [
    'MENSAJES PARA EL EQUIPO — La Sala',
    '',
    'Mandale a cada uno SOLO su mensaje, por privado (tiene su token).',
    'La persona lo pega en su Claude Code y Claude hace el resto.',
    repo ? `Repositorio: ${repo}` : 'Todavía no configuraste el repositorio: los mensajes dicen USUARIO/REPO. Volvé a correr "iniciar" cuando lo tengas.',
    '',
  ].join('\n');
  const blocks = members.map(({ name, token }) =>
    `${'='.repeat(60)}\nPARA: ${name}\n${'='.repeat(60)}\n\n${inviteMessage({ name, token, url, repo })}\n`);
  return head + '\n' + blocks.join('\n');
}

module.exports = { inviteMessage, messagesFile, REPO_PLACEHOLDER };
