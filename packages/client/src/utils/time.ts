/** Extract HH:MM from a "YYYY-MM-DD HH:MM:SS" timestamp. */
export function fmtTime(ts: string): string {
  return ts.slice(11, 16)
}

/** Format milliseconds as "XhMM". Returns '—' for zero/negative. */
export function fmtMs(ms: number): string {
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h${String(m).padStart(2, '0')}`
}

/** Milliseconds between two timestamps. Returns 0 for incomplete/invalid ranges. */
export function msFromDuration(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0
  const ms = new Date(clockOut.replace(' ', 'T')).getTime()
           - new Date(clockIn.replace(' ', 'T')).getTime()
  return ms > 0 ? ms : 0
}

/** Convert "YYYY-MM-DD HH:MM:SS" to the "YYYY-MM-DDTHH:MM" format for datetime-local inputs. */
export function toLocalInput(ts: string): string {
  return ts.replace(' ', 'T').slice(0, 16)
}

/** Convert a datetime-local input value back to a server timestamp. */
export function toTimestamp(localInput: string): string {
  return localInput.replace('T', ' ') + ':00'
}
