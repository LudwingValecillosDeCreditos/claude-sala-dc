#!/usr/bin/env node
'use strict';
// /sala-abrir en Windows: la terminal (la ventana activa) a la mitad izquierda y La Sala a la derecha,
// como ventana de aplicación de Chrome o Edge. Uso: node abrir.js [completa|pestaña]
// Sale con código 2 fuera de Windows: ahí el comando sigue sus propias instrucciones.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let cfg;
try { cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude-sala.json'), 'utf8')); } catch {}
if (!cfg || !cfg.url || !cfg.token) { console.log('Falta configurar La Sala (~/.claude-sala.json).'); process.exit(1); }
if (process.platform !== 'win32') process.exit(2);

const url = `${cfg.url.replace(/\/+$/, '')}/?t=${encodeURIComponent(cfg.token)}`;
const modo = process.argv[2] || '';

if (modo === 'pestaña' || modo === 'pestana') {
  spawnSync('cmd', ['/c', 'start', '""', url], { windowsVerbatimArguments: true });
  console.log('La Sala se abrió en una pestaña.');
  process.exit(0);
}

const ps = `
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public class SalaW {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // ventanas visibles de Chrome o Edge
  public static List<IntPtr> Browsers() {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (IsWindowVisible(h)) try {
        var n = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
        if (n == "chrome" || n == "msedge") r.Add(h);
      } catch {}
      return true;
    }, IntPtr.Zero);
    return r;
  }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[SalaW]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
$t = [SalaW]::GetForegroundWindow()
$a = [System.Windows.Forms.Screen]::FromHandle($t).WorkingArea
$completa = $env:SALA_MODO -eq 'completa'
$mitad = [int]($a.Width / 2)
if (-not $completa) { [SalaW]::ShowWindow($t, 9) | Out-Null; [SalaW]::MoveWindow($t, $a.X, $a.Y, $mitad, $a.Height, $true) | Out-Null }
$antes = [SalaW]::Browsers()
$argv = @("--app=$env:SALA_URL", "--new-window")
$ok = $false
foreach ($b in 'chrome', 'msedge') { try { Start-Process $b -ArgumentList $argv -ErrorAction Stop; $ok = $true; break } catch {} }
if (-not $ok) { Start-Process $env:SALA_URL; 'pestaña'; exit }
# la ventana nueva del navegador: la llevamos a la derecha (o a toda la pantalla)
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 150
  $n = [SalaW]::Browsers() | Where-Object { $antes -notcontains $_ } | Select-Object -First 1
  if ($n) {
    if ($completa) { [SalaW]::MoveWindow($n, $a.X, $a.Y, $a.Width, $a.Height, $true) | Out-Null }
    else { [SalaW]::MoveWindow($n, $a.X + $mitad, $a.Y, $a.Width - $mitad, $a.Height, $true) | Out-Null }
    'ok'; exit
  }
}
'sin-mover'
`;

const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
  encoding: 'utf8', env: { ...process.env, SALA_URL: url, SALA_MODO: modo },
});
const out = (r.stdout || '').trim().split(/\r?\n/).pop();
console.log({
  ok: modo === 'completa' ? 'La Sala se abrió a pantalla completa.' : 'Listo: Claude Code a la izquierda y La Sala a la derecha.',
  'pestaña': 'No encontré Chrome ni Edge: La Sala se abrió en una pestaña del navegador.',
  'sin-mover': 'La Sala se abrió, pero no pude acomodarla: arrastrala a la mitad derecha (Windows + →).',
}[out] || `No pude abrir La Sala: ${(r.stderr || '').trim().slice(0, 300)}`);
