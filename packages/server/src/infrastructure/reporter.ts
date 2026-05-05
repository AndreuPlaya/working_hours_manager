import type { DayRecord } from '../domain/models.js'

export function fmtMs(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function fmtTime(d: Date): string {
  return d.toISOString().slice(11, 19)
}

export interface ReportRow {
  dateLabel: string
  clockIn: string
  clockOut: string
  duration: string
  isSubtotal: boolean
  isIncomplete: boolean
}

export function buildRows(days: Record<string, DayRecord>): { rows: ReportRow[]; total: number } {
  const rows: ReportRow[] = []
  let total = 0

  for (const dk of Object.keys(days).sort()) {
    const rec = days[dk]
    total += rec.total
    const d = new Date(dk + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
    const label = `${dk}  ${dayName}`
    let first = true

    for (const s of rec.sessions) {
      rows.push({
        dateLabel: first ? label : '',
        clockIn: fmtTime(s.clockIn),
        clockOut: fmtTime(s.clockOut),
        duration: fmtMs(s.clockOut.getTime() - s.clockIn.getTime()),
        isSubtotal: false,
        isIncomplete: false,
      })
      first = false
    }

    if (rec.incomplete && rec.dangling) {
      rows.push({
        dateLabel: first ? label : '',
        clockIn: fmtTime(rec.dangling),
        clockOut: '?',
        duration: 'incomplete',
        isSubtotal: false,
        isIncomplete: true,
      })
    }

    if (rec.sessions.length > 1) {
      rows.push({
        dateLabel: '',
        clockIn: '',
        clockOut: 'day total',
        duration: fmtMs(rec.total),
        isSubtotal: true,
        isIncomplete: false,
      })
    }
  }

  return { rows, total }
}
