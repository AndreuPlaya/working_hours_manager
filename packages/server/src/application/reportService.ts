import { compute } from '../domain/calculator.js'
import type { ClockEvent } from '../domain/models.js'
import { applyNameOverrides, loadEvents } from '../infrastructure/data.js'
import { buildRows, fmtMs, fmtTime } from '../infrastructure/reporter.js'
import { loadSettings } from '../infrastructure/settings.js'
import type { PendingItem } from '../infrastructure/data.js'
import { listEmployees } from './userService.js'

export function getEventsData(empId: string | null, isAdmin: boolean): Record<string, object[]> {
  let events = loadEvents()
  if (empId && !isAdmin) events = events.filter(e => e.empId === empId)

  const byKey = new Map<string, ClockEvent[]>()
  for (const e of events) {
    const k = `${e.empId}|${e.name}|${e.dept}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(e)
  }

  const result: Record<string, object[]> = {}
  for (const key of [...byKey.keys()].sort()) {
    const data = compute(byKey.get(key)!)
    const rows: object[] = []
    for (const [, yearData] of Object.entries(data)) {
      for (const [dk, rec] of Object.entries(yearData.days).sort()) {
        const dateLabel = `${dk} (${new Date(dk + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })})`
        for (const s of rec.sessions) {
          rows.push({
            date: dateLabel,
            clock_in: s.clockIn.toISOString().replace('T', ' ').slice(0, 19),
            clock_out: s.clockOut.toISOString().replace('T', ' ').slice(0, 19),
            duration: fmtMs(s.clockOut.getTime() - s.clockIn.getTime()),
            incomplete: false,
          })
        }
        if (rec.incomplete && rec.dangling) {
          rows.push({
            date: dateLabel,
            clock_in: rec.dangling.toISOString().replace('T', ' ').slice(0, 19),
            clock_out: null,
            duration: null,
            incomplete: true,
          })
        }
      }
    }
    result[key] = rows
  }
  return result
}

export function getReportIndex(): { years: string[]; stems_by_year: Record<string, { stem: string; display: string }[]> } {
  const events = applyNameOverrides(loadEvents())
  const employees = loadSettings().employees ?? {}
  const byYearEmp = new Map<string, ClockEvent[]>()

  for (const e of events) {
    const k = `${e.timestamp.getFullYear()}|${e.empId}|${e.name}`
    if (!byYearEmp.has(k)) byYearEmp.set(k, [])
    byYearEmp.get(k)!.push(e)
  }

  const stemsByYear: Record<string, { stem: string; display: string }[]> = {}
  for (const key of [...byYearEmp.keys()].sort()) {
    const [year, empId, name] = key.split('|')
    const emp = employees[empId] ?? {}
    const username = emp.username?.trim() || name
    const display = emp.alias?.trim() || username
    const stem = `${year}-${empId}-${username}`
    stemsByYear[year] ??= []
    stemsByYear[year].push({ stem, display })
  }

  const years = Object.keys(stemsByYear).sort((a, b) => Number(b) - Number(a))
  return { years, stems_by_year: stemsByYear }
}

export function getEmployeeReport(stem: string): object | null {
  const parts = stem.split('-', 3)
  if (parts.length < 3) return null
  const year = parseInt(parts[0])
  if (isNaN(year)) return null
  const empId = parts[1]

  const events = applyNameOverrides(loadEvents()).filter(
    e => e.empId === empId && e.timestamp.getFullYear() === year
  )
  if (!events.length) return null

  const data = compute(events)
  const [[key, info]] = Object.entries(data)
  const name = key.split('|')[1]

  const byMonth: Record<string, Record<string, (typeof info.days)[string]>> = {}
  for (const [dk, rec] of Object.entries(info.days)) {
    const month = dk.slice(0, 7)
    byMonth[month] ??= {}
    byMonth[month][dk] = rec
  }

  const months: object[] = []
  let yearTotalMs = 0

  for (const month of Object.keys(byMonth).sort()) {
    const { rows, total } = buildRows(byMonth[month])
    yearTotalMs += total
    const [y, m] = month.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    months.push({ label, rows, total: fmtMs(total) })
  }

  return { name, dept: info.dept, emp_id: empId, year, months, year_total: fmtMs(yearTotalMs) }
}

export function getEmployeeReportUrls(empId: string): object[] {
  const events = loadEvents()
  const employees = loadSettings().employees ?? {}
  const years = [...new Set(events.filter(e => e.empId === empId).map(e => e.timestamp.getFullYear()))].sort(
    (a, b) => b - a
  )
  return years.map(year => {
    const yearEvents = events.filter(e => e.empId === empId && e.timestamp.getFullYear() === year)
    const name = yearEvents[0]?.name ?? ''
    const username = employees[empId]?.username?.trim() || name
    const stem = `${year}-${empId}-${username}`
    return { stem, year, url: `/reports/${stem}` }
  })
}

export function getEmployeeList(): object[] {
  return listEmployees(loadEvents())
}

export function getPendingPreview(item: PendingItem): object | null {
  let affectedTs: Date
  try {
    affectedTs = new Date(item.timestamp.replace(' ', 'T'))
    if (isNaN(affectedTs.getTime())) return null
  } catch {
    return null
  }

  const empId = item.emp_id
  const affectedDate = item.timestamp.slice(0, 10)
  const year = affectedTs.getFullYear()
  const month = affectedTs.getMonth()

  const allEvents = loadEvents()
  const empEvents = allEvents.filter(e => e.empId === empId)

  let afterEvents = [...empEvents]
  if (item.action === 'ADD') {
    afterEvents.push({ empId, name: item.name, dept: item.dept, timestamp: affectedTs })
  } else if (item.action === 'EDIT' && item.new_timestamp) {
    const newTs = new Date(item.new_timestamp.replace(' ', 'T'))
    afterEvents = afterEvents.map(e =>
      e.empId === empId && e.timestamp.getTime() === affectedTs.getTime()
        ? { ...e, timestamp: newTs }
        : e
    )
  }

  const monthFilter = (evts: ClockEvent[]) =>
    evts.filter(e => e.timestamp.getFullYear() === year && e.timestamp.getMonth() === month)

  function buildPreviewRows(evts: ClockEvent[], highlightDates: Set<string>) {
    if (!evts.length) return { rows: [], month_total: '0h 00m' }
    const data = compute(evts)
    const [, info] = Object.entries(data)[0]
    const rows: object[] = []
    let total = 0
    for (const [dk, rec] of Object.entries(info.days).sort()) {
      total += rec.total
      const d = new Date(dk + 'T00:00:00')
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
      const label = `${dk}  ${dayName}`
      const isAff = highlightDates.has(dk)
      let first = true
      for (const s of rec.sessions) {
        rows.push({ date_label: first ? label : '', clock_in: fmtTime(s.clockIn), clock_out: fmtTime(s.clockOut), duration: fmtMs(s.clockOut.getTime() - s.clockIn.getTime()), is_subtotal: false, affected: isAff })
        first = false
      }
      if (rec.incomplete && rec.dangling) {
        rows.push({ date_label: first ? label : '', clock_in: fmtTime(rec.dangling), clock_out: '?', duration: 'incomplete', is_subtotal: false, affected: isAff })
      }
      if (rec.sessions.length > 1) {
        rows.push({ date_label: '', clock_in: '', clock_out: 'day total', duration: fmtMs(rec.total), is_subtotal: true, affected: isAff })
      }
    }
    return { rows, month_total: fmtMs(total) }
  }

  const beforeHighlight = new Set([affectedDate])
  const afterHighlight = new Set([affectedDate])
  if (item.action === 'EDIT' && item.new_timestamp) {
    afterHighlight.add(item.new_timestamp.slice(0, 10))
  }

  const d = new Date(year, month, 1)
  const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return {
    employee: item.name,
    emp_id: empId,
    month_label: monthLabel,
    affected_date: affectedDate,
    before: buildPreviewRows(monthFilter(empEvents), beforeHighlight),
    after: buildPreviewRows(monthFilter(afterEvents), afterHighlight),
  }
}
