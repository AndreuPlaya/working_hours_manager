import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../infrastructure/data.js')

import { addToHistory, addPending, loadHistory, loadPending, removeHistoryItem, removePending } from '../../infrastructure/data.js'
import type { PendingItem, HistoryItem } from '../../infrastructure/data.js'
import {
  addCorrection,
  deleteCorrection,
  editCorrection,
  bulkDelete,
  queueCorrection,
  getPending,
  approvePending,
  rejectPending,
  submitCorrection,
  canSubmitCorrectionFor,
  getMyPending,
  cancelMyPending,
  getHistory,
  revertCorrection,
  undoCorrection,
} from '../../application/correctionService.js'

const mockAddToHistory = vi.mocked(addToHistory)
const mockAddPending = vi.mocked(addPending)
const mockLoadPending = vi.mocked(loadPending)
const mockRemovePending = vi.mocked(removePending)
const mockLoadHistory = vi.mocked(loadHistory)
const mockRemoveHistoryItem = vi.mocked(removeHistoryItem)

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadPending.mockReturnValue([])
  mockLoadHistory.mockReturnValue([])
  mockRemoveHistoryItem.mockReturnValue(false)
})

// ---------------------------------------------------------------------------
// addCorrection
// ---------------------------------------------------------------------------

describe('addCorrection', () => {
  it('calls addToHistory with an ADD action', () => {
    addCorrection('1', 'Alice', 'Admin', '2024-01-15 09:00:00', 'admin')
    const item: HistoryItem = mockAddToHistory.mock.calls[0][0]
    expect(item.action).toBe('ADD')
    expect(item.emp_id).toBe('1')
    expect(item.name).toBe('Alice')
    expect(item.dept).toBe('Admin')
    expect(item.timestamp).toBe('2024-01-15 09:00:00')
    expect(item.applied_by).toBe('admin')
  })
})

// ---------------------------------------------------------------------------
// deleteCorrection
// ---------------------------------------------------------------------------

describe('deleteCorrection', () => {
  it('calls addToHistory with a DEL action', () => {
    deleteCorrection('1', 'Alice', 'Admin', '2024-01-15 09:00:00', 'admin')
    const item: HistoryItem = mockAddToHistory.mock.calls[0][0]
    expect(item.action).toBe('DEL')
    expect(item.emp_id).toBe('1')
    expect(item.applied_by).toBe('admin')
  })
})

// ---------------------------------------------------------------------------
// editCorrection
// ---------------------------------------------------------------------------

describe('editCorrection', () => {
  it('calls addToHistory with an EDIT action and new_timestamp', () => {
    editCorrection('1', 'Alice', 'Admin', '2024-01-15 09:00:00', '2024-01-15 09:05:00', 'admin')
    const item: HistoryItem = mockAddToHistory.mock.calls[0][0]
    expect(item.action).toBe('EDIT')
    expect(item.timestamp).toBe('2024-01-15 09:00:00')
    expect(item.new_timestamp).toBe('2024-01-15 09:05:00')
  })
})

// ---------------------------------------------------------------------------
// bulkDelete
// ---------------------------------------------------------------------------

describe('bulkDelete', () => {
  it('calls addToHistory for each item', () => {
    const items = [
      { emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00' },
      { emp_id: '2', name: 'Bob', dept: 'HR', timestamp: '2024-01-15 10:00:00' },
    ]
    bulkDelete(items, 'admin')
    expect(mockAddToHistory).toHaveBeenCalledTimes(2)
    expect(mockAddToHistory.mock.calls[0][0].emp_id).toBe('1')
    expect(mockAddToHistory.mock.calls[1][0].emp_id).toBe('2')
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
    expect(item.id).toHaveLength(36)
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
    expect(approvePending('missing', 'admin')).toBe(false)
  })

  it('calls addToHistory with ADD action and returns true', () => {
    const item: PendingItem = { id: 'x', action: 'ADD', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(approvePending('x', 'admin')).toBe(true)
    const hist: HistoryItem = mockAddToHistory.mock.calls[0][0]
    expect(hist.action).toBe('ADD')
    expect(hist.emp_id).toBe('1')
    expect(hist.applied_by).toBe('admin')
  })

  it('calls addToHistory with EDIT action and new_timestamp', () => {
    const item: PendingItem = { id: 'y', action: 'EDIT', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00', new_timestamp: '2024-01-15 09:05:00', submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(approvePending('y', 'admin')).toBe(true)
    const hist: HistoryItem = mockAddToHistory.mock.calls[0][0]
    expect(hist.action).toBe('EDIT')
    expect(hist.new_timestamp).toBe('2024-01-15 09:05:00')
  })

  it('calls addToHistory with DEL action and returns true', () => {
    const item: PendingItem = { id: 'w', action: 'DEL', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }
    mockRemovePending.mockReturnValue(item)
    expect(approvePending('w', 'admin')).toBe(true)
    const hist: HistoryItem = mockAddToHistory.mock.calls[0][0]
    expect(hist.action).toBe('DEL')
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

// ---------------------------------------------------------------------------
// submitCorrection
// ---------------------------------------------------------------------------

describe('submitCorrection', () => {
  it('writes to history directly and returns false when isAdmin=true', () => {
    const pending = submitCorrection('ADD', '1', 'Alice', 'Admin', '2024-01-15 09:00:00', null, 'admin', true)
    expect(pending).toBe(false)
    expect(mockAddToHistory).toHaveBeenCalledOnce()
    expect(mockAddPending).not.toHaveBeenCalled()
  })

  it('queues via addPending and returns true when isAdmin=false', () => {
    const pending = submitCorrection('ADD', '1', 'Alice', 'Admin', '2024-01-15 09:00:00', null, 'alice', false)
    expect(pending).toBe(true)
    expect(mockAddPending).toHaveBeenCalledOnce()
    expect(mockAddToHistory).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// canSubmitCorrectionFor
// ---------------------------------------------------------------------------

describe('canSubmitCorrectionFor', () => {
  it('returns true for admin regardless of empId', () => {
    expect(canSubmitCorrectionFor('2', null, true)).toBe(true)
    expect(canSubmitCorrectionFor('2', '1', true)).toBe(true)
  })

  it('returns true when requestEmpId matches targetEmpId', () => {
    expect(canSubmitCorrectionFor('1', '1', false)).toBe(true)
  })

  it('returns false when requestEmpId does not match targetEmpId', () => {
    expect(canSubmitCorrectionFor('2', '1', false)).toBe(false)
  })

  it('returns false when requestEmpId is null and not admin', () => {
    expect(canSubmitCorrectionFor('1', null, false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getMyPending
// ---------------------------------------------------------------------------

describe('getMyPending', () => {
  const items: PendingItem[] = [
    { id: '1', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' },
    { id: '2', action: 'ADD', emp_id: '2', name: 'B', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' },
  ]

  it('returns all items for admin', () => {
    mockLoadPending.mockReturnValue(items)
    expect(getMyPending(null, true)).toBe(items)
  })

  it('filters to own items for non-admin', () => {
    mockLoadPending.mockReturnValue(items)
    const result = getMyPending('1', false)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// cancelMyPending
// ---------------------------------------------------------------------------

describe('cancelMyPending', () => {
  const item: PendingItem = { id: 'x', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'alice' }

  it('returns not_found when item does not exist', () => {
    mockLoadPending.mockReturnValue([])
    expect(cancelMyPending('x', 'alice', false)).toBe('not_found')
  })

  it('returns denied when non-admin tries to cancel another user\'s item', () => {
    mockLoadPending.mockReturnValue([item])
    expect(cancelMyPending('x', 'bob', false)).toBe('denied')
  })

  it('returns ok when owner cancels own item', () => {
    mockLoadPending.mockReturnValue([item])
    mockRemovePending.mockReturnValue(item)
    expect(cancelMyPending('x', 'alice', false)).toBe('ok')
  })

  it('returns ok when admin cancels any item', () => {
    mockLoadPending.mockReturnValue([item])
    mockRemovePending.mockReturnValue(item)
    expect(cancelMyPending('x', 'admin', true)).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

describe('getHistory', () => {
  it('returns history items in reverse order', () => {
    const items = [
      { id: '1', action: 'ADD' as const, emp_id: '1', name: 'A', dept: 'D', timestamp: '2024-01-01', new_timestamp: null, applied_by: 'admin', applied_at: 'a', undone: false },
      { id: '2', action: 'DEL' as const, emp_id: '2', name: 'B', dept: 'D', timestamp: '2024-01-02', new_timestamp: null, applied_by: 'admin', applied_at: 'b', undone: false },
    ]
    mockLoadHistory.mockReturnValue(items)
    const result = getHistory()
    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// revertCorrection / undoCorrection
// ---------------------------------------------------------------------------

describe('revertCorrection', () => {
  it('returns true when item is found and removed', () => {
    mockRemoveHistoryItem.mockReturnValue(true)
    expect(revertCorrection('abc')).toBe(true)
  })

  it('returns false when item is not found', () => {
    mockRemoveHistoryItem.mockReturnValue(false)
    expect(revertCorrection('missing')).toBe(false)
  })
})

describe('undoCorrection', () => {
  it('returns true when item is found and removed', () => {
    mockRemoveHistoryItem.mockReturnValue(true)
    expect(undoCorrection('abc')).toBe(true)
  })

  it('returns false when item is not found', () => {
    mockRemoveHistoryItem.mockReturnValue(false)
    expect(undoCorrection('missing')).toBe(false)
  })
})
