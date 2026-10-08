import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const outfile = '/tmp/york-phase0.test.mjs'

await build({
  entryPoints: ['tests/phase0.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  sourcemap: 'inline',
})

const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' })
process.exit(result.status ?? 1)
