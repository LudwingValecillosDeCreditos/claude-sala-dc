---
description: Diseñá o cambiá tu personaje de La Sala describiéndolo con tus palabras
argument-hint: <cómo querés tu personaje>
---
Pedido del usuario: $ARGUMENTS

Si el pedido está vacío, preguntale cómo quiere su personaje y no sigas.

Sos quien diseña los personajes de La Sala, la sala del equipo. El personaje es un sprite de pixel art de 16 × 24 píxeles.

1. Leé `~/.claude-sala.json` (en Windows `%USERPROFILE%\.claude-sala.json`) para obtener `url` y `token`. Si no existe, pedile al usuario que corra `/sala-setup` y no sigas. Nunca muestres el token.
2. Pedí el estado actual: `GET <url>/api/avatar?t=<token>`. La respuesta trae `name`, `mode` (`editor` o `ia`), `avatar`, `catalog`, `base` (el personaje actual como `rows` + `palette`), `rules` y `preview`.
3. Elegí el camino:
   - **El pedido entra en el catálogo** (especie, ropa, color, sombrero o accesorio que figuran en `catalog`): mandá solo esos campos con los valores exactos del catálogo: `{"token": "...", "avatar": {"hat": "galera", "extra": "capa"}}`.
   - **El pedido no entra en el catálogo** (un objeto, un tema, un estilo, un personaje nuevo): dibujalo. Si es un cambio sobre lo que ya tiene ("agregale…", "hacé más grande…", "cambiá el color de…"), partí de `base` y tocá solo lo necesario. Si es un personaje nuevo, empezá de cero. Respetá todas las `rules`. Mandá `{"token": "...", "custom": {"rows": [24 textos de 16 caracteres], "palette": {"A": "#rrggbb"}}}`.
   - **Quiere volver al editor de la sala:** mandá `{"token": "...", "custom": null}`.
4. Antes de enviar un dibujo, mostrale al usuario las 24 filas en un bloque de código para que vea la idea.
5. Para enviarlo, guardá el JSON en un archivo temporal y usá `curl -s -X POST <url>/api/avatar -H "content-type: application/json" --data @<archivo>` (en Windows, `curl.exe`). Así evitás problemas con las comillas. Si responde 400, leé `errors`, corregí exactamente eso y reintentá, hasta 3 veces.
6. Cuando quede guardado, avisale que ya lo ve todo el equipo y pasale la vista previa: `<url>` seguido del valor de `preview`. Ofrecé ajustarlo ("¿más grande el sombrero?").

Criterios de diseño: silueta clara, entre 3 y 8 colores, ojos bien visibles, formas grandes porque en la sala se ve a unos 60 px de alto. Si te piden un personaje conocido de una marca, serie o videojuego, hacé uno original inspirado en la idea general en lugar de copiarlo.
