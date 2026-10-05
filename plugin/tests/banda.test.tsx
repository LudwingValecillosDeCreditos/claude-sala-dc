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
function pc(on: On, { config = true, server = true, franja = undefined as string | undefined } = {}) {
  const clock = mock.clock(on)
  mock.env(on, { USERPROFILE: 'C:/Users/x' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> }) // el motor: franja vacía
  on('fs.read', (_$, e) => {
    if (!config || e.path.replaceAll('\\', '/') !== 'C:/Users/x/.claude-sala.json') throw new Error('no existe ' + e.path)
    return { value: JSON.stringify({ url: 'http://10.0.0.1:3000/', token: 'tok', franja }) }
  })
  on('http.fetch', (_$, e) => {
    if (!server) throw new Error('sin conexión')
    expect(e.url).toBe('http://10.0.0.1:3000/api/estado?t=tok')
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(SALA) } }
  })
  return clock
}

test('por defecto es una barra de una línea: quién está, Entrar abre la sala y Ocultar la esconde', async ($, on) => {
  pc(on)
  const corridos: string[][] = []
  on('process.run', (_$, e) => {
    corridos.push([...e.argv])
    return { value: { exitCode: 0, stdout: 'Listo: Claude Code a la izquierda y La Sala a la derecha.\n', stderr: '' } }
  })
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '.', surface: 'terminal' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'sala', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /🤖 Micaela/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /☕ Axel/ })).toBeDefined()
    expect(await ui.find({ key: 'entrar' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'sala', surface: 'terminal', ...BAND })
  await ui.press({ key: 'entrar' })
  expect(corridos[0]?.[0]).toBe('node')
  expect(corridos[0]?.[1]).toContain('abrir.js')
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

test('en la terminal dibuja la mini sala animada con los cuadros de mini.js', async ($, on) => {
  const clock = pc(on, { franja: 'grande' })
  const pedidos: string[][] = []
  on('process.spawn', async function* (_$, e) {
    pedidos.push([...e.argv])
    const cols = Number(e.argv[e.argv.indexOf('--celdas') + 1])
    const cells = btoa(String.fromCharCode(...new Uint8Array(new Uint32Array(cols * 2 * 3).fill(0x41).buffer)))
    yield { stream: 'stdout', text: JSON.stringify({ rows: 2, cols, cells }) + '\n' }
    await new Promise(() => {}) // mini.js sigue corriendo
    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '.', surface: 'terminal' } as never)
  const props = { ...BAND.props, bodyColumns: 80, maxRows: 20 }
  let ui = await $.ui.mount({ plugin: 'sala', surface: 'terminal', component: 'AbovePrompt', props })
  await clock.advance(1000)
  for (let i = 0; i < 20 && !pedidos.length; i++) await clock.advance(0) // relee la config y después arranca
  await ui.unmount()
  expect(pedidos[0]?.slice(-4)).toEqual(['--celdas', '80', '--tam', 'grande'])
  expect(pedidos[0]?.[1]).toContain('mini.js')
  ui = await $.ui.mount({ plugin: 'sala', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ key: 'mini' })).toBeDefined()
  await ui.unmount()
})

test('con /sala-franja apagada no dibuja nada', async ($, on) => {
  pc(on, { franja: 'apagada' })
  await $.session.start({ cwd: '.', surface: 'terminal' } as never)
  const ui = await $.ui.mount({ plugin: 'sala', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /La Sala/ })).toBeUndefined()
  await ui.unmount()
})

test('si la app no deja correr programas, Entrar avisa que se use /sala-abrir', async ($, on) => {
  pc(on)
  const avisos: string[] = []
  on('process.run', () => { throw new Error('no disponible') })
  on('ui.toast', (_$, e) => { avisos.push(String((e as { text?: string }).text ?? JSON.stringify(e))); return { value: undefined } })
  await $.session.start({ cwd: '.', surface: 'desktop' } as never)
  const ui = await $.ui.mount({ plugin: 'sala', surface: 'desktop', ...BAND })
  await ui.press({ key: 'entrar' })
  expect(avisos.join(' ')).toContain('/sala-abrir')
  await ui.unmount()
})
