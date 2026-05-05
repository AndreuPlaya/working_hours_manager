import type { ClockEvent, DayRecord, EmployeeData, Session } from './models.js'

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function compute(events: ClockEvent[]): EmployeeData {
  const byEmp = new Map<string, { dept: string; days: Map<string, Date[]> }>()

  for (const e of events) {
    const key = `${e.empId}|${e.name}`
    if (!byEmp.has(key)) byEmp.set(key, { dept: e.dept, days: new Map() })
    const emp = byEmp.get(key)!
    emp.dept = e.dept
    const dk = dateKey(e.timestamp)
    if (!emp.days.has(dk)) emp.days.set(dk, [])
    emp.days.get(dk)!.push(e.timestamp)
  }

  const result: EmployeeData = {}
  for (const [key, { dept, days }] of byEmp) {
    const daysOut: Record<string, DayRecord> = {}
    for (const [dk, timestamps] of days) {
      timestamps.sort((a, b) => a.getTime() - b.getTime())
      const sessions: Session[] = []
      for (let i = 0; i < timestamps.length - 1; i += 2) {
        sessions.push({ clockIn: timestamps[i], clockOut: timestamps[i + 1] })
      }
      const incomplete = timestamps.length % 2 === 1
      const total = sessions.reduce((acc, s) => acc + (s.clockOut.getTime() - s.clockIn.getTime()), 0)
      daysOut[dk] = {
        sessions,
        total,
        incomplete,
        dangling: incomplete ? timestamps[timestamps.length - 1] : null,
      }
    }
    result[key] = { dept, days: daysOut }
  }
  return result
}
