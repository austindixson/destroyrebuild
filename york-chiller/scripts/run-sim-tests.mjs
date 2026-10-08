import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'

const entries = ['tests/phase0.test.ts', 'tests/valveAlert.test.ts']
const outdir = mkdtempSync(path.join(tmpdir(), 'york-sim-'))

for (const entry of entries) {
  const outfile = path.join(outdir, `${path.basename(entry, '.ts')}.mjs`)
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    sourcemap: 'inline',
  })
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
