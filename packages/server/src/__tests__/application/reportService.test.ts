import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../infrastructure/data.js')
vi.mock('../../infrastructure/settings.js')
vi.mock('../../application/userService.js')

import { loadEvents, applyNameOverrides, loadPending } from '../../infrastructure/data.js'
import { loadSettings } from '../../infrastructure/settings.js'
import { listEmployees } from '../../application/userService.js'
import type { ClockEvent } from '../../domain/models.js'
import type { PendingItem } from '../../infrastructure/data.js'
import type { Settings } from '../../infrastructure/settings.js'
import {
  getEventsData,
  getReportIndex,
  getEmployeeReport,
  getEmployeeReportUrls,
  getEmployeeList,
  getPendingPreview,
} from '../../application/reportService.js'

const mockLoadEvents = vi.mocked(loadEvents)
const mockApplyNameOverrides = vi.mocked(applyNameOverrides)
const mockLoadSettings = vi.mocked(loadSettings)
const mockListEmployees = vi.mocked(listEmployees)
const mockLoadPending = vi.mocked(loadPending)

function ev(empId: string, name: string, isoTs: string, dept = 'Admin'): ClockEvent {
  return { empId, name, dept, timestamp: new Date(isoTs) }
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { employees: {}, admin_users: {}, secret_key: '', ...overrides }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadSettings.mockReturnValue(makeSettings())
  mockLoadPending.mockReturnValue([])
})

// ---------------------------------------------------------------------------
// getEventsData
// ---------------------------------------------------------------------------

describe('getEventsData', () => {
  it('returns all employees for an admin', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
      ev('2', 'Bob', '2024-01-15T09:00:00Z'),
      ev('2', 'Bob', '2024-01-15T17:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const result = getEventsData(null, true)
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(2)
  })

  it('filters to own events for a non-admin employee', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
      ev('2', 'Bob', '2024-01-15T09:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const result = getEventsData('1', false)
    const keys = Object.keys(result)
    expect(keys.every(k => k.startsWith('1|'))).toBe(true)
  })

  it('includes session rows for complete days', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const result = getEventsData(null, true)
    const rows = result['1|Alice|Admin'] as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0].incomplete).toBe(false)
  })

  it('includes incomplete rows for dangling events', () => {
    const events = [ev('1', 'Alice', '2024-01-15T09:00:00Z')]
    mockLoadEvents.mockReturnValue(events)
    const result = getEventsData(null, true)
    const rows = result['1|Alice|Admin'] as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0].incomplete).toBe(true)
    expect(rows[0].clock_out).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getReportIndex
// ---------------------------------------------------------------------------

describe('getReportIndex', () => {
  it('returns empty index when there are no events', () => {
    mockApplyNameOverrides.mockReturnValue([])
    const result = getReportIndex()
    expect(result.years).toHaveLength(0)
    expect(result.stems_by_year).toEqual({})
  })

  it('builds year and stem entries from events', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
    ]
    mockApplyNameOverrides.mockReturnValue(events)
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': { alias: 'Al', full_name: 'Alice', username: 'alice', password_hash: '', is_admin: false, enabled: true } },
    }))
    const result = getReportIndex()
    expect(result.years).toContain('2024')
    const entries = result.stems_by_year['2024']
    expect(entries[0].stem).toBe('2024-1-alice')
    expect(entries[0].display).toBe('Al')
  })

  it('uses name as display when neither alias nor username is set', () => {
    const events = [ev('1', 'Alice', '2024-01-15T09:00:00Z')]
    mockApplyNameOverrides.mockReturnValue(events)
    const result = getReportIndex()
    expect(result.stems_by_year['2024'][0].display).toBe('Alice')
  })

  it('handles null employees in getReportIndex (falls back to empty object)', () => {
    const events = [ev('1', 'Alice', '2024-01-15T09:00:00Z')]
    mockApplyNameOverrides.mockReturnValue(events)
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    const result = getReportIndex()
    expect(result.years).toContain('2024')
  })

  it('sorts years in descending order', () => {
    const events = [
      ev('1', 'Alice', '2023-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
    ]
    mockApplyNameOverrides.mockReturnValue(events)
    const { years } = getReportIndex()
    expect(years[0]).toBe('2024')
    expect(years[1]).toBe('2023')
  })
})

// ---------------------------------------------------------------------------
// getEmployeeReport
// ---------------------------------------------------------------------------

describe('getEmployeeReport', () => {
  it('returns null for a stem with fewer than 3 dash-separated parts', () => {
    mockApplyNameOverrides.mockReturnValue([])
    expect(getEmployeeReport('bad')).toBeNull()
  })

  it('returns null when year is not a number', () => {
    mockApplyNameOverrides.mockReturnValue([])
    expect(getEmployeeReport('notayear-1-alice')).toBeNull()
  })

  it('returns null when no events are found for that employee/year', () => {
    mockApplyNameOverrides.mockReturnValue([])
    expect(getEmployeeReport('2024-1-alice')).toBeNull()
  })

  it('returns a report object for valid stem with matching events', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
    ]
    mockApplyNameOverrides.mockReturnValue(events)
    const report = getEmployeeReport('2024-1-alice') as Record<string, unknown>
    expect(report).not.toBeNull()
    expect(report.emp_id).toBe('1')
    expect(report.year).toBe(2024)
    expect(Array.isArray(report.months)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getEmployeeReportUrls
// ---------------------------------------------------------------------------

describe('getEmployeeReportUrls', () => {
  it('returns empty array when no events exist for the empId', () => {
    mockLoadEvents.mockReturnValue([])
    expect(getEmployeeReportUrls('1')).toEqual([])
  })

  it('returns URL entries sorted by year descending', () => {
    const events = [
      ev('1', 'Alice', '2023-06-01T09:00:00Z'),
      ev('1', 'Alice', '2024-06-01T09:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const result = getEmployeeReportUrls('1') as Array<Record<string, unknown>>
    expect(result[0].year).toBe(2024)
    expect(result[1].year).toBe(2023)
  })

  it('uses employee username in stem when available', () => {
    const events = [ev('1', 'Alice', '2024-06-01T09:00:00Z')]
    mockLoadEvents.mockReturnValue(events)
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': { alias: '', full_name: '', username: 'alice', password_hash: '', is_admin: false, enabled: true } },
    }))
    const result = getEmployeeReportUrls('1') as Array<Record<string, unknown>>
    expect(result[0].stem).toBe('2024-1-alice')
    expect(result[0].url).toBe('/reports/2024-1-alice')
  })

  it('falls back to event name in stem when no username', () => {
    const events = [ev('1', 'Alice', '2024-06-01T09:00:00Z')]
    mockLoadEvents.mockReturnValue(events)
    const result = getEmployeeReportUrls('1') as Array<Record<string, unknown>>
    expect(result[0].stem).toBe('2024-1-Alice')
  })

  it('handles null employees in getEmployeeReportUrls (falls back to empty object)', () => {
    const events = [ev('1', 'Alice', '2024-06-01T09:00:00Z')]
    mockLoadEvents.mockReturnValue(events)
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    const result = getEmployeeReportUrls('1') as Array<Record<string, unknown>>
    expect(result[0].stem).toBe('2024-1-Alice')
  })
})

// ---------------------------------------------------------------------------
// getEmployeeList
// ---------------------------------------------------------------------------

describe('getEmployeeList', () => {
  it('delegates to listEmployees(loadEvents())', () => {
    const events = [ev('1', 'Alice', '2024-01-15T09:00:00Z')]
    mockLoadEvents.mockReturnValue(events)
    const employees = [{ emp_id: '1' }]
    mockListEmployees.mockReturnValue(employees)
    expect(getEmployeeList()).toBe(employees)
    expect(mockListEmployees).toHaveBeenCalledWith(events)
  })
})

// ---------------------------------------------------------------------------
// getPendingPreview
// ---------------------------------------------------------------------------

describe('getPendingPreview', () => {
  const baseItem: PendingItem = {
    id: 'x',
    action: 'ADD',
    emp_id: '1',
    name: 'Alice',
    dept: 'Admin',
    timestamp: '2024-01-15 09:00:00',
    new_timestamp: null,
    submitted_at: '2024-01-15T10:00:00',
    submitted_by: 'alice',
  }

  it('returns null for an item with an invalid timestamp (isNaN path)', () => {
    const item = { ...baseItem, timestamp: 'not-a-date' }
    mockLoadEvents.mockReturnValue([])
    expect(getPendingPreview(item)).toBeNull()
  })

  it('returns null when timestamp.replace throws (catch path — non-string timestamp)', () => {
    const item = { ...baseItem, timestamp: null as unknown as string }
    mockLoadEvents.mockReturnValue([])
    expect(getPendingPreview(item)).toBeNull()
  })

  it('returns null for an item whose timestamp is NaN after parsing', () => {
    // A string that looks like a timestamp format but produces NaN date
    const item = { ...baseItem, timestamp: '9999-99-99 25:99:99' }
    mockLoadEvents.mockReturnValue([])
    expect(getPendingPreview(item)).toBeNull()
  })

  it('returns a preview object with before/after for an ADD action', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T08:00:00Z'),
      ev('1', 'Alice', '2024-01-15T12:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const preview = getPendingPreview(baseItem) as Record<string, unknown>
    expect(preview).not.toBeNull()
    expect(preview.employee).toBe('Alice')
    expect(preview.emp_id).toBe('1')
    expect(preview.before).toBeDefined()
    expect(preview.after).toBeDefined()
  })

  it('returns a preview for an EDIT action with new_timestamp on different day', () => {
    const item: PendingItem = {
      ...baseItem,
      action: 'EDIT',
      timestamp: '2024-01-15 09:00:00',
      new_timestamp: '2024-01-16 09:00:00',
    }
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const preview = getPendingPreview(item) as Record<string, unknown>
    expect(preview).not.toBeNull()
  })

  it('handles empty events gracefully (returns 0h rows)', () => {
    mockLoadEvents.mockReturnValue([])
    const preview = getPendingPreview(baseItem) as Record<string, unknown>
    expect(preview).not.toBeNull()
    const before = preview.before as Record<string, unknown>
    expect(before.month_total).toBe('0h 00m')
  })

  it('includes subtotal rows for multiple sessions in the month', () => {
    // 4 events = 2 complete sessions → triggers subtotal row
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T12:00:00Z'),
      ev('1', 'Alice', '2024-01-15T13:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
    ]
    mockLoadEvents.mockReturnValue(events)
    const preview = getPendingPreview(baseItem) as Record<string, unknown>
    const before = preview.before as Record<string, { is_subtotal: boolean }[]>
    const rows = before.rows as Array<Record<string, unknown>>
    expect(rows.some(r => r.is_subtotal === true)).toBe(true)
  })

  it('includes incomplete rows for dangling events', () => {
    // 1 event = incomplete day (dangling)
    const events = [ev('1', 'Alice', '2024-01-15T09:00:00Z')]
    mockLoadEvents.mockReturnValue(events)
    const preview = getPendingPreview(baseItem) as Record<string, unknown>
    const before = preview.before as Record<string, unknown>
    const rows = before.rows as Array<Record<string, unknown>>
    expect(rows.some(r => r.clock_out === '?')).toBe(true)
  })
})
