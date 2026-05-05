import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { validateRawContent } from '../domain/parser.js'
import { rawDir } from '../infrastructure/data.js'

function secureFilename(name: string): string {
  return name
    .split(/[\\/]/).pop()!
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^[._]+/, '')
}

export function listRawFiles(): object[] {
  const d = rawDir()
  if (!existsSync(d)) return []
  return readdirSync(d)
    .filter(n => n.endsWith('.txt'))
    .sort()
    .map(n => {
      const st = statSync(join(d, n))
      return { name: n, size: st.size, modified: st.mtimeMs / 1000 }
    })
}

export function saveRawFile(name: string, content: string): { ok: boolean; error: string } {
  const safe = secureFilename(name)
  if (!safe) return { ok: false, error: 'No filename.' }
  if (!safe.toLowerCase().endsWith('.txt')) return { ok: false, error: 'Only .txt files are accepted.' }
  const { ok, error } = validateRawContent(content)
  if (!ok) return { ok: false, error }
  const d = rawDir()
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, safe), content, 'utf-8')
  return { ok: true, error: '' }
}

export function deleteRawFile(filename: string): { ok: boolean; error: string } {
  const safe = secureFilename(filename)
  if (!safe.toLowerCase().endsWith('.txt')) return { ok: false, error: 'Invalid file.' }
  const p = join(rawDir(), safe)
  if (!existsSync(p)) return { ok: false, error: 'File not found.' }
  unlinkSync(p)
  return { ok: true, error: '' }
}
