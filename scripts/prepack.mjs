// Swap the top-level entrypoints (main/types/exports/…) to their dist-pointing
// `publishConfig` values before npm builds the tarball, then restore them in
// postpack.mjs. We keep src-pointing entrypoints in the working tree so in-repo
// dev + tests resolve the package to ./src as a single module instance; the
// published package must instead point at ./dist.
//
// This used to be handled by npm applying `publishConfig` field overrides, but
// npm >= 11 dropped that ("Unknown publishConfig config 'exports'") and ignores
// it, so we perform the swap explicitly here — independent of the npm version.
import { readFileSync, writeFileSync } from 'node:fs'

const BACKUP = 'package.json.prepack-backup'
const raw = readFileSync('package.json', 'utf8')
writeFileSync(BACKUP, raw) // exact original bytes, restored by postpack

const pkg = JSON.parse(raw)
const pc = pkg.publishConfig ?? {}
const OVERRIDABLE = ['main', 'module', 'browser', 'types', 'typings', 'bin', 'exports', 'imports']
const swapped = []
for (const key of OVERRIDABLE) {
  if (pc[key] !== undefined) {
    pkg[key] = pc[key]
    swapped.push(key)
  }
}

writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
console.log(`prepack: pointed [${swapped.join(', ')}] at dist for the published tarball`)
