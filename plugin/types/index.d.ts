export type SalaUsuario = { name: string; claude: 'working' | 'idle' | 'off'; away: boolean }
export type SalaEstado = { team: string[]; users: SalaUsuario[] }

declare module 'claude-code' {
  interface PluginState {
    sala: { estado: SalaEstado | null; oculta: boolean }
  }
}
