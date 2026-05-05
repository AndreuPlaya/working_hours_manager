import { readFileSync } from 'fs'
import type { ClockEvent, CorrectionItem } from './models.js'

const TS_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function parseTimestamp(raw: string): Date | null {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (!TS_FORMAT.test(s)) return null
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

function parseEventParts(parts: string[]): ClockEvent | null {
  if (parts.length < 4) return null
  const rawId = parts[0].trim().replace(/\.$/, '')
  if (!/^\d+$/.test(rawId)) return null
  const name = parts[1].trim()
  const dept = parts[2].trim()
  const ts = parseTimestamp(parts[3])
  if (!ts) return null
  return { empId: rawId, name, dept, timestamp: ts }
}

export function parseFile(path: string): ClockEvent[] {
  const events: ClockEvent[] = []
  const lines = readFileSync(path, 'utf-8').split('\n')
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('#')) continue
    const parts = line.split('\t')
    const ev = parseEventParts(parts)
    if (ev) events.push(ev)
  }
  return events
}

export function parseCorrectionFile(path: string): CorrectionItem[] {
  const items: CorrectionItem[] = []
  const lines = readFileSync(path, 'utf-8').split('\n')
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('#') || !line.trim()) continue
    const parts = line.split('\t')
    const first = parts[0].trim()

    let action: 'ADD' | 'DEL' | 'EDIT'
    let rest: string[]

    if (first === 'ADD' || first === 'DEL' || first === 'EDIT') {
      action = first
      rest = parts.slice(1)
    } else {
      action = 'ADD'
      rest = parts
    }

    if (action === 'EDIT') {
      if (rest.length < 5) continue
      const rawId = rest[0].trim().replace(/\.$/, '')
      if (!/^\d+$/.test(rawId)) continue
      const name = rest[1].trim()
      const dept = rest[2].trim()
      const oldTs = parseTimestamp(rest[3])
      const newTs = parseTimestamp(rest[4])
      if (!oldTs || !newTs) continue
      items.push({ action: 'EDIT', event: { empId: rawId, name, dept, timestamp: newTs }, oldTimestamp: oldTs })
    } else {
      const ev = parseEventParts(rest)
      if (!ev) continue
      items.push({ action, event: ev, oldTimestamp: null })
    }
  }
  return items
}

export function applyCorrections(raw: ClockEvent[], corrections: CorrectionItem[]): ClockEvent[] {
  let events = [...raw]
  for (const item of corrections) {
    if (item.action === 'ADD') {
      events.push(item.event)
    } else if (item.action === 'DEL') {
      events = events.filter(
        e => !(e.empId === item.event.empId && e.timestamp.getTime() === item.event.timestamp.getTime())
      )
    } else if (item.action === 'EDIT' && item.oldTimestamp) {
      events = events.map(e =>
        e.empId === item.event.empId && e.timestamp.getTime() === item.oldTimestamp!.getTime()
          ? { ...e, timestamp: item.event.timestamp }
          : e
      )
    }
  }
  return events
}

export function validateRawContent(content: string): { ok: boolean; error: string } {
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 4) continue
    const rawId = parts[0].trim().replace(/\.$/, '')
    if (!/^\d+$/.test(rawId)) continue
    if (parseTimestamp(parts[3])) return { ok: true, error: '' }
  }
  return {
    ok: false,
    error: 'No valid clock events found. Expected tab-separated rows: ID, Name, Dept, Timestamp (YYYY-MM-DD HH:MM:SS).',
  }
}
