import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../infrastructure/data.js')

import { appendCorrection, addPending, loadPending, removePending } from '../../infrastructure/data.js'
import type { PendingItem } from '../../infrastructure/data.js'
import {
  addCorrection,
  deleteCorrection,
  editCorrection,
  bulkDelete,
  queueCorrection,
  getPending,
  approvePending,
  rejectPending,
} from '../../application/correctionService.js'

const mockAppend = vi.mocked(appendCorrection)
const mockAddPending = vi.mocked(addPending)
const mockLoadPending = vi.mocked(loadPending)
const mockRemovePending = vi.mocked(removePending)

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadPending.mockReturnValue([])
})

// ---------------------------------------------------------------------------
// addCorrection
// ---------------------------------------------------------------------------

describe('addCorrection', () => {
  it('calls appendCorrection with an ADD line', () => {
    addCorrection('1', 'Alice', 'Admin', '2024-01-15 09:00:00')
    expect(mockAppend).toHaveBeenCalledWith('ADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1')
  })
})

// ---------------------------------------------------------------------------
// deleteCorrection
// ---------------------------------------------------------------------------

describe('deleteCorrection', () => {
  it('calls appendCorrection with a DEL line', () => {
    deleteCorrection('1', 'Alice', 'Admin', '2024-01-15 09:00:00')
    expect(mockAppend).toHaveBeenCalledWith('DEL\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1')
  })
})

// ---------------------------------------------------------------------------
// editCorrection
// ---------------------------------------------------------------------------

describe('editCorrection', () => {
  it('calls appendCorrection with an EDIT line', () => {
    editCorrection('1', 'Alice', 'Admin', '2024-01-15 09:00:00', '2024-01-15 09:05:00')
    expect(mockAppend).toHaveBeenCalledWith('EDIT\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t2024-01-15 09:05:00\t1')
  })
})

// ---------------------------------------------------------------------------
// bulkDelete
// ---------------------------------------------------------------------------

describe('bulkDelete', () => {
  it('calls deleteCorrection for each item', () => {
    const items = [
      { emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00' },
      { emp_id: '2', name: 'Bob', dept: 'HR', timestamp: '2024-01-15 10:00:00' },
    ]
    bulkDelete(items)
    expect(mockAppend).toHaveBeenCalledTimes(2)
    expect(mockAppend).toHaveBeenNthCalledWith(1, 'DEL\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1')
    expect(mockAppend).toHaveBeenNthCalledWith(2, 'DEL\t2\tBob\tHR\t2024-01-15 10:00:00\t1')
  })
})

// ---------------------------------------------------------------------------
// queueCorrection
// ---------------------------------------------------------------------------

describe('queueCorrection', () => {
  it('adds a pending item with correct shape for ADD action', () => {
    queueCorrection('ADD', '1', 'Alice', 'Admin', '2024-01-15 09:00:00', null, 'alice')
    const item: PendingItem = mockAddPending.mock.calls[0][0]
    expect(typeof item.id).toBe('string')
    expect(item.id).toHaveLength(36) // UUID format
    expect(item.action).toBe('ADD')
    expect(item.emp_id).toBe('1')
    expect(item.name).toBe('Alice')
    expect(item.dept).toBe('Admin')
    expect(item.timestamp).toBe('2024-01-15 09:00:00')
    expect(item.new_timestamp).toBeNull()
    expect(item.submitted_by).toBe('alice')
    expect(item.submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('adds a pending item with new_timestamp for EDIT action', () => {
    queueCorrection('EDIT', '1', 'Alice', 'Admin', '2024-01-15 09:00:00', '2024-01-15 09:05:00', 'alice')
    const item: PendingItem = mockAddPending.mock.calls[0][0]
    expect(item.action).toBe('EDIT')
    expect(item.new_timestamp).toBe('2024-01-15 09:05:00')
  })

  it('adds a pending item with null new_timestamp for DEL action', () => {
    queueCorrection('DEL', '1', 'Alice', 'Admin', '2024-01-15 09:00:00', null, 'alice')
    const item: PendingItem = mockAddPending.mock.calls[0][0]
    expect(item.action).toBe('DEL')
    expect(item.new_timestamp).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getPending
// ---------------------------------------------------------------------------

describe('getPending', () => {
  it('delegates to loadPending', () => {
    const items: PendingItem[] = [{ id: '1', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }]
    mockLoadPending.mockReturnValue(items)
    expect(getPending()).toBe(items)
  })
})

// ---------------------------------------------------------------------------
// approvePending
// ---------------------------------------------------------------------------

describe('approvePending', () => {
  it('returns false when the item is not found', () => {
    mockRemovePending.mockReturnValue(null)
    expect(approvePending('missing')).toBe(false)
  })

  it('appends an ADD correction and returns true for ADD action', () => {
    const item: PendingItem = { id: 'x', action: 'ADD', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(approvePending('x')).toBe(true)
    expect(mockAppend).toHaveBeenCalledWith('ADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1')
  })

  it('appends an EDIT correction and returns true for EDIT action', () => {
    const item: PendingItem = { id: 'y', action: 'EDIT', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00', new_timestamp: '2024-01-15 09:05:00', submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(approvePending('y')).toBe(true)
    expect(mockAppend).toHaveBeenCalledWith('EDIT\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t2024-01-15 09:05:00\t1')
  })

  it('appends a DEL correction and returns true for DEL action', () => {
    const item: PendingItem = { id: 'w', action: 'DEL', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(approvePending('w')).toBe(true)
    expect(mockAppend).toHaveBeenCalledWith('DEL\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1')
  })
})

// ---------------------------------------------------------------------------
// rejectPending
// ---------------------------------------------------------------------------

describe('rejectPending', () => {
  it('returns true when item is found and removed', () => {
    const item: PendingItem = { id: 'z', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(rejectPending('z')).toBe(true)
  })

  it('returns false when item is not found', () => {
    mockRemovePending.mockReturnValue(null)
    expect(rejectPending('missing')).toBe(false)
  })
})
