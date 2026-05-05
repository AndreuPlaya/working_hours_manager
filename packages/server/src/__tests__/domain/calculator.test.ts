import { describe, it, expect } from 'vitest'
import { compute } from '../../domain/calculator.js'
import type { ClockEvent } from '../../domain/models.js'

function ev(empId: string, name: string, isoTs: string): ClockEvent {
  return { empId, name, dept: 'Test', timestamp: new Date(isoTs) }
}

describe('compute', () => {
  it('returns empty object for no events', () => {
    expect(compute([])).toEqual({})
  })

  it('produces an incomplete day with a single event (dangling clock-in)', () => {
    const events = [ev('1', 'Alice', '2024-01-15T09:00:00Z')]
    const result = compute(events)
    const key = '1|Alice'
    expect(result[key]).toBeDefined()
    const day = result[key].days['2024-01-15']
    expect(day.sessions).toHaveLength(0)
    expect(day.incomplete).toBe(true)
    expect(day.dangling).toEqual(new Date('2024-01-15T09:00:00Z'))
    expect(day.total).toBe(0)
  })

  it('pairs two events on the same day into one complete session', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
    ]
    const result = compute(events)
    const day = result['1|Alice'].days['2024-01-15']
    expect(day.sessions).toHaveLength(1)
    expect(day.sessions[0].clockIn).toEqual(new Date('2024-01-15T09:00:00Z'))
    expect(day.sessions[0].clockOut).toEqual(new Date('2024-01-15T17:00:00Z'))
    expect(day.total).toBe(8 * 3600 * 1000)
    expect(day.incomplete).toBe(false)
    expect(day.dangling).toBeNull()
  })

  it('handles three events → one session + dangling', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T12:00:00Z'),
      ev('1', 'Alice', '2024-01-15T13:00:00Z'),
    ]
    const result = compute(events)
    const day = result['1|Alice'].days['2024-01-15']
    expect(day.sessions).toHaveLength(1)
    expect(day.incomplete).toBe(true)
    expect(day.dangling).toEqual(new Date('2024-01-15T13:00:00Z'))
    expect(day.total).toBe(3 * 3600 * 1000)
  })

  it('creates separate day records for events on different days', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
      ev('1', 'Alice', '2024-01-16T09:00:00Z'),
      ev('1', 'Alice', '2024-01-16T17:00:00Z'),
    ]
    const result = compute(events)
    const days = result['1|Alice'].days
    expect(Object.keys(days)).toHaveLength(2)
    expect(days['2024-01-15']).toBeDefined()
    expect(days['2024-01-16']).toBeDefined()
  })

  it('creates separate employee keys for different employees', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('2', 'Bob', '2024-01-15T09:00:00Z'),
    ]
    const result = compute(events)
    expect(result['1|Alice']).toBeDefined()
    expect(result['2|Bob']).toBeDefined()
  })

  it('sorts unsorted events correctly before pairing', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
    ]
    const result = compute(events)
    const session = result['1|Alice'].days['2024-01-15'].sessions[0]
    expect(session.clockIn).toEqual(new Date('2024-01-15T09:00:00Z'))
    expect(session.clockOut).toEqual(new Date('2024-01-15T17:00:00Z'))
  })

  it('updates dept from the latest event for the same employee key', () => {
    const events = [
      { empId: '1', name: 'Alice', dept: 'OldDept', timestamp: new Date('2024-01-15T09:00:00Z') },
      { empId: '1', name: 'Alice', dept: 'NewDept', timestamp: new Date('2024-01-15T17:00:00Z') },
    ]
    const result = compute(events)
    expect(result['1|Alice'].dept).toBe('NewDept')
  })

  it('handles four events on one day as two complete sessions', () => {
    const events = [
      ev('1', 'Alice', '2024-01-15T09:00:00Z'),
      ev('1', 'Alice', '2024-01-15T12:00:00Z'),
      ev('1', 'Alice', '2024-01-15T13:00:00Z'),
      ev('1', 'Alice', '2024-01-15T17:00:00Z'),
    ]
    const result = compute(events)
    const day = result['1|Alice'].days['2024-01-15']
    expect(day.sessions).toHaveLength(2)
    expect(day.incomplete).toBe(false)
    expect(day.total).toBe((3 + 4) * 3600 * 1000)
  })
})
