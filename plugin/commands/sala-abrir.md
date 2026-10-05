---
description: Divide la pantalla: Claude Code a la izquierda y La Sala a la derecha
argument-hint: [pestaña|completa]
---
Argumento: $ARGUMENTS

Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Si no existe, decile al usuario que primero corra `/sala-setup <url> <token>` y no sigas. La dirección a abrir es `<url>/?t=<token>`. Nunca muestres el token en tu respuesta.

Primero corré `node "${CLAUDE_PLUGIN_ROOT}/scripts/abrir.js" $ARGUMENTS`. En Windows hace todo (pone esta terminal en la mitad izquierda y La Sala en la derecha): respondé con la línea que imprime y terminá. Si la ruta no existe, buscá `scripts/abrir.js` en la carpeta del plugin "sala" dentro de `~/.claude/plugins/`. Si sale con código 2 (macOS o Linux), seguí con lo de abajo.

Si el argumento es "pestaña", abrila como una pestaña común (`open`, `xdg-open` o `start ""`) y terminá.

Si no, dividí la pantalla: la terminal en la mitad izquierda y La Sala como ventana de aplicación (sin barras del navegador) en la mitad derecha. En macOS, mové antes la ventana de la terminal: `osascript -e 'tell application "System Events" to set p to name of first process whose frontmost is true' -e 'tell application p to set bounds of front window to {0, 0, <ancho/2>, <alto>}'`.

1. Averiguá el área útil de la pantalla principal:
   - macOS: `osascript -e 'tell application "Finder" to get bounds of window of desktop'` (devuelve `0, 0, ancho, alto`).
   - Windows (PowerShell): `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea | Select Width,Height`.
   - Linux: `xrandr --current | grep '\*'` o `xdpyinfo | grep dimensions`.
   Si no lo podés averiguar, usá 1440 × 900.
2. Calculá `ancho/2` y la posición `x = ancho/2`, `y = 0`. Si el argumento es "completa", usá toda la pantalla (`x = 0`, ancho completo).
3. Abrí la sala con el primer navegador basado en Chromium que encuentres (Chrome, Edge, Brave o Chromium), con `--app=<dirección> --window-size=<ancho>,<alto> --window-position=<x>,0`:
   - macOS: `open -na "Google Chrome" --args --app=...` (o "Microsoft Edge", "Brave Browser").
   - Windows: `start "" chrome --app=...` (o `msedge`).
   - Linux: `google-chrome --app=...` (o `chromium`, `microsoft-edge`, `brave-browser`), en segundo plano.
4. Si no hay ningún navegador Chromium, abrila como pestaña común y sugerí acomodarla a la derecha de la terminal.

Respondé en una línea confirmando que se abrió. Si el usuario usa VS Code, mencioná que también puede abrirla en un panel al costado con el comando "Simple Browser: Show" y la misma dirección.
