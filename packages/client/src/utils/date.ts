export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Format a "YYYY-MM-DD" date string using a token-based format string.
 * Supported tokens: YYYY, MM, dd, ddd
 */
export function formatDate(dateStr: string, fmt: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, d).getDay()
  return fmt
    .replace('YYYY', String(y))
    .replace('MM',   String(mo).padStart(2, '0'))
    .replace('ddd',  DAY_NAMES[dow])
    .replace('dd',   String(d).padStart(2, '0'))
}

/** Format a date string with the given display format (defaults to MM/dd(ddd)). */
export function dayLabel(dateStr: string, format = 'MM/dd(ddd)'): string {
  return formatDate(dateStr, format)
}
