// La Sala arriba del prompt, dentro de Claude Code: anda igual en cmd, PowerShell, Warp o bash.
// Por defecto una barra de una línea: quién está conectado o con Claude, y un botón para entrar a la sala completa.
// Con /sala-franja chica|mediana|grande es la mini sala animada (scripts/mini.js --celdas dibuja cada cuadro y acá
// se pinta como Raster). Con la sala apagada no muestra nada.
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
let tam = 'barra' // "franja" en ~/.claude-sala.json: barra | chica | mediana | grande | apagada (/sala-franja)
const animada = () => tam === 'chica' || tam === 'mediana' || tam === 'grande'
let corriendo = ''
let mini: AsyncGenerator<unknown, unknown> | null = null

async function arrancarMini($: Engine) {
  const quiero = !animada() || !anchoPedido ? '' : `${anchoPedido}|${tam}` // la barra no corre nada aparte
  if (quiero === corriendo) return
  if (mini) await mini.return(undefined).catch(() => {})
  corriendo = quiero
  cuadro = null
  if (!quiero) { mini = null; $.ui.invalidate('ui.render'); return }
  const proc = $.process.spawn({ argv: ['node', `${$.plugin.root}/scripts/mini.js`, '--celdas', String(anchoPedido), '--tam', tam] })
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
  if (mini === proc) { mini = null; corriendo = ''; cuadro = null; $.ui.invalidate('ui.render') }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const archivo = `${home}/.claude-sala.json`
    let cfg: { url?: string; token?: string; franja?: string } = {}
    try {
      cfg = JSON.parse(await $.fs.read(archivo))
    } catch {}
    tam = cfg.franja ?? 'barra'
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
      // también relee el tamaño elegido, así /sala-franja se ve al instante
      $.clock.every(1000, () => {
        void (async () => {
          try {
            tam = JSON.parse(await $.fs.read(archivo)).franja ?? 'barra'
          } catch {}
          await arrancarMini($)
        })()
      })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, estado)
    if (e.props.hasSurvey || !s || tam === 'apagada' || (await read($, oculta))) return next(e)

    if (e.surface === 'terminal' && animada()) {
      anchoPedido = Math.max(44, Math.min(512, e.props.bodyColumns))
      const { Raster } = $.ui.resolve(e)
      if (cuadro && cuadro.cols === anchoPedido && cuadro.rows <= e.props.maxRows) {
        return <Raster key="mini" columns={cuadro.cols} rows={cuadro.rows} cells={cuadro.cells} />
      }
    }

    // la barra: una línea, quién está y el botón para entrar (a la sala entra solo quien lo aprieta o usa /sala-abrir)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap">
        <Text color="cyan" bold>🛋️ La Sala </Text>
        {s.users.length === 0 ? <Text dimColor>· nadie conectado </Text> : <Text dimColor>· </Text>}
        {s.users.map(u => (
          <Text key={u.name} color={u.claude === 'working' ? 'green' : undefined} dimColor={u.claude !== 'working'}>
            {icono(u)} {u.name}{'  '}
          </Text>
        ))}
        <Button
          key="entrar"
          label="Entrar a la sala"
          onPress={async () => {
            $.ui.toast('Abriendo La Sala…')
            try {
              const r = await $.process.run(['node', `${$.plugin.root}/scripts/abrir.js`])
              const linea = r.stdout.trim().split('\n').pop()
              if (linea) $.ui.toast(linea)
            } catch {
              // donde no se pueden correr programas (según la app), el comando lo hace Claude
              $.ui.toast('Escribí /sala-abrir para entrar a la sala')
            }
          }}
        />
        <Text> </Text>
        <Button key="ocultar" label="Ocultar" onPress={() => update($, oculta, () => true)} />
      </Box>
    )
  })
}
