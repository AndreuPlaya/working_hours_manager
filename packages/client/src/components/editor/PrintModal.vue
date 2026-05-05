<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal print-modal">
      <div class="modal-header no-print">
        <h2>Print Records</h2>
        <div class="mode-selector">
          <label v-for="opt in modeOptions" :key="opt.value">
            <input type="radio" v-model="mode" :value="opt.value" />
            {{ opt.label }}
          </label>
        </div>
      </div>

      <div class="print-content">
        <div class="print-title">{{ employeeName }} — {{ modeTitle }}</div>
        <template v-for="group in monthGroups" :key="group.label">
          <div class="month-heading">{{ group.label }}</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(day, di) in group.days" :key="di">
                <tr v-for="(row, ri) in day.rows" :key="ri">
                  <td>{{ ri === 0 ? day.label : '' }}</td>
                  <td>{{ row.clock_in.slice(11, 16) }}</td>
                  <td>{{ row.clock_out ? row.clock_out.slice(11, 16) : '—' }}</td>
                  <td>{{ row.duration ?? '—' }}</td>
                </tr>
                <tr v-if="day.rows.length > 1" class="subtotal">
                  <td></td>
                  <td colspan="2">Day total</td>
                  <td>{{ day.dayTotal }}</td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr class="month-total">
                <td></td>
                <td colspan="2">Month total</td>
                <td>{{ group.monthTotal }}</td>
              </tr>
            </tfoot>
          </table>
        </template>
      </div>

      <div class="modal-footer no-print">
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" @click="print">Print</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EventRow } from '../../api/client.js'

const props = defineProps<{
  rows: EventRow[]
  year: number
  month: number
  employeeName: string
}>()

defineEmits<{ close: [] }>()

type Mode = 'month' | 'year' | 'all'
const mode = ref<Mode>('month')

const modeOptions = [
  { value: 'month' as Mode, label: 'Selected month' },
  { value: 'year'  as Mode, label: 'Selected year' },
  { value: 'all'   as Mode, label: 'Complete records' },
]

const modeTitle = computed(() => {
  if (mode.value === 'month') {
    return new Date(props.year, props.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  }
  if (mode.value === 'year') return String(props.year)
  return 'All records'
})

function filteredRows() {
  if (mode.value === 'month') {
    const prefix = `${props.year}-${String(props.month).padStart(2, '0')}`
    return props.rows.filter(r => r.clock_in.startsWith(prefix))
  }
  if (mode.value === 'year') {
    return props.rows.filter(r => r.clock_in.startsWith(String(props.year)))
  }
  return props.rows
}

function msFromRow(r: EventRow): number {
  if (!r.clock_out || r.incomplete) return 0
  const ms = new Date(r.clock_out.replace(' ', 'T')).getTime()
           - new Date(r.clock_in.replace(' ', 'T')).getTime()
  return ms > 0 ? ms : 0
}

function fmtMs(ms: number): string {
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h${String(m).padStart(2, '0')}`
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, d).getDay()
  return `${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}(${DAY_NAMES[dow]})`
}

const monthGroups = computed(() => {
  const rows = filteredRows().slice().sort((a, b) => a.clock_in.localeCompare(b.clock_in))
  const byMonth = new Map<string, EventRow[]>()
  for (const r of rows) {
    const key = r.clock_in.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(r)
  }
  return [...byMonth.entries()].sort().map(([key, mRows]) => {
    const [y, mo] = key.split('-').map(Number)
    const label = new Date(y, mo - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    const byDay = new Map<string, EventRow[]>()
    for (const r of mRows) {
      const d = r.clock_in.slice(0, 10)
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d)!.push(r)
    }
    let monthMs = 0
    const days = [...byDay.entries()].sort().map(([date, dRows]) => {
      let dayMs = 0
      for (const r of dRows) dayMs += msFromRow(r)
      monthMs += dayMs
      return { label: dayLabel(date), rows: dRows, dayTotal: fmtMs(dayMs) }
    })
    return { label, days, monthTotal: fmtMs(monthMs) }
  })
})

function print() {
  window.print()
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.45);
  display: flex; align-items: flex-start; justify-content: center;
  z-index: 100;
  padding: 2rem 1rem;
  overflow-y: auto;
}

.print-modal {
  background: $card;
  border-radius: 8px;
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 0;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
}

.modal-header {
  padding: 1.25rem 1.5rem .75rem;
  border-bottom: 1px solid $border;

  h2 { margin: 0 0 .75rem; font-size: 1.05rem; }
}

.mode-selector {
  display: flex; gap: 1.5rem;
  label { display: flex; align-items: center; gap: .4rem; font-size: .875rem; cursor: pointer; }
}

.print-content {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  max-height: 60vh;
}

.print-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: $text;
}

.month-heading {
  font-size: .85rem;
  font-weight: 600;
  color: $text-label;
  text-transform: uppercase;
  letter-spacing: .04em;
  margin: 1rem 0 .4rem;
  &:first-of-type { margin-top: 0; }
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: .82rem;
  margin-bottom: .5rem;

  th, td {
    padding: .3rem .5rem;
    text-align: left;
    border-bottom: 1px solid $border-light;
  }

  th {
    font-weight: 600;
    color: $text-muted;
    font-size: .72rem;
    text-transform: uppercase;
  }

  .subtotal td {
    font-weight: 600;
    font-size: .78rem;
    color: $text-label;
    border-top: 1px solid $border;
    background: $bg;
  }

  tfoot .month-total td {
    font-weight: 700;
    border-top: 2px solid $border;
    background: $bg;
    color: $text-label;
    padding-top: .45rem;
    padding-bottom: .45rem;
  }
}

.modal-footer {
  display: flex; gap: .5rem; justify-content: flex-end;
  padding: .75rem 1.5rem 1.25rem;
  border-top: 1px solid $border;
}

@media print {
  .modal-overlay {
    position: static;
    background: none;
    padding: 0;
    display: block;
  }

  .print-modal {
    box-shadow: none;
    border-radius: 0;
    max-width: none;
  }

  .no-print { display: none !important; }

  .print-content {
    max-height: none;
    overflow: visible;
    padding: 0;
  }
}
</style>
