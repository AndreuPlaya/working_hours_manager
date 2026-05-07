import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDataRoot, loadAppConfig, saveAppConfig } from '../infrastructure/settings.js'
import type { AppConfig } from '../infrastructure/settings.js'

export type { AppConfig }

export function getAppConfig(): AppConfig {
  return loadAppConfig()
}

export function updateAppConfig(patch: { time_format?: string; theme?: string; date_format?: string }): void {
  const cfg = loadAppConfig()
  if (patch.time_format === '24h' || patch.time_format === '12h') cfg.time_format = patch.time_format
  if (typeof patch.theme === 'string') cfg.theme = patch.theme.trim() || undefined
  if (typeof patch.date_format === 'string') cfg.date_format = patch.date_format.trim() || undefined
  saveAppConfig(cfg)
}

const ALLOWED_FAVICON_EXTS = ['ico', 'png', 'svg', 'jpg', 'jpeg']

export function saveFavicon(buffer: Buffer, ext: string): { ok: boolean; ext?: string; error?: string } {
  if (!ALLOWED_FAVICON_EXTS.includes(ext)) return { ok: false, error: 'Unsupported file type.' }
  const dir = join(getDataRoot(), 'config')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `favicon.${ext}`), buffer)
  const cfg = loadAppConfig()
  cfg.favicon_ext = ext
  saveAppConfig(cfg)
  return { ok: true, ext }
}
