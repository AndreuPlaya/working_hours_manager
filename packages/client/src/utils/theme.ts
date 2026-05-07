export const THEMES: Record<string, Record<string, string>> = {
  blue:   { '--accent': '#2563eb', '--accent-dark': '#1d4ed8' },
  green:  { '--accent': '#16a34a', '--accent-dark': '#15803d' },
  purple: { '--accent': '#7c3aed', '--accent-dark': '#6d28d9' },
  dark:   { '--accent': '#3b82f6', '--accent-dark': '#2563eb', '--bg': '#0f172a', '--card': '#1e293b', '--text': '#f1f5f9', '--border': '#334155', '--border-light': '#1e293b' },
}

export const THEME_OPTIONS = [
  { id: 'blue',   label: 'Blue',   color: '#2563eb' },
  { id: 'green',  label: 'Green',  color: '#16a34a' },
  { id: 'purple', label: 'Purple', color: '#7c3aed' },
  { id: 'dark',   label: 'Dark',   color: '#0f172a' },
] as const

const ALL_VARS = new Set(Object.values(THEMES).flatMap(t => Object.keys(t)))

export function applyTheme(theme: string) {
  const vars = THEMES[theme] ?? THEMES['blue']
  const root = document.documentElement
  for (const k of ALL_VARS) root.style.removeProperty(k)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}
