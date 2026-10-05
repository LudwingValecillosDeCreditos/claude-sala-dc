// La Sala arriba del prompt, dentro de Claude Code: anda igual en cmd, PowerShell, Warp o bash.
// En la terminal es la mini sala animada (scripts/mini.js --celdas dibuja cada cuadro y acá se pinta como Raster).
// Si no hay lugar o no es la terminal, una franja de texto con /api/estado. Con la sala apagada no muestra nada.
import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { SalaEstado, SalaUsuario } from '../types'

const estado = atom({ plugin: 'sala', key: 'estado' } as const, null)
const oculta = atom({ plugin: 'sala', key: 'oculta' } as const, false)

const icono = (u: SalaUsuario) => (u.away ? '☕' : u.claude === 'working' ? '🤖' : u.claude === 'idle' ? '💤' : '👀')

type Cuadro = { rows: number; cols: number; cells: string }

// ponytail: variables del módulo; un hot reload las pierde y session.start las vuelve a armar
let cuadro: Cuadro | null = null
let anchoPedido = 0
let anchoCorriendo = 0
let mini: AsyncGenerator<unknown, unknown> | null = null

async function arrancarMini($: Engine) {
  if (!anchoPedido || anchoPedido === anchoCorriendo) return
  if (mini) await mini.return(undefined).catch(() => {})
  anchoCorriendo = anchoPedido
  cuadro = null
  const proc = $.process.spawn({ argv: ['node', `${$.plugin.root}/scripts/mini.js`, '--celdas', String(anchoPedido)] })
  mini = proc
  let buf = ''
  try {
    for await (const { stream, text } of proc) {
      if (stream !== 'stdout') continue
      buf += text
      const lineas = buf.split('\n')
      buf = lineas.pop() ?? ''
      const ultima = lineas.filter(Boolean).pop()
      if (!ultima) continue
      try {
        cuadro = JSON.parse(ultima)
        $.ui.invalidate('ui.render')
      } catch {}
    }
  } catch {}
  if (mini === proc) { mini = null; anchoCorriendo = 0; cuadro = null; $.ui.invalidate('ui.render') }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    let cfg: { url?: string; token?: string } = {}
    try {
      cfg = JSON.parse(await $.fs.read(`${home}/.claude-sala.json`))
    } catch {}
    if (cfg.url && cfg.token) {
      const url = `${cfg.url.replace(/\/+$/, '')}/api/estado?t=${encodeURIComponent(cfg.token)}`
      const poll = async () => {
        let nuevo: SalaEstado | null = null
        try {
          const r = await $.http.fetch(url)
          if (r.ok) nuevo = JSON.parse(r.text)
        } catch {}
        await update($, estado, () => nuevo)
      }
      void poll()
      $.clock.every(4000, () => void poll()) // ponytail: polling cada 4 s, alcanza para un equipo chico
      // la mini sala arranca (o se rearma al cambiar el ancho) cuando la franja ya sabe cuánto mide
      $.clock.every(1000, () => void arrancarMini($))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, estado)
    if (e.props.hasSurvey || !s || (await read($, oculta))) return next(e)

    if (e.surface === 'terminal') {
      anchoPedido = Math.max(44, Math.min(512, e.props.bodyColumns))
      const { Raster } = $.ui.resolve(e)
      if (cuadro && cuadro.cols === anchoPedido && cuadro.rows <= e.props.maxRows) {
        return <Raster key="mini" columns={cuadro.cols} rows={cuadro.rows} cells={cuadro.cells} />
      }
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap">
        <Text color="cyan" bold>🛋️ La Sala </Text>
        {s.users.length === 0 ? <Text dimColor>no hay nadie todavía </Text> : null}
        {s.users.map(u => (
          <Text key={u.name} color={u.claude === 'working' ? 'green' : undefined} dimColor={u.claude !== 'working'}>
            {icono(u)} {u.name}{'  '}
          </Text>
        ))}
        <Text dimColor>{s.users.length}/{s.team.length} </Text>
        <Button key="ocultar" label="Ocultar" onPress={() => update($, oculta, () => true)} />
      </Box>
    )
  })
}
