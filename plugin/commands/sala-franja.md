---
description: Cambia el tamaño de la mini sala de arriba del prompt (chica, mediana, grande) o la apaga
argument-hint: [chica|mediana|grande|apagada]
---
Argumento: $ARGUMENTS

La mini sala de arriba del prompt tiene tres tamaños:
- chica: 5 filas, personajes cabezones con mascota y nombre.
- mediana: 7 filas, más detalle, con mascota y nombre (la de siempre).
- grande: 12 filas, el personaje igual que en la sala del navegador, con todos los detalles, sin mascota ni nombre.
- apagada: no muestra nada.

1. Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`). Si no existe, decile al usuario que primero configure la sala (`/sala-setup` o el mensaje de invitación) y no sigas. Nunca muestres el token.
2. Si el argumento no es uno de esos cuatro, mostrale las opciones de arriba en una lista corta y preguntale cuál quiere.
3. Poné el campo `"franja"` con ese valor, sin tocar los demás campos, y guardá el archivo.
4. Respondé en una línea: el cambio se ve en un segundo, sin reiniciar.
