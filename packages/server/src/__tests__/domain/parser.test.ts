import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs')

import { readFileSync } from 'fs'
import { parseFile, parseCorrectionFile, applyCorrections, validateRawContent } from '../../domain/parser.js'

const mockReadFile = vi.mocked(readFileSync)

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// parseFile
// ---------------------------------------------------------------------------

describe('parseFile', () => {
  it('parses a valid tab-separated event line', () => {
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\t2024-01-15 09:00:00\n')
    const events = parseFile('/fake/path.txt')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ empId: '1', name: 'Alice', dept: 'Admin' })
    expect(events[0].timestamp).toBeInstanceOf(Date)
    expect(events[0].timestamp.getUTCHours()).toBe(9)
  })

  it('skips comment lines (starting with #)', () => {
    mockReadFile.mockReturnValue('# this is a comment\n1\tAlice\tAdmin\t2024-01-15 09:00:00\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(1)
  })

  it('skips lines with fewer than 4 tab-separated parts', () => {
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(0)
  })

  it('skips lines with non-numeric empId', () => {
    mockReadFile.mockReturnValue('abc\tAlice\tAdmin\t2024-01-15 09:00:00\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(0)
  })

  it('skips lines with an invalid timestamp', () => {
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\tnot-a-date\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(0)
  })

  it('strips a trailing dot from empId', () => {
    mockReadFile.mockReturnValue('1.\tAlice\tAdmin\t2024-01-15 09:00:00\n')
    const events = parseFile('/fake/path.txt')
    expect(events[0].empId).toBe('1')
  })

  it('handles Windows-style CRLF line endings', () => {
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\t2024-01-15 09:00:00\r\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(1)
  })

  it('returns empty array for an empty file', () => {
    mockReadFile.mockReturnValue('')
    expect(parseFile('/fake/path.txt')).toHaveLength(0)
  })

  it('normalises extra whitespace in timestamp', () => {
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\t2024-01-15  09:00:00\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(1)
  })

  it('rejects a timestamp that matches format but is an invalid date', () => {
    // parseTimestamp calls isNaN on the resulting Date
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\t2024-13-99 00:00:00\n')
    expect(parseFile('/fake/path.txt')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// parseCorrectionFile
// ---------------------------------------------------------------------------

describe('parseCorrectionFile', () => {
  it('parses an explicit ADD action', () => {
    mockReadFile.mockReturnValue('ADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n')
    const items = parseCorrectionFile('/fake/corrections.txt')
    expect(items).toHaveLength(1)
    expect(items[0].action).toBe('ADD')
    expect(items[0].oldTimestamp).toBeNull()
  })

  it('treats a plain event line as ADD', () => {
    mockReadFile.mockReturnValue('1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n')
    const items = parseCorrectionFile('/fake/corrections.txt')
    expect(items).toHaveLength(1)
    expect(items[0].action).toBe('ADD')
  })

  it('parses an explicit DEL action', () => {
    mockReadFile.mockReturnValue('DEL\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n')
    const items = parseCorrectionFile('/fake/corrections.txt')
    expect(items[0].action).toBe('DEL')
  })

  it('parses an explicit EDIT action with both timestamps', () => {
    mockReadFile.mockReturnValue('EDIT\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t2024-01-15 09:05:00\t1\n')
    const items = parseCorrectionFile('/fake/corrections.txt')
    expect(items[0].action).toBe('EDIT')
    expect(items[0].oldTimestamp).toBeInstanceOf(Date)
    expect(items[0].event.timestamp).toBeInstanceOf(Date)
  })

  it('skips EDIT lines with fewer than 5 rest parts', () => {
    mockReadFile.mockReturnValue('EDIT\t1\tAlice\t2024-01-15 09:00:00\n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })

  it('skips EDIT lines with a non-numeric empId', () => {
    mockReadFile.mockReturnValue('EDIT\tabc\tAlice\tAdmin\t2024-01-15 09:00:00\t2024-01-15 09:05:00\n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })

  it('skips EDIT lines where the old timestamp is invalid', () => {
    mockReadFile.mockReturnValue('EDIT\t1\tAlice\tAdmin\tnot-a-date\t2024-01-15 09:05:00\n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })

  it('skips EDIT lines where the new timestamp is invalid', () => {
    mockReadFile.mockReturnValue('EDIT\t1\tAlice\tAdmin\t2024-01-15 09:00:00\tnot-a-date\n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })

  it('skips comment lines and blank lines', () => {
    mockReadFile.mockReturnValue('# comment\n\n   \n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })

  it('skips ADD/DEL lines where the embedded event is invalid', () => {
    mockReadFile.mockReturnValue('ADD\tabc\tAlice\tAdmin\t2024-01-15 09:00:00\n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })

  it('skips plain lines with an invalid event', () => {
    mockReadFile.mockReturnValue('abc\tAlice\tAdmin\t2024-01-15 09:00:00\n')
    expect(parseCorrectionFile('/fake/corrections.txt')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applyCorrections
// ---------------------------------------------------------------------------

describe('applyCorrections', () => {
  const ts = new Date('2024-01-15T09:00:00Z')
  const base = { empId: '1', name: 'Alice', dept: 'Admin', timestamp: ts }

  it('returns a copy of raw events when corrections is empty', () => {
    const result = applyCorrections([base], [])
    expect(result).toEqual([base])
    expect(result).not.toBe([base])
  })

  it('appends an event with ADD action', () => {
    const result = applyCorrections([], [{ action: 'ADD', event: base, oldTimestamp: null }])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(base)
  })

  it('removes the matching event with DEL action', () => {
    const result = applyCorrections([base], [{ action: 'DEL', event: base, oldTimestamp: null }])
    expect(result).toHaveLength(0)
  })

  it('only removes the exact empId+timestamp match for DEL', () => {
    const other = { ...base, empId: '2' }
    const result = applyCorrections([base, other], [{ action: 'DEL', event: base, oldTimestamp: null }])
    expect(result).toHaveLength(1)
    expect(result[0].empId).toBe('2')
  })

  it('rewrites the timestamp with EDIT action', () => {
    const newTs = new Date('2024-01-15T09:05:00Z')
    const item = { action: 'EDIT' as const, event: { ...base, timestamp: newTs }, oldTimestamp: ts }
    const result = applyCorrections([base], [item])
    expect(result[0].timestamp).toEqual(newTs)
  })

  it('skips EDIT when oldTimestamp is null', () => {
    const newTs = new Date('2024-01-15T09:05:00Z')
    const item = { action: 'EDIT' as const, event: { ...base, timestamp: newTs }, oldTimestamp: null }
    const result = applyCorrections([base], [item])
    expect(result[0].timestamp).toEqual(ts)
  })

  it('does not remove non-matching empId in DEL', () => {
    const wrongEmp = { ...base, empId: '99' }
    const result = applyCorrections([base], [{ action: 'DEL', event: wrongEmp, oldTimestamp: null }])
    expect(result).toHaveLength(1)
  })

  it('passes non-matching events through unchanged in EDIT map', () => {
    const other = { ...base, empId: '99' }
    const newTs = new Date('2024-01-15T09:05:00Z')
    const item = { action: 'EDIT' as const, event: { ...base, timestamp: newTs }, oldTimestamp: ts }
    const result = applyCorrections([base, other], [item])
    // base should be rewritten, other should be unchanged (hits `: e` branch)
    expect(result.find(e => e.empId === '99')).toBe(other)
    expect(result.find(e => e.empId === '1')!.timestamp).toEqual(newTs)
  })
})

// ---------------------------------------------------------------------------
// validateRawContent
// ---------------------------------------------------------------------------

describe('validateRawContent', () => {
  it('returns ok=true when at least one valid event is found', () => {
    expect(validateRawContent('1\tAlice\tAdmin\t2024-01-15 09:00:00').ok).toBe(true)
  })

  it('returns ok=false and an error message for empty content', () => {
    const { ok, error } = validateRawContent('')
    expect(ok).toBe(false)
    expect(error).toContain('No valid clock events found')
  })

  it('returns ok=false for only comment lines', () => {
    expect(validateRawContent('# comment\n# another').ok).toBe(false)
  })

  it('returns ok=false for lines with fewer than 4 parts', () => {
    expect(validateRawContent('1\tAlice\tAdmin').ok).toBe(false)
  })

  it('returns ok=false for a non-numeric empId', () => {
    expect(validateRawContent('abc\tAlice\tAdmin\t2024-01-15 09:00:00').ok).toBe(false)
  })

  it('returns ok=false for an invalid timestamp', () => {
    expect(validateRawContent('1\tAlice\tAdmin\tnot-a-date').ok).toBe(false)
  })

  it('returns an empty error string on success', () => {
    expect(validateRawContent('1\tAlice\tAdmin\t2024-01-15 09:00:00').error).toBe('')
  })
})
