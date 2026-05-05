import { describe, it, expect } from 'vitest'
import { fmtMs, fmtTime, fmtLocalTs, buildRows } from '../../infrastructure/reporter.js'
import type { DayRecord } from '../../domain/models.js'

// TZ=UTC is set globally in vitest.config.ts

describe('fmtMs', () => {
  it('formats 0 ms as "0h 00m"', () => {
    expect(fmtMs(0)).toBe('0h 00m')
  })

  it('formats exactly 1 hour', () => {
    expect(fmtMs(3_600_000)).toBe('1h 00m')
  })

  it('formats 1.5 hours correctly', () => {
    expect(fmtMs(5_400_000)).toBe('1h 30m')
  })

  it('pads single-digit minutes', () => {
    expect(fmtMs(3_660_000)).toBe('1h 01m')
  })

  it('formats more than 24 hours', () => {
    expect(fmtMs(90_000_000)).toBe('25h 00m')
  })
})

describe('fmtTime', () => {
  it('formats midnight as "00:00:00"', () => {
    const d = new Date('2024-01-15T00:00:00Z')
    expect(fmtTime(d)).toBe('00:00:00')
  })

  it('formats noon as "12:00:00"', () => {
    const d = new Date('2024-01-15T12:00:00Z')
    expect(fmtTime(d)).toBe('12:00:00')
  })

  it('formats 23:59:59 correctly', () => {
    const d = new Date('2024-01-15T23:59:59Z')
    expect(fmtTime(d)).toBe('23:59:59')
  })

  it('pads hours and seconds below 10', () => {
    const d = new Date('2024-01-15T09:01:05Z')
    expect(fmtTime(d)).toBe('09:01:05')
  })
})

describe('fmtLocalTs', () => {
  it('formats a date-time as "YYYY-MM-DD HH:MM:SS"', () => {
    const d = new Date('2024-01-15T09:05:30Z')
    expect(fmtLocalTs(d)).toBe('2024-01-15 09:05:30')
  })

  it('pads single-digit month and day', () => {
    const d = new Date('2024-02-05T00:00:00Z')
    expect(fmtLocalTs(d)).toBe('2024-02-05 00:00:00')
  })
})

// Helper to build a DayRecord
function makeDay(sessions: Array<[string, string]>, extra?: Partial<DayRecord>): DayRecord {
  const s = sessions.map(([ci, co]) => ({
    clockIn: new Date(ci),
    clockOut: new Date(co),
  }))
  const total = s.reduce((acc, sess) => acc + (sess.clockOut.getTime() - sess.clockIn.getTime()), 0)
  return {
    sessions: s,
    total,
    incomplete: false,
    dangling: null,
    ...extra,
  }
}

describe('buildRows', () => {
  it('returns empty rows and zero total for empty days', () => {
    const { rows, total } = buildRows({})
    expect(rows).toHaveLength(0)
    expect(total).toBe(0)
  })

  it('produces a single session row with the date label', () => {
    const day = makeDay([['2024-01-15T09:00:00Z', '2024-01-15T17:00:00Z']])
    const { rows, total } = buildRows({ '2024-01-15': day })
    expect(rows).toHaveLength(1)
    expect(rows[0].dateLabel).toContain('2024-01-15')
    expect(rows[0].clockIn).toBe('09:00:00')
    expect(rows[0].clockOut).toBe('17:00:00')
    expect(rows[0].isSubtotal).toBe(false)
    expect(rows[0].isIncomplete).toBe(false)
    expect(total).toBe(8 * 3_600_000)
  })

  it('produces session rows plus a subtotal row when a day has multiple sessions', () => {
    const day = makeDay([
      ['2024-01-15T09:00:00Z', '2024-01-15T12:00:00Z'],
      ['2024-01-15T13:00:00Z', '2024-01-15T17:00:00Z'],
    ])
    const { rows } = buildRows({ '2024-01-15': day })
    // 2 sessions + 1 subtotal
    expect(rows).toHaveLength(3)
    expect(rows[0].dateLabel).toContain('2024-01-15')
    expect(rows[1].dateLabel).toBe('')
    expect(rows[2].isSubtotal).toBe(true)
    expect(rows[2].clockOut).toBe('day total')
  })

  it('produces an incomplete row (clockOut=?) for a dangling event with no sessions', () => {
    const day: DayRecord = {
      sessions: [],
      total: 0,
      incomplete: true,
      dangling: new Date('2024-01-15T09:00:00Z'),
    }
    const { rows } = buildRows({ '2024-01-15': day })
    expect(rows).toHaveLength(1)
    expect(rows[0].clockOut).toBe('?')
    expect(rows[0].isIncomplete).toBe(true)
    expect(rows[0].dateLabel).toContain('2024-01-15')
  })

  it('puts an empty dateLabel on the incomplete row when there is already a session row', () => {
    const day = makeDay([['2024-01-15T09:00:00Z', '2024-01-15T12:00:00Z']], {
      incomplete: true,
      dangling: new Date('2024-01-15T13:00:00Z'),
    })
    const { rows } = buildRows({ '2024-01-15': day })
    // session row + incomplete row (no subtotal since sessions.length === 1)
    expect(rows).toHaveLength(2)
    expect(rows[1].dateLabel).toBe('')
    expect(rows[1].isIncomplete).toBe(true)
  })

  it('sorts days by date key and accumulates total across days', () => {
    const d1 = makeDay([['2024-01-16T09:00:00Z', '2024-01-16T17:00:00Z']])
    const d2 = makeDay([['2024-01-15T09:00:00Z', '2024-01-15T17:00:00Z']])
    const { rows, total } = buildRows({ '2024-01-16': d1, '2024-01-15': d2 })
    expect(rows[0].dateLabel).toContain('2024-01-15')
    expect(rows[1].dateLabel).toContain('2024-01-16')
    expect(total).toBe(16 * 3_600_000)
  })
})
