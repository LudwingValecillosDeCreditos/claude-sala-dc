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
4. Agregá el plugin en ~/.claude/settings.json sin borrar nada de lo que ya tenga (si el archivo no existe, crealo):
   - en "extraKnownMarketplaces" sumá: "sala-equipo": {"source": {"source": "github", "repo": "${r}"}}
   - en "enabledPlugins" sumá: "sala@sala-equipo": true
5. Cuando termines, decime que cierre y vuelva a abrir Claude Code, que acepte instalar el plugin si lo pregunta, y que después escriba /sala-abrir (la sala en el navegador) o /sala-mini (una franja dentro de la terminal).
   Si al reabrir no existe el comando /sala-abrir, que escriba estos dos comandos y vuelva a abrir Claude Code:
   /plugin marketplace add ${r}
   /plugin install sala@sala-equipo`;
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
