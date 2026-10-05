# La Sala 🛋️ v0.8.1

Un lugar para pasar el rato con el equipo **mientras tu Claude trabaja**. Cuando le pedís algo a Claude Code, un robotito se sienta en tu escritorio y trabaja por vos; tu personaje queda libre para charlar, cuidar su mascota o jugar una partida. La sala te avisa cuando tu Claude te necesita o termina.

## No es una herramienta de control

- Los demás solo ven si tu Claude está trabajando o no. **Qué hace, cuánto tarda y si te pide permiso lo ves solo vos**, en la tira de arriba. El servidor directamente no se lo manda a nadie más (hay una prueba que lo verifica).
- Aparecés en la sala solo si la tenés abierta. Si usás Claude sin abrirla, se ve únicamente el robotito en tu escritorio.
- No hay niveles ni rankings, y usar más Claude no da monedas. Las monedas salen de pasar por la sala (10 por día), jugar (3, y 10 más si ganás) y, con tope, de que tu Claude termine tareas.
- Modo invisible desde la pestaña Personaje o con `/sala-invisible`.

## Al lado de la terminal

`/sala-abrir` la abre como ventana de aplicación en la mitad derecha de la pantalla, sin barras del navegador. Todo entra en la ventana: la sala se ajusta al alto disponible y abajo quedan las pestañas (Equipo, Juegos, Mascota, Personaje). Con "Ampliar sala" la sala ocupa todo. En VS Code también se puede abrir en un panel con "Simple Browser: Show".

**Avisos:** el botón "Avisos" activa notificaciones del sistema para cuando estás en otra ventana: tu Claude te necesita, tu Claude terminó o alguien te desafía. Aunque no las actives, el título de la pestaña te avisa. Si estás en plena partida y tu Claude te necesita, aparece un cartel en el tablero.

**Invitar a alguien:** `npm run sumar -- "Flor"` imprime un link `/unirse?t=...` con los pasos y botones para copiar los comandos.

## Dos formas de verla

- **Sala grande** (`/sala-abrir`): en el navegador, a media pantalla al lado de la terminal o con "Ampliar sala". Tiene todo: juegos, mascota, personaje y charla.
- **Mini sala** (`/sala-mini`): una franja en la misma terminal, debajo de Claude Code, con los personajes y sus mascotas caminando. Claude divide la terminal sola si usás tmux, Windows Terminal o iTerm2; en VS Code te deja el comando listo para pegar en una terminal dividida.

Teclas de la mini sala: ← → caminar · 1–8 emotes · `m` mensaje · `p` mimos · `g` galletita · `c` tamaño (chica de 11 líneas o grande de 17) · `s` abrir la sala grande · `q` salir.

Las dos están conectadas: los que están en la mini aparecen en la sala grande y al revés, y los emotes y mensajes se ven en las dos. Los avisos de "tu Claude te necesita" y "terminó" llegan también a la mini, con un pitido. Los juegos se juegan en la sala grande: si te desafían estando en la mini, te avisa y con `s` la abrís.

La mini sala no usa dependencias: dibuja con medios bloques de color (2 píxeles por carácter) y usa colores de 24 bits, o 256 colores en terminales que no los soportan, como la Terminal de macOS.

## Estilo visual

Todo es pixel art con la paleta Sweetie 16. Los personajes (16 × 24) y las mascotas (16 × 12) se dibujan a partir de mapas de caracteres en `server/public/sprites.js`, el mismo motor que usa la mini sala.

- **Luz y sombra automáticas:** luz cálida arriba a la izquierda, sombra fría abajo a la derecha y un contorno del color oscuro de cada parte, en vez de negro parejo. Se aplica a todo, incluidos los diseños hechos con IA, que se pintan con colores planos.
- **Animación:** cada personaje parpadea a su ritmo y alterna los pies al caminar. Las mascotas también caminan.
- **Peinados:** corto, largo, rulos, rapado, colita o pelado, en 8 colores. El color del pelo también se usa para la barba.
- **En la mini sala:** en modo grande se ve con todo el detalle; en compacto, el dibujo se reduce primero y lleva solo el contorno, que a ese tamaño se lee mejor.
- La sala sigue la hora de cada uno (día, atardecer y noche), los monitores muestran código mientras Claude trabaja y los minijuegos se abren en una pantalla tipo arcade.
- Las fuentes (Pixelify Sans y Press Start 2P, licencia OFL) las sirve el propio servidor. Respeta el modo oscuro del sistema y la preferencia de reducir movimiento.

## Personaje con IA desde Claude Code

Cada uno puede pedirle a su Claude Code que le diseñe o le cambie el personaje con sus propias palabras:

```
/sala-personaje un astronauta con casco dorado
/sala-personaje agregale una antena roja al casco
/sala-personaje ponele galera y capa
/sala-personaje volvé al editor
```

También funciona sin el comando ("cambiá mi personaje de la sala por un pirata"), porque el plugin incluye una skill que Claude usa cuando reconoce el pedido.

Cómo funciona:

- Si el pedido entra en el catálogo (especie, ropa, colores, sombrero o accesorio), Claude elige esas opciones y el personaje sigue siendo editable desde la sala.
- Si no entra, Claude **dibuja el sprite píxel por píxel** (16 × 24, hasta 16 colores) y lo sube. Antes de enviarlo te muestra la grilla en la terminal.
- Para cambios sobre lo que ya tenés, parte del diseño actual y toca solo lo necesario.
- El servidor valida cada diseño (medidas, colores, caracteres, que esté parado en el piso) y, si algo está mal, le dice exactamente qué corregir para que reintente.
- La vista previa queda en `/api/avatar.svg?name=<nombre>`.

Mientras uses un diseño de IA, el editor de la sala queda en pausa; el botón "Volver al editor" lo devuelve.

API (la usa el plugin): `GET /api/avatar?t=<token>` devuelve el personaje actual, el catálogo y las reglas de dibujo. `POST /api/avatar` acepta `{token, avatar}`, `{token, custom: {rows, palette}}` o `{token, custom: null}`.

## Más ropa, mascotas animadas y sonidos

- **Ropa:** remera, buzo, traje, campera, vestido y overol.
- **En la cabeza:** gorra, corona, auriculares, gorro, galera, moño, pañuelo y cuernitos.
- **Accesorios:** anteojos, lentes de sol, bufanda, barba, parche, capa y collar.
- **Mascotas:** se animan al comer (la comida vuela hacia la boca), al jugar con la pelota (saltan) y con los mimos (corazones). Lo ve toda la sala.
- **Sonidos retro opcionales:** el botón de arriba los activa. Se sintetizan en el navegador, sin archivos: mensajes, tareas terminadas, desafíos, jugadas, victoria y derrota, la mascota comiendo, el "¡YA!" de Reflejos y el estreno de un personaje. Arrancan apagados y la preferencia queda guardada en cada navegador.
- Si dos personas libres caen en el mismo lugar, la sala las separa sola para que nadie quede tapado.

## Qué hay en el repo

- **plugin/**: plugin de Claude Code. Sus hooks avisan cuando abrís Claude, mandás un prompt, Claude usa una herramienta, te pide permiso o termina.
- **server/**: servidor Node que corre en tu PC. Guarda personajes, mascotas, monedas y partidas, y sirve la sala web.

El plugin **solo envía** el tipo de evento, un id de sesión, tu token y el nombre de la herramienta (por ejemplo `Edit` o `Bash`). Nunca manda prompts, código, rutas ni contenido de archivos. Hay una prueba automática que lo verifica.

## Puesta en marcha

### Vos (una vez)

1. Subí esta carpeta a un repositorio de GitHub. No tiene secretos: los tokens y los datos quedan afuera gracias al `.gitignore`. Si el repo es privado, cada compañero necesita acceso con su cuenta de GitHub.
2. Hacé doble clic en **`iniciar`**: `iniciar.bat` en Windows, `iniciar.command` en Mac o `iniciar.sh` en Linux. En Mac, la primera vez puede decir que es de un desarrollador no identificado: clic derecho → Abrir → Abrir. La primera vez instala lo que falta y te pregunta el repositorio (`usuario/repo`) y los nombres del equipo, incluido vos.
3. Se genera **`server/mensajes-para-el-equipo.txt`** con un mensaje para cada persona. Mandale a cada uno **solo el suyo, por privado**, porque tiene su token. Pegá el tuyo en tu propio Claude Code.
4. Si Windows pregunta por el firewall, permití el acceso en redes privadas.

Dejá abierta la ventana de `iniciar` mientras el equipo use la sala. Si tu PC está apagada no se rompe nada: simplemente no hay sala ese rato.

### Cada compañero

Pega su mensaje en Claude Code. Claude revisa que tenga Node, guarda la configuración, prueba la conexión y deja el plugin activado. Después cierra y vuelve a abrir Claude Code y escribe `/sala-abrir`.

Si al reabrir no aparece `/sala-abrir`, el mensaje ya trae los dos comandos de respaldo (`/plugin marketplace add …` y `/plugin install …`).

### Sumar a alguien después

`npm run sumar -- "Nombre"` dentro de `server` imprime su mensaje listo para mandar. También le podés mandar el link `http://<tu-ip>:3000/unirse?t=<token>`, que muestra el mensaje con un botón para copiarlo.

### Opcional

- **Solo la VPN:** en `server/sala.config.json` podés fijar `"url"` si la IP de la VPN que detecta no es la correcta. Para que solo entre gente de la VPN, arrancá con `SALA_PERMITIR=10.8.0.0/24` (el rango de tu VPN).
- **Que arranque sola con la PC:** `npm i -g pm2`, después `pm2 start iniciar.js --name sala -- --no-preguntar`, `pm2 save` y `pm2 startup`.
- **Si algo no anda:** `npm run diagnostico` en tu PC, o `/sala-diagnostico` en el Claude Code de quien tenga el problema.
- **Actualizar:** subís los cambios al repo; cada uno actualiza el plugin desde `/plugin`. Vos reemplazás la carpeta `server` sin pisar `team.json`, `data.json` ni `sala.config.json`.

## Estados

| Estado | Cuándo |
|---|---|
| Trabajando | Tu Claude está haciendo algo. Los demás ven el robotito en tu escritorio; el detalle (qué hace y hace cuánto) lo ves solo vos. |
| Te necesita | Claude te pidió permiso. Solo vos lo ves: la tira se pone amarilla, el robot muestra un "!" y llega el aviso. |
| Libre | Claude terminó. |
| Descansando | Más de 15 minutos sin actividad de Claude y sin la sala abierta. Si Claude se cerró de golpe, a los 20 minutos pasa acá. |
| En la sala | Tenés la sala abierta. |
| Jugando | Estás en una partida: tu personaje se va a la sala de juegos. Se puede jugar aunque tu Claude esté trabajando: es la idea. |

## Mascota

Cada uno tiene una: perrito, gatito, pollito o slime, con el nombre que quieras. Tiene **panza** y **ánimo**, que bajan despacito (de lleno a vacío en un día, más o menos). Cuando tiene hambre o está triste lo muestra arriba de la cabeza. Nunca se muere ni se va.

Mientras trabajás con Claude, la mascota se sube al escritorio y se entretiene (duerme, juega con un ovillo, mira la pantalla).

**Monedas:** empezás con 20. Ganás 10 por pasar por la sala cada día, 3 por jugar una partida y 10 más si ganás, y 2 cada vez que tu Claude termina una tarea de más de un minuto (hasta 10 por día). Usar más herramientas no da monedas. En la tienda hay galletita (10), pizza (25), torta (60) y pelota (20). Los mimos son gratis, uno por minuto.

## Minijuegos

Desde el panel "Sala de juegos" elegís un juego y desafiás a alguien. Se puede desafiar a cualquiera que tenga la sala grande abierta, aunque su Claude esté trabajando (es justamente el mejor momento). A quien está solo en la mini sala no: le llega el aviso y la abre con `s`. La invitación vence al minuto.

- **Ta-te-ti**
- **Cuatro en línea**
- **Reflejos**: cuando el botón se pone verde, gana el que toca primero. Si tocás antes, perdés la ronda. Gana el primero en llegar a 2. Cada navegador mide su propio tiempo desde que ve el verde, así la latencia de la VPN no le da ventaja a nadie. También funciona con la barra espaciadora.

Si alguien se desconecta en plena partida, tiene 8 segundos para volver (por ejemplo, si recargó la página). Si no vuelve, pierde por abandono.

## Pruebas

`npm test` levanta servidores aislados y simula el equipo completo:

- **Conexión:** computadoras con su propia configuración ejecutando el hook real tal como lo corre Claude Code, una sesión completa vista desde el navegador de otro, dos terminales de la misma persona, 10 personas en paralelo, servidor apagado o VPN caída (el hook no traba a Claude), token inválido, plugin sin configurar, alguien nuevo sin reiniciar, reconexión del navegador, espectador sin permisos, limpieza cuando Claude se cierra de golpe.
- **Privacidad:** verifica que no viajen prompts, rutas ni contenido, y que el modo invisible no mande nada.
- **Red y VPN:** lista blanca por HTTP y WebSocket, conexión por la IP de red en lugar de localhost, y que el servidor vea la IP real de cada uno.
- **Juegos:** reglas de los tres juegos, partidas completas entre dos navegadores, jugadas fuera de turno, invitaciones rechazadas y vencidas, abandono y recarga de página.
- **Mascota:** desgaste, tienda, mimos, bono diario, tope de monedas por tareas y migración de los datos de versiones anteriores.
- **Plugin:** que los JSON del marketplace, del plugin y de los hooks estén bien armados, y que la skill y el comando de personaje tengan las mismas instrucciones.
- **Personaje:** que las más de 60.000 combinaciones del editor (con peinados y cuadros de animación) generen sprites válidos, que la luz no toque ojos ni detalles, la validación de diseños de IA, el flujo completo que hace Claude Code (leer, subir con errores, corregir, iterar, volver al catálogo) y que la lista blanca también proteja esa API.
- **Mini sala:** conexión desde la terminal, emotes, mensajes y mimos, que no se pueda hacer nada más desde ahí, el dibujo (cada fila mide justo el ancho de la terminal, con emojis), la separación de personajes y que el motor de sprites del plugin sea idéntico al del servidor.
- **Invitación:** el mensaje para pegarle a Claude Code, la página `/unirse`, el arranque con `iniciar` y que los datos privados no se suban al repositorio.
- **Robustez:** datos malformados por todas las entradas (HTTP y WebSocket) no pueden tirar el servidor.

## Límites conocidos

- La oficina se acomoda hasta 16 escritorios (con más de 9, los escritorios se achican). La sala de juegos muestra cómodas 2 partidas a la vez; puede haber más.
- La detección de "pidió permiso" depende del texto de la notificación de Claude Code.
- En Reflejos el tiempo lo informa cada navegador. Entre compañeros alcanza; no es a prueba de tramposos.
- El servidor no usa HTTPS. Dentro de la VPN el tráfico ya va cifrado, pero no lo expongas a internet.
