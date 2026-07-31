import { spawnSync } from 'node:child_process'

const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const ALLOWED = new Map([
  [
    'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
    'react-router CSRF en modo RSC/SSR. DocuMind es un SPA Electron con HashRouter (sin RSC/SSR), por lo que el vector no es explotable. Se eliminará al migrar a react-router 8 + React 19.',
  ],
])

const { stdout, status } = spawnSync(npmBin, ['audit', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

if (status === 0) {
  console.log('npm audit: sin vulnerabilidades.')
  process.exit(0)
}

let report
try {
  report = JSON.parse(stdout.replace(/^\uFEFF/, ''))
} catch {
  console.error('No se pudo parsear la salida de npm audit:')
  console.error(stdout)
  process.exit(1)
}

const vulnerabilities = report.vulnerabilities ?? {}
const remaining = new Map()

for (const info of Object.values(vulnerabilities)) {
  const via = Array.isArray(info.via) ? info.via : []
  for (const v of via) {
    if (typeof v === 'object' && v.url) remaining.set(v.url, { name: info.name, title: v.title })
  }
}

const blocked = [...remaining].filter(([url]) => !ALLOWED.has(url))

if (blocked.length === 0) {
  for (const [url, detail] of remaining) {
    console.warn(`[allowlist] ${detail.name}: ${detail.title}`)
    console.warn(`  ${url}`)
    console.warn(`  Motivo: ${ALLOWED.get(url)}`)
  }
  console.log('npm audit: OK (solo advisories permitidos y documentados).')
  process.exit(0)
}

console.error(`npm audit: ${report.metadata?.vulnerabilities?.total ?? '?'} vulnerabilidades sin permitir:`)
for (const [url, detail] of blocked) {
  console.error(`- ${detail.name}: ${detail.title}`)
  console.error(`  ${url}`)
}
process.exit(1)
