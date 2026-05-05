import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs')
vi.mock('../../domain/parser.js')
vi.mock('../../infrastructure/settings.js')

import {
  existsSync,
  readdirSync,
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'fs'
import { parseFile, parseCorrectionFile, applyCorrections } from '../../domain/parser.js'
import { getDataRoot, loadSettings } from '../../infrastructure/settings.js'
import {
  rawDir,
  correctionsDir,
  loadEvents,
  applyNameOverrides,
  appendCorrection,
  loadPending,
  savePending,
  addPending,
  removePending,
  EDITOR_FILE,
} from '../../infrastructure/data.js'
import type { PendingItem } from '../../infrastructure/data.js'
import type { ClockEvent } from '../../domain/models.js'

const mockExists = vi.mocked(existsSync)
const mockReaddir = vi.mocked(readdirSync)
const mockReadFile = vi.mocked(readFileSync)
const mockWriteFile = vi.mocked(writeFileSync)
const mockAppend = vi.mocked(appendFileSync)
const mockMkdir = vi.mocked(mkdirSync)
const mockRename = vi.mocked(renameSync)
const mockGetDataRoot = vi.mocked(getDataRoot)
const mockLoadSettings = vi.mocked(loadSettings)
const mockParseFile = vi.mocked(parseFile)
const mockParseCorrectionFile = vi.mocked(parseCorrectionFile)
const mockApplyCorrections = vi.mocked(applyCorrections)

const ROOT = '/data'

beforeEach(() => {
  vi.resetAllMocks()
  mockGetDataRoot.mockReturnValue(ROOT)
  mockLoadSettings.mockReturnValue({ employees: {}, admin_users: {}, secret_key: '' })
  mockApplyCorrections.mockImplementation((raw, corr) => [...raw])
})

// ---------------------------------------------------------------------------
// rawDir / correctionsDir
// ---------------------------------------------------------------------------

describe('rawDir / correctionsDir', () => {
  it('rawDir returns path under data root', () => {
    expect(rawDir()).toBe('/data/input_data')
  })

  it('correctionsDir returns path under data root', () => {
    expect(correctionsDir()).toBe('/data/corrections')
  })
})

// ---------------------------------------------------------------------------
// loadEvents
// ---------------------------------------------------------------------------

describe('loadEvents', () => {
  const rawEvent: ClockEvent = { empId: '1', name: 'Alice', dept: 'Admin', timestamp: new Date('2024-01-15T09:00:00Z') }
  const corrEvent: ClockEvent = { empId: '1', name: 'Alice', dept: 'Admin', timestamp: new Date('2024-01-15T12:00:00Z') }

  it('returns applyCorrections([], []) when both dirs are absent', () => {
    mockExists.mockReturnValue(false)
    loadEvents()
    expect(mockApplyCorrections).toHaveBeenCalledWith([], [])
  })

  it('loads raw files but no corrections when corrections dir is absent', () => {
    mockExists.mockImplementation((p: unknown) => (p as string).includes('input_data'))
    mockReaddir.mockReturnValue(['file.txt'] as unknown as ReturnType<typeof readdirSync>)
    mockParseFile.mockReturnValue([rawEvent])
    loadEvents()
    expect(mockApplyCorrections).toHaveBeenCalledWith([rawEvent], [])
  })

  it('loads corrections but no raw files when raw dir is absent', () => {
    mockExists.mockImplementation((p: unknown) => (p as string).includes('corrections'))
    mockReaddir.mockReturnValue(['c.txt'] as unknown as ReturnType<typeof readdirSync>)
    mockParseCorrectionFile.mockReturnValue([{ action: 'ADD', event: corrEvent, oldTimestamp: null }])
    loadEvents()
    expect(mockApplyCorrections).toHaveBeenCalledWith([], [{ action: 'ADD', event: corrEvent, oldTimestamp: null }])
  })

  it('sorts and loads both raw files and corrections', () => {
    mockExists.mockReturnValue(true)
    mockReaddir.mockReturnValue(['b.txt', 'a.txt'] as unknown as ReturnType<typeof readdirSync>)
    mockParseFile.mockReturnValue([rawEvent])
    mockParseCorrectionFile.mockReturnValue([])
    loadEvents()
    // Both dirs call readdirSync; files are sorted
    expect(mockParseFile).toHaveBeenCalledTimes(2)
  })

  it('skips non-.txt files in both directories', () => {
    mockExists.mockReturnValue(true)
    mockReaddir.mockReturnValue(['file.csv', 'file.json'] as unknown as ReturnType<typeof readdirSync>)
    loadEvents()
    expect(mockParseFile).not.toHaveBeenCalled()
    expect(mockParseCorrectionFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// applyNameOverrides
// ---------------------------------------------------------------------------

describe('applyNameOverrides', () => {
  const event: ClockEvent = { empId: '1', name: 'Raw Name', dept: 'Admin', timestamp: new Date() }

  it('overrides the name when the employee has a full_name', () => {
    mockLoadSettings.mockReturnValue({
      employees: {
        '1': { alias: '', full_name: 'Full Name', username: 'u', password_hash: '', is_admin: false, enabled: true },
      },
      admin_users: {},
      secret_key: '',
    })
    const result = applyNameOverrides([event])
    expect(result[0].name).toBe('Full Name')
  })

  it('keeps the original name when employee has no full_name', () => {
    mockLoadSettings.mockReturnValue({
      employees: {
        '1': { alias: '', full_name: '', username: 'u', password_hash: '', is_admin: false, enabled: true },
      },
      admin_users: {},
      secret_key: '',
    })
    const result = applyNameOverrides([event])
    expect(result[0].name).toBe('Raw Name')
  })

  it('keeps the original name for unknown empId', () => {
    const result = applyNameOverrides([event])
    expect(result[0].name).toBe('Raw Name')
  })

  it('falls back to empty object when employees is null in settings', () => {
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    const result = applyNameOverrides([event])
    expect(result[0].name).toBe('Raw Name')
  })
})

// ---------------------------------------------------------------------------
// appendCorrection
// ---------------------------------------------------------------------------

describe('appendCorrection', () => {
  it('creates corrections dir and appends the line with a newline', () => {
    appendCorrection('ADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1')
    expect(mockMkdir).toHaveBeenCalledWith('/data/corrections', { recursive: true })
    expect(mockAppend).toHaveBeenCalledWith(
      `/data/corrections/${EDITOR_FILE}`,
      'ADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n',
      'utf-8'
    )
  })
})

// ---------------------------------------------------------------------------
// loadPending
// ---------------------------------------------------------------------------

describe('loadPending', () => {
  it('returns empty array when pending file does not exist', () => {
    mockExists.mockReturnValue(false)
    expect(loadPending()).toEqual([])
  })

  it('returns parsed items when file exists with valid JSON', () => {
    mockExists.mockReturnValue(true)
    const items: PendingItem[] = [
      {
        id: '1',
        action: 'ADD',
        emp_id: '1',
        name: 'Alice',
        dept: 'Admin',
        timestamp: '2024-01-15 09:00:00',
        new_timestamp: null,
        submitted_at: '2024-01-15T10:00:00',
        submitted_by: 'alice',
      },
    ]
    mockReadFile.mockReturnValue(JSON.stringify(items))
    expect(loadPending()).toEqual(items)
  })

  it('returns empty array when file exists but contains invalid JSON', () => {
    mockExists.mockReturnValue(true)
    mockReadFile.mockReturnValue('{invalid}')
    expect(loadPending()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// savePending
// ---------------------------------------------------------------------------

describe('savePending', () => {
  it('writes to a .tmp file then renames atomically', () => {
    const items: PendingItem[] = []
    savePending(items)
    const pendingPath = '/data/corrections/pending-corrections.json'
    const tmpPath = pendingPath + '.tmp'
    expect(mockWriteFile).toHaveBeenCalledWith(tmpPath, JSON.stringify(items, null, 2), 'utf-8')
    expect(mockRename).toHaveBeenCalledWith(tmpPath, pendingPath)
  })
})

// ---------------------------------------------------------------------------
// addPending
// ---------------------------------------------------------------------------

describe('addPending', () => {
  it('appends the new item to the existing list', () => {
    const existing: PendingItem = {
      id: 'existing',
      action: 'ADD',
      emp_id: '1',
      name: 'A',
      dept: 'D',
      timestamp: '2024-01-15 09:00:00',
      new_timestamp: null,
      submitted_at: '2024-01-15T10:00:00',
      submitted_by: 'u',
    }
    const newItem: PendingItem = { ...existing, id: 'new' }
    // First loadPending call: file exists with one item
    mockExists.mockReturnValue(true)
    mockReadFile.mockReturnValue(JSON.stringify([existing]))
    addPending(newItem)
    const written = JSON.parse((mockWriteFile.mock.calls[0][1] as string))
    expect(written).toHaveLength(2)
    expect(written[1].id).toBe('new')
  })
})

// ---------------------------------------------------------------------------
// removePending
// ---------------------------------------------------------------------------

describe('removePending', () => {
  const item: PendingItem = {
    id: 'abc',
    action: 'ADD',
    emp_id: '1',
    name: 'A',
    dept: 'D',
    timestamp: '2024-01-15 09:00:00',
    new_timestamp: null,
    submitted_at: '2024-01-15T10:00:00',
    submitted_by: 'u',
  }

  it('returns the item and removes it from the list when found', () => {
    mockExists.mockReturnValue(true)
    mockReadFile.mockReturnValue(JSON.stringify([item]))
    const result = removePending('abc')
    expect(result).toEqual(item)
    const written = JSON.parse((mockWriteFile.mock.calls[0][1] as string))
    expect(written).toHaveLength(0)
  })

  it('returns null when the item id is not found', () => {
    mockExists.mockReturnValue(true)
    mockReadFile.mockReturnValue(JSON.stringify([item]))
    expect(removePending('unknown')).toBeNull()
  })
})
