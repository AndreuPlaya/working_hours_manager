import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { applyCorrections, parseCorrectionFile, parseFile } from '../domain/parser.js'
import type { ClockEvent, CorrectionItem } from '../domain/models.js'
import { getDataRoot } from './settings.js'

export const PENDING_FILE = 'pending-corrections.json'
export const HISTORY_FILE = 'correction-history.json'

export function rawDir(): string {
  return join(getDataRoot(), 'input_data')
}

export function correctionsDir(): string {
  return join(getDataRoot(), 'corrections')
}

function historyItemToCorrectionItem(item: HistoryItem): CorrectionItem {
  const ts = (s: string) => new Date(s.replace(' ', 'T'))
  if (item.action === 'EDIT') {
    return {
      action: 'EDIT',
      event: { empId: item.emp_id, name: item.name, dept: item.dept, timestamp: ts(item.new_timestamp!) },
      oldTimestamp: ts(item.timestamp),
    }
  }
  return {
    action: item.action,
    event: { empId: item.emp_id, name: item.name, dept: item.dept, timestamp: ts(item.timestamp) },
    oldTimestamp: null,
  }
}

export function loadEvents(): ClockEvent[] {
  const raw: ClockEvent[] = []
  const rd = rawDir()
  if (existsSync(rd)) {
    for (const f of readdirSync(rd).filter(n => n.endsWith('.txt')).sort()) {
      raw.push(...parseFile(join(rd, f)))
    }
  }
  const manualCorrections: CorrectionItem[] = []
  const cd = correctionsDir()
  if (existsSync(cd)) {
    for (const f of readdirSync(cd).filter(n => n.endsWith('.txt') && n !== 'editor-corrections.txt').sort()) {
      manualCorrections.push(...parseCorrectionFile(join(cd, f)))
    }
  }
  const historyCorrections = loadHistory().map(historyItemToCorrectionItem)
  return applyCorrections(raw, [...manualCorrections, ...historyCorrections])
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

export function removeHistoryItem(itemId: string): boolean {
  const items = loadHistory()
  const exists = items.some(x => x.id === itemId)
  if (!exists) return false
  saveHistory(items.filter(x => x.id !== itemId))
  return true
}
