// Franja de La Sala arriba del prompt, dentro de Claude Code: anda igual en cmd, PowerShell, Warp o bash.
// Pregunta /api/estado cada pocos segundos; si la sala está apagada no muestra nada.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { SalaEstado, SalaUsuario } from '../types'

const estado = atom({ plugin: 'sala', key: 'estado' } as const, null)
const oculta = atom({ plugin: 'sala', key: 'oculta' } as const, false)

const icono = (u: SalaUsuario) => (u.away ? '☕' : u.claude === 'working' ? '🤖' : u.claude === 'idle' ? '💤' : '👀')

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
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, estado)
    if (e.props.hasSurvey || !s || (await read($, oculta))) return next(e)

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
