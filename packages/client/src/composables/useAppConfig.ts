import { ref } from 'vue'
import { api } from '../api/client.js'

export interface AppConfigState {
  theme: string
  date_format: string
}

let promise: Promise<AppConfigState> | null = null
const config = ref<AppConfigState>({ theme: 'blue', date_format: 'MM/dd(ddd)' })

const THEMES: Record<string, Record<string, string>> = {
  blue:   { '--accent': '#2563eb', '--accent-dark': '#1d4ed8' },
  green:  { '--accent': '#16a34a', '--accent-dark': '#15803d' },
  purple: { '--accent': '#7c3aed', '--accent-dark': '#6d28d9' },
  dark:   { '--accent': '#3b82f6', '--accent-dark': '#2563eb', '--bg': '#0f172a', '--card': '#1e293b', '--text': '#f1f5f9', '--border': '#334155', '--border-light': '#1e293b' },
}
const ALL_VARS = new Set(Object.values(THEMES).flatMap(t => Object.keys(t)))

export function applyTheme(theme: string) {
  const vars = THEMES[theme] ?? THEMES['blue']
  const root = document.documentElement
  for (const k of ALL_VARS) root.style.removeProperty(k)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}

export function useAppConfig() {
  if (!promise) {
    promise = api.appConfig()
      .then(cfg => {
        config.value = { ...config.value, ...cfg, date_format: cfg.date_format ?? config.value.date_format }
        applyTheme(cfg.theme)
        return config.value
      })
      .catch(() => config.value)
  }
  return {
    config,
    reload: () => { promise = null; return useAppConfig() },
  }
}
