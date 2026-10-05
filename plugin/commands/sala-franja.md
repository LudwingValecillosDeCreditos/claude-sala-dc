---
description: Elige qué se ve arriba del prompt: la barra (por defecto), la mini sala animada (chica, mediana, grande) o nada
argument-hint: [barra|chica|mediana|grande|apagada]
---
Argumento: $ARGUMENTS

Arriba del prompt se puede ver:
- barra (por defecto): una línea con quién está conectado o usando Claude y el botón "Entrar a la sala".
- chica: la mini sala animada en 5 filas, personajes cabezones con mascota y nombre.
- mediana: la mini sala animada en 7 filas, más detalle, con mascota y nombre.
- grande: la mini sala animada en 12 filas, el personaje igual que en la sala del navegador, con todos los detalles, sin mascota ni nombre.
- apagada: no muestra nada.

1. Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Si no existe, decile al usuario que primero configure la sala (`/sala-setup` o el mensaje de invitación) y no sigas. Nunca muestres el token.
2. Si el argumento no es uno de esos cinco, mostrale las opciones de arriba en una lista corta y preguntale cuál quiere.
3. Poné el campo `"franja"` con ese valor, sin tocar los demás campos, y guardá el archivo.
4. Respondé en una línea: el cambio se ve en un segundo, sin reiniciar.
