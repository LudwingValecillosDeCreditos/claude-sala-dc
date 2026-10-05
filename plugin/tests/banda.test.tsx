import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } } as const
const SALA = {
  type: 'state',
  team: ['Ludwing', 'Micaela', 'Axel'],
  users: [
    { name: 'Micaela', claude: 'working', away: false },
    { name: 'Axel', claude: 'idle', away: true },
  ],
}

// Debajo del plugin: la carpeta de usuario, ~/.claude-sala.json y el servidor.
function pc(on: On, { config = true, server = true } = {}) {
  mock.clock(on)
  mock.env(on, { USERPROFILE: 'C:/Users/x' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> }) // el motor: franja vacía
  on('fs.read', (_$, e) => {
    if (!config || e.path.replaceAll('\\', '/') !== 'C:/Users/x/.claude-sala.json') throw new Error('no existe ' + e.path)
    return { value: JSON.stringify({ url: 'http://10.0.0.1:3000/', token: 'tok' }) }
  })
  on('http.fetch', (_$, e) => {
    if (!server) throw new Error('sin conexión')
    expect(e.url).toBe('http://10.0.0.1:3000/api/estado?t=tok')
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(SALA) } }
  })
}

test('la franja muestra al equipo y se oculta con el botón', async ($, on) => {
  pc(on)
  await $.session.start({ cwd: '.', surface: 'terminal' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'sala', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /🤖 Micaela/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /☕ Axel/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\/3/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'sala', surface: 'terminal', ...BAND })
  await ui.press({ key: 'ocultar' })
  expect(await ui.find({ type: 'Text', text: /Micaela/ })).toBeUndefined()
  await ui.unmount()
})

for (const [caso, opts] of [['sala apagada', { server: false }], ['sin configurar', { config: false }]] as const) {
  test(`${caso}: no dibuja nada`, async ($, on) => {
    pc(on, opts)
    await $.session.start({ cwd: '.', surface: 'terminal' } as never)
    const ui = await $.ui.mount({ plugin: 'sala', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /La Sala/ })).toBeUndefined()
    await ui.unmount()
  })
}
