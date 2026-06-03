// Restore the working-tree package.json that prepack.mjs swapped to dist-pointing
// entrypoints, so the repo is left exactly as it was (src-pointing).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const BACKUP = 'package.json.prepack-backup'
if (existsSync(BACKUP)) {
  writeFileSync('package.json', readFileSync(BACKUP, 'utf8'))
  rmSync(BACKUP)
  console.log('postpack: restored src-pointing package.json')
}
