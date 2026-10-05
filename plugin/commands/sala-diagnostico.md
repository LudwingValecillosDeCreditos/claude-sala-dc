---
description: Revisa por qué La Sala no te detecta (Node, configuración, VPN y servidor)
---
Hacé un diagnóstico de la conexión con La Sala y mostrá el resultado como una lista corta con ✅, ⚠️ o ❌ en cada punto. No muestres el token completo en ningún momento.

1. Corré `node -v`. Tiene que ser 18 o más; si no existe o es menor, ese es el problema (el plugin usa Node para avisar tu estado).
2. Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Tiene que tener `url` y `token`. Si `invisible` es `true`, avisá que por eso no aparece.
3. Medí la conexión con `<url>/api/ping?t=<token>` (curl con `-w "%{time_total}"` o node). Interpretá:
   - Responde JSON con `ok: true`: conectado. Informá el nombre, la versión del servidor, la IP con la que te ve el servidor y el tiempo de respuesta (menos de 300 ms es bueno sobre VPN).
   - 401: el token no existe; pedile uno nuevo a quien administra la sala.
   - 403: el servidor te ve desde una IP que no está en su lista blanca. Mostrá tu IP de VPN y pedile que la agregue a SALA_PERMITIR.
   - Timeout o conexión rechazada: verificá que la VPN esté conectada (que puedas hacer ping a la IP del servidor), que el servidor esté prendido y que su firewall deje pasar el puerto.
4. Si todo está bien pero igual no aparece, sugerí cerrar y abrir Claude Code para que vuelva a correr el hook de inicio de sesión.
