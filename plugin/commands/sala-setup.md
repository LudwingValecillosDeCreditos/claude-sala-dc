---
description: Conecta tu Claude Code a La Sala del equipo
argument-hint: <url-del-servidor> <tu-token>
---
Configurá La Sala con estos argumentos: $ARGUMENTS

El primer argumento es la URL del servidor (por ejemplo http://192.168.0.10:3000) y el segundo es el token personal. Si falta alguno, pedíselo al usuario y no sigas.

1. Escribí el archivo `.claude-sala.json` en el home del usuario (`~/.claude-sala.json`; en Windows `%USERPROFILE%\.claude-sala.json`) con este formato:
   {"url": "<url>", "token": "<token>", "invisible": false}
   Si el archivo ya existe, conservá el valor que tenga "invisible".
2. Verificá la conexión con un GET a `<url>/health?t=<token>` (curl o node). Si responde `ok` seguido de un nombre, decile al usuario que quedó conectado con ese nombre. Si responde 401, el token es incorrecto. Si no responde, el servidor está apagado o no están en la misma red.
3. Nunca muestres el token completo en tu respuesta.
