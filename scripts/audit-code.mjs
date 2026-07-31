import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'

const SECRET_PATTERNS = [
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'GitHub PAT clásico', re: /\bghp_[0-9A-Za-z]{36}\b/g },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[0-9A-Za-z_]{30,}\b/g },
  { name: 'Slack token', re: /\bxox[baprs]-(?:[0-9A-Za-z-]){10,}\b/g },
  { name: 'Clave OpenAI/Anthropic', re: /\bsk-[0-9A-Za-z]{20,}\b/g },
  { name: 'Clave Stripe live', re: /\bsk_live_[0-9A-Za-z]{20,}\b/g },
  { name: 'Clave privada PEM', re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g },
  { name: 'Secret duro en código', re: /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{12,}["']/gi },
]

const DEBT_PATTERNS = [
  { name: 'TODO', re: /\bTODO\b/g },
  { name: 'FIXME', re: /\bFIXME\b/g },
  { name: 'HACK', re: /\bHACK\b/g },
]

const SKIP_DIRS = ['node_modules', 'out', 'dist', 'coverage', '.git', '.next']
const SKIP_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.map'])
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'])

const git = spawnSync('git', ['ls-files'], { encoding: 'utf8' })
if (git.status !== 0) {
  console.error('git ls-files falló. Ejecuta este script dentro del repositorio.')
  process.exit(1)
}

const files = git.stdout.split(/\r?\n/).filter(Boolean)

function isScannable(file) {
  if (SKIP_FILES.has(file)) return false
  const normalized = normalize(file).split(sep)
  if (normalized.some((part) => SKIP_DIRS.includes(part))) return false
  if (SKIP_EXTS.has(extname(file).toLowerCase())) return false
  try {
    return statSync(join(process.cwd(), file)).isFile()
  } catch {
    return false
  }
}

let secrets = []
let debtTotal = 0
const debtByFile = new Map()

for (const file of files) {
  if (!isScannable(file)) continue
  const content = readFileSync(join(process.cwd(), file), 'utf8')

  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0
    for (const m of content.matchAll(re)) {
      secrets.push({ file, line: content.slice(0, m.index).split(/\r?\n/).length, name, match: m[0] })
    }
  }

  for (const { re } of DEBT_PATTERNS) {
    re.lastIndex = 0
    const count = [...content.matchAll(re)].length
    if (count > 0) {
      debtTotal += count
      debtByFile.set(file, (debtByFile.get(file) ?? 0) + count)
    }
  }
}

if (secrets.length > 0) {
  console.error(`audit-code: ${secrets.length} posibles secretos detectados:`)
  for (const s of secrets) {
    console.error(`- ${s.file}:${s.line} (${s.name}): ${s.match.slice(0, 24)}…`)
  }
  process.exit(1)
}

console.log('audit-code: sin secretos en archivos versionados.')

if (debtTotal > 0) {
  console.warn(`Deuda detectada (no bloquea): ${debtTotal} marcadores TODO/FIXME/HACK en ${debtByFile.size} archivos.`)
  for (const [file, count] of [...debtByFile.entries()].sort((a, b) => b[1] - a[1])) {
    console.warn(`- ${file}: ${count}`)
  }
}

process.exit(0)
