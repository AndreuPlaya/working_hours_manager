import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { applyCorrections, parseCorrectionFile, parseFile } from '../domain/parser.js'
import type { ClockEvent } from '../domain/models.js'
import { getDataRoot, loadSettings } from './settings.js'

export const EDITOR_FILE = 'editor-corrections.txt'
export const PENDING_FILE = 'pending-corrections.json'
export const HISTORY_FILE = 'correction-history.json'

export function rawDir(): string {
  return join(getDataRoot(), 'input_data')
}

export function correctionsDir(): string {
  return join(getDataRoot(), 'corrections')
}

export function loadEvents(): ClockEvent[] {
  const raw: ClockEvent[] = []
  const rd = rawDir()
  if (existsSync(rd)) {
    for (const f of readdirSync(rd).filter(n => n.endsWith('.txt')).sort()) {
      raw.push(...parseFile(join(rd, f)))
    }
  }
  const corrections: ReturnType<typeof parseCorrectionFile> = []
  const cd = correctionsDir()
  if (existsSync(cd)) {
    for (const f of readdirSync(cd).filter(n => n.endsWith('.txt')).sort()) {
      corrections.push(...parseCorrectionFile(join(cd, f)))
    }
  }
  return applyCorrections(raw, corrections)
}

export function applyNameOverrides(events: ClockEvent[]): ClockEvent[] {
  const employees = loadSettings().employees ?? {}
  return events.map(e => {
    const fullName = employees[e.empId]?.full_name?.trim()
    return fullName ? { ...e, name: fullName } : e
  })
}

export function appendCorrection(line: string): void {
  const cd = correctionsDir()
  mkdirSync(cd, { recursive: true })
  appendFileSync(join(cd, EDITOR_FILE), line + '\n', 'utf-8')
}

export interface PendingItem {
  id: string
  action: 'ADD' | 'EDIT' | 'DEL'
  emp_id: string
  name: string
  dept: string
  timestamp: string
  new_timestamp: string | null
  submitted_at: string
  submitted_by: string
}

function pendingPath(): string {
  return join(correctionsDir(), PENDING_FILE)
}

export function loadPending(): PendingItem[] {
  const p = pendingPath()
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as PendingItem[]
  } catch {
    return []
  }
}

export function savePending(items: PendingItem[]): void {
  const p = pendingPath()
  mkdirSync(correctionsDir(), { recursive: true })
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf-8')
  renameSync(tmp, p)
}

export function addPending(item: PendingItem): void {
  const items = loadPending()
  items.push(item)
  savePending(items)
}

export function removePending(itemId: string): PendingItem | null {
  const items = loadPending()
  const found = items.find(x => x.id === itemId) ?? null
  if (!found) return null
  savePending(items.filter(x => x.id !== itemId))
  return found
}

export interface HistoryItem {
  id: string
  action: 'ADD' | 'EDIT' | 'DEL'
  emp_id: string
  name: string
  dept: string
  timestamp: string
  new_timestamp: string | null
  applied_at: string
  applied_by: string
  undone: boolean
}

function historyPath(): string {
  return join(correctionsDir(), HISTORY_FILE)
}

export function loadHistory(): HistoryItem[] {
  const p = historyPath()
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as HistoryItem[]
  } catch {
    return []
  }
}

export function saveHistory(items: HistoryItem[]): void {
  const p = historyPath()
  mkdirSync(correctionsDir(), { recursive: true })
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf-8')
  renameSync(tmp, p)
}

export function addToHistory(item: HistoryItem): void {
  const items = loadHistory()
  items.push(item)
  saveHistory(items)
}

export function markUndone(itemId: string): boolean {
  const items = loadHistory()
  const found = items.find(x => x.id === itemId)
  if (!found) return false
  found.undone = true
  saveHistory(items)
  return true
}
