---
description: Abre La Sala en una ventana a media pantalla, al lado de la terminal
argument-hint: [pestaña|completa]
---
Argumento: $ARGUMENTS

Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Si no existe, decile al usuario que primero corra `/sala-setup <url> <token>` y no sigas. La dirección a abrir es `<url>/?t=<token>`. Nunca muestres el token en tu respuesta.

Si el argumento es "pestaña", abrila como una pestaña común (`open`, `xdg-open` o `start ""`) y terminá.

Si no, abrila como ventana de aplicación (sin barras del navegador) ocupando la mitad derecha de la pantalla, para que quede al lado de la terminal:

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
