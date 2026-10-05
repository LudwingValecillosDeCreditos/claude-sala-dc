---
description: Abre la mini sala dentro de la terminal, en un panel debajo de Claude Code
argument-hint: [grande]
---
Argumento: $ARGUMENTS

La mini sala es una franja en la terminal con los personajes del equipo y sus mascotas caminando. Tu tarea es abrirla en un panel dividido, debajo de Claude Code.

1. Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Si no existe, decile al usuario que primero configure la sala (`/sala-setup` o el mensaje de invitación) y no sigas. Nunca muestres el token.
2. El programa está en el campo `mini` de ese archivo. Si no está, buscá `scripts/mini.js` dentro de la carpeta del plugin "sala" en `~/.claude/plugins/` (en Windows `%USERPROFILE%\.claude\plugins\`). El comando a correr es `node "<ruta de mini.js>"`, y si el argumento es "grande" agregale ` --grande`.
3. Abrilo en un panel dividido según la terminal (mirá las variables de entorno):
   - `TMUX` definida: `tmux split-window -v -l 13 '<comando>'` (con "grande", `-l 19`).
   - `WT_SESSION` definida (Windows Terminal): `wt -w 0 split-pane -H --size 0.25 <comando>` (con "grande", `--size 0.4`).
   - `TERM_PROGRAM` es `iTerm.app`: con `osascript`, dividí la sesión actual horizontalmente y escribí el comando en la sesión nueva.
   - `TERM_PROGRAM` es `vscode` (también Cursor u otros basados en VS Code): no se puede dividir desde acá. Decile que divida la terminal (ícono "Dividir terminal" o Ctrl+Shift+5 / Cmd+\) y pegue el comando, que le mostrás listo para copiar.
   - `TERM_PROGRAM` es `WarpTerminal` (Warp): no se puede dividir desde acá. Abrila en una ventana aparte, sin preguntar: en Windows `cmd /c start "La Sala" <comando>`; en macOS como la Terminal de macOS (abajo); en Linux como Linux sin tmux. Después decile que, si la prefiere dentro de Warp, divida el panel (Ctrl+Shift+D, en macOS Cmd+D) y pegue el comando, que le mostrás listo para copiar.
   - Windows sin `WT_SESSION` (cmd, PowerShell u otra terminal): abrila en una ventana aparte con `cmd /c start "La Sala" <comando>`.
   - Terminal de macOS (`Apple_Terminal`): abrí una ventana nueva con `osascript -e 'tell application "Terminal" to do script "<comando>"'`.
   - Linux sin tmux: probá `gnome-terminal --geometry=120x18 -- <comando>`, `konsole -e <comando>` o `xterm -geometry 120x18 -e <comando>`, en segundo plano.
   - Si nada de eso funciona, mostrale el comando para que lo pegue en otra pestaña de la terminal.
4. Respondé en una o dos líneas qué hiciste y recordale las teclas: ← → caminar, 1-8 emotes, m mensaje, p mimos, c tamaño, s sala grande, q salir.
