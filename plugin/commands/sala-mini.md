---
description: Abre la mini sala dentro de la terminal, en un panel debajo de Claude Code
argument-hint: [grande]
---
Argumento: $ARGUMENTS

La franja de La Sala (quién está con Claude, quién libre) ya aparece sola arriba del prompt de Claude Code, en cualquier terminal. Este comando abre además la versión animada (personajes y mascotas caminando) en un panel dividido, debajo de Claude Code. Nunca la abras en una ventana aparte.

1. Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Si no existe, decile al usuario que primero configure la sala (`/sala-setup` o el mensaje de invitación) y no sigas. Nunca muestres el token.
2. El programa está en el campo `mini` de ese archivo. Si no está, buscá `scripts/mini.js` dentro de la carpeta del plugin "sala" en `~/.claude/plugins/` (en Windows `%USERPROFILE%\.claude\plugins\`). El comando a correr es `node "<ruta de mini.js>"`, y si el argumento es "grande" agregale ` --grande`.
3. Abrilo en un panel dividido según la terminal (mirá las variables de entorno):
   - `TMUX` definida: `tmux split-window -v -l 13 '<comando>'` (con "grande", `-l 19`).
   - `WT_SESSION` definida (Windows Terminal): `wt -w 0 split-pane -H --size 0.25 <comando>` (con "grande", `--size 0.4`).
   - `TERM_PROGRAM` es `iTerm.app`: con `osascript`, dividí la sesión actual horizontalmente y escribí el comando en la sesión nueva.
   - `TERM_PROGRAM` es `vscode` (también Cursor u otros basados en VS Code): no se puede dividir desde acá. Decile que divida la terminal (ícono "Dividir terminal" o Ctrl+Shift+5 / Cmd+\) y pegue el comando, que le mostrás listo para copiar.
   - `TERM_PROGRAM` es `WarpTerminal` (Warp): no se puede dividir desde acá. Decile que la franja de arriba del prompt ya muestra la sala, y que para la versión animada divida el panel (Ctrl+Shift+D, en macOS Cmd+D) y pegue el comando, que le mostrás listo para copiar.
   - Windows sin `WT_SESSION` (cmd o PowerShell sueltos): no tienen paneles. Decile que la franja de arriba del prompt ya muestra la sala, y que si quiere la versión animada dentro de la misma ventana use Windows Terminal (ahí este comando la divide sola).
   - Terminal de macOS (`Apple_Terminal`): no tiene paneles; decile lo mismo que en Warp, con la sugerencia de usar iTerm.
   - Cualquier otra terminal: decile que la franja de arriba del prompt ya muestra la sala, y mostrale el comando por si quiere dividir la terminal a mano.
4. Respondé en una o dos líneas qué hiciste y recordale las teclas: ← → caminar, 1-8 emotes, m mensaje, p mimos, c tamaño, s sala grande, q salir.
