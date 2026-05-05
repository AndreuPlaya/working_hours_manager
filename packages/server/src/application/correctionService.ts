import { randomUUID } from 'crypto'
import { addPending, appendCorrection, loadPending, removePending } from '../infrastructure/data.js'
import type { PendingItem } from '../infrastructure/data.js'

export function addCorrection(empId: string, name: string, dept: string, timestamp: string): void {
  appendCorrection(`ADD\t${empId}\t${name}\t${dept}\t${timestamp}\t1`)
}

export function deleteCorrection(empId: string, name: string, dept: string, timestamp: string): void {
  appendCorrection(`DEL\t${empId}\t${name}\t${dept}\t${timestamp}\t1`)
}

export function editCorrection(empId: string, name: string, dept: string, oldTs: string, newTs: string): void {
  appendCorrection(`EDIT\t${empId}\t${name}\t${dept}\t${oldTs}\t${newTs}\t1`)
}

export function bulkDelete(items: { emp_id: string; name: string; dept: string; timestamp: string }[]): void {
  for (const item of items) deleteCorrection(item.emp_id, item.name, item.dept, item.timestamp)
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

export function approvePending(itemId: string): boolean {
  const item = removePending(itemId)
  if (!item) return false
  if (item.action === 'ADD') {
    appendCorrection(`ADD\t${item.emp_id}\t${item.name}\t${item.dept}\t${item.timestamp}\t1`)
  } else if (item.action === 'EDIT') {
    appendCorrection(`EDIT\t${item.emp_id}\t${item.name}\t${item.dept}\t${item.timestamp}\t${item.new_timestamp}\t1`)
  } else if (item.action === 'DEL') {
    appendCorrection(`DEL\t${item.emp_id}\t${item.name}\t${item.dept}\t${item.timestamp}\t1`)
  }
  return true
}

export function rejectPending(itemId: string): boolean {
  return removePending(itemId) !== null
}
