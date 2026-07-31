// Mata procesos residuales de `electron-vite dev` (dev server y Electron del proyecto)
// para evitar pantalla blanca por puerto 5173 ocupado o single-instance lock bloqueado.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const isWin = process.platform === 'win32'

function listProcesses() {
  if (isWin) {
    const ps = [
      'Get-CimInstance Win32_Process |',
      'Select-Object ProcessId, ParentProcessId, CommandLine |',
      'ConvertTo-Json -Compress',
    ].join(' ')
    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: true,
    })
    const parsed = JSON.parse(out.trim())
    const arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return arr.map((p) => ({
      pid: String(p.ProcessId),
      ppid: String(p.ParentProcessId),
      cmd: p.CommandLine ?? '',
    }))
  }
  const out = execSync('ps -eo pid=,ppid=,command=', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
      return m ? { pid: m[1], ppid: m[2], cmd: m[3] } : null
    })
    .filter(Boolean)
}

function matches(proc) {
  if (!proc.cmd) return false
  if (!proc.cmd.includes(root)) return false
  return /electron-vite|electron|vite/.test(proc.cmd)
}

function kill(pid) {
  try {
    if (isWin) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', shell: true })
    } else {
      process.kill(Number(pid), 'SIGKILL')
    }
    return true
  } catch {
    return false
  }
}

const procs = listProcesses()
const targets = procs.filter(matches).sort((a, b) => Number(a.ppid) - Number(b.ppid))

// Mata primero los hijos (orden ascendente por PPID) y luego los padres.
let killed = 0
for (const proc of targets) {
  if (kill(proc.pid)) killed++
}

if (killed > 0) {
  console.log(`[dev-clean] procesos residuales terminados: ${killed}`)
} else {
  console.log('[dev-clean] sin procesos residuales')
}
