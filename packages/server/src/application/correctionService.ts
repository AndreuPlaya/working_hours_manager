import { randomUUID } from 'crypto'
import { addPending, addToHistory, loadHistory, markUndone, loadPending, removePending, removeHistoryItem } from '../infrastructure/data.js'
import type { HistoryItem, PendingItem } from '../infrastructure/data.js'

function recordHistory(action: 'ADD' | 'EDIT' | 'DEL', empId: string, name: string, dept: string, timestamp: string, newTimestamp: string | null, appliedBy: string): void {
  addToHistory({
    id: randomUUID(),
    action,
    emp_id: empId,
    name,
    dept,
    timestamp,
    new_timestamp: newTimestamp,
    applied_at: new Date().toISOString().slice(0, 19),
    applied_by: appliedBy,
    undone: false,
  })
}

export function addCorrection(empId: string, name: string, dept: string, timestamp: string, appliedBy: string): void {
  recordHistory('ADD', empId, name, dept, timestamp, null, appliedBy)
}

export function deleteCorrection(empId: string, name: string, dept: string, timestamp: string, appliedBy: string): void {
  recordHistory('DEL', empId, name, dept, timestamp, null, appliedBy)
}

export function editCorrection(empId: string, name: string, dept: string, oldTs: string, newTs: string, appliedBy: string): void {
  recordHistory('EDIT', empId, name, dept, oldTs, newTs, appliedBy)
}

export function bulkDelete(items: { emp_id: string; name: string; dept: string; timestamp: string }[], appliedBy: string): void {
  for (const item of items) deleteCorrection(item.emp_id, item.name, item.dept, item.timestamp, appliedBy)
}

export function queueCorrection(
  action: 'ADD' | 'EDIT' | 'DEL',
  empId: string,
  name: string,
  dept: string,
  timestamp: string,
  newTimestamp: string | null,
  submittedBy: string
): void {
  const item: PendingItem = {
    id: randomUUID(),
    action,
    emp_id: empId,
    name,
    dept,
    timestamp,
    new_timestamp: newTimestamp,
    submitted_at: new Date().toISOString().slice(0, 19),
    submitted_by: submittedBy,
  }
  addPending(item)
}

export function getPending(): PendingItem[] {
  return loadPending()
}

export function approvePending(itemId: string, approvedBy: string): boolean {
  const item = removePending(itemId)
  if (!item) return false
  recordHistory(item.action, item.emp_id, item.name, item.dept, item.timestamp, item.new_timestamp, approvedBy)
  return true
}

export function rejectPending(itemId: string): boolean {
  return removePending(itemId) !== null
}

export function getHistory(): HistoryItem[] {
  return loadHistory().filter(item => !item.undone).reverse()
}

export function revertCorrection(itemId: string): boolean {
  return removeHistoryItem(itemId)
}

export function undoCorrection(itemId: string, undoneBy: string): boolean {
  const items = loadHistory()
  const item = items.find(x => x.id === itemId)
  if (!item || item.undone) return false

  if (item.action === 'ADD') {
    recordHistory('DEL', item.emp_id, item.name, item.dept, item.timestamp, null, undoneBy)
  } else if (item.action === 'DEL') {
    recordHistory('ADD', item.emp_id, item.name, item.dept, item.timestamp, null, undoneBy)
  } else if (item.action === 'EDIT') {
    recordHistory('EDIT', item.emp_id, item.name, item.dept, item.new_timestamp!, item.timestamp, undoneBy)
  }

  markUndone(itemId)
  return true
}
