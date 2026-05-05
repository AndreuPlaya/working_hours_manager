export interface ClockEvent {
  empId: string
  name: string
  dept: string
  timestamp: Date
}

export interface Session {
  clockIn: Date
  clockOut: Date
}

export interface DayRecord {
  sessions: Session[]
  total: number       // duration in milliseconds
  incomplete: boolean
  dangling: Date | null
}

export interface CorrectionItem {
  action: 'ADD' | 'DEL' | 'EDIT'
  event: ClockEvent
  oldTimestamp: Date | null
}

export type EmployeeData = Record<string, { dept: string; days: Record<string, DayRecord> }>
