<template>
  <div class="month-view">
    <div v-if="!dayGroups.length && !draftRow" class="empty-month">
      <span>No sessions this month.</span>
      <button class="btn btn-primary" @click="draftRow = { date: monthPrefix + '-01' }">+ Add session</button>
    </div>
    <table v-else>
      <thead>
        <tr>
          <th class="col-date">Date</th>
          <th class="col-time">Clock In</th>
          <th class="col-time">Clock Out</th>
          <th class="col-dur">Duration</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in dayGroups" :key="group.date">
          <tr
            v-for="(row, idx) in group.rows"
            :key="row.original.clock_in"
            :class="{ incomplete: row.original.incomplete, 'has-pending': hasPending(row.original), 'has-pending-del': hasPendingDel(row.original) }"
          >
            <!-- Date label only on first row of day -->
            <td class="col-date">
              <span v-if="idx === 0" class="date-label">{{ group.label }}</span>
            </td>

            <!-- Clock In -->
            <td class="time-cell col-time" @click="startEdit(row.original, 'clock_in')">
              <template v-if="editing?.key === row.original.clock_in + ':in'">
                <TimeInput
                  :time="row.original.clock_in.slice(11)"
                  @commit="v => commitClockIn(row.original, v)"
                  @cancel="editing = null"
                />
              </template>
              <template v-else>
                <span :class="{ strikethrough: isPendingField(row.original, 'clock_in') }">{{ fmtTime(row.original.clock_in) }}</span>
                <span v-if="isPendingField(row.original, 'clock_in')" class="pending-val">
                  {{ fmtTime(pendingNewTs(row.original, 'clock_in')!) }}
                  <span class="badge-pending">pending</span>
                </span>
              </template>
            </td>

            <!-- Clock Out -->
            <td class="time-cell col-time" @click="startEdit(row.original, 'clock_out')">
              <template v-if="editing?.key === row.original.clock_in + ':out'">
                <TimeInput
                  :time="row.original.clock_out ? row.original.clock_out.slice(11) : null"
                  @commit="v => commitClockOut(row.original, v)"
                  @cancel="editing = null"
                />
              </template>
              <template v-else>
                <span v-if="row.original.incomplete" class="incomplete-mark" title="Click to add missing clock-out">--:--:--</span>
                <template v-else>
                  <span :class="{ strikethrough: isPendingField(row.original, 'clock_out') }">{{ fmtTime(row.original.clock_out!) }}</span>
                  <span v-if="isPendingField(row.original, 'clock_out')" class="pending-val">
                    {{ fmtTime(pendingNewTs(row.original, 'clock_out')!) }}
                    <span class="badge-pending">pending</span>
                  </span>
                </template>
              </template>
            </td>

            <!-- Duration (effective = with pending applied) -->
            <td class="col-dur">{{ row.effectiveDuration }}</td>

            <!-- Actions -->
            <td class="col-actions">
              <span v-if="hasPendingDel(row.original)" class="badge-pending-del">pending delete</span>
              <button
                v-if="idx === group.rows.length - 1"
                class="add-btn"
                title="Add session for this day"
                @click.stop="draftRow = { date: group.date }"
              >+</button>
            </td>
          </tr>

          <!-- Draft row for inline add -->
          <tr v-if="draftRow?.date === group.date" class="draft-row">
            <td class="col-date"></td>
            <td class="time-cell col-time">
              <TimeInput
                :time="null"
                @commit="v => commitDraft(group.date, v)"
                @cancel="draftRow = null"
              />
            </td>
            <td class="col-time"><span class="incomplete-mark">--:--:--</span></td>
            <td class="col-dur">—</td>
            <td class="col-actions"></td>
          </tr>

          <!-- Day subtotal row: only when a day has more than one session -->
          <tr v-if="group.rows.length > 1" class="subtotal-row">
            <td class="col-date"></td>
            <td colspan="2" class="subtotal-label">Day total</td>
            <td class="col-dur">{{ group.dayTotal }}</td>
            <td class="col-actions"></td>
          </tr>
        </template>

        <!-- Draft row for empty month (no existing day groups) -->
        <tr v-if="draftRow && !dayGroups.length" class="draft-row">
          <td class="col-date"></td>
          <td class="time-cell col-time">
            <TimeInput
              :time="null"
              @commit="v => commitDraft(draftRow!.date, v)"
              @cancel="draftRow = null"
            />
          </td>
          <td class="col-time"><span class="incomplete-mark">--:--:--</span></td>
          <td class="col-dur">—</td>
          <td class="col-actions"></td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="month-total-row">
          <td class="col-date"></td>
          <td colspan="2" class="total-label">Month total</td>
          <td class="col-dur">{{ monthTotal }}</td>
          <td class="col-actions"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EventRow, PendingItem } from '../../api/client.js'
import { useAppConfig } from '../../composables/useAppConfig.js'
import TimeInput from './TimeInput.vue'

const { config: appConfig } = useAppConfig()

const props = defineProps<{
  rows: EventRow[]
  pendingItems: PendingItem[]
  year: number
  month: number
}>()

const emit = defineEmits<{
  'edit-cell': [payload: { oldTimestamp: string; newTimestamp: string }]
  'edit-cell-replace-pending': [payload: { pendingId: string; oldTimestamp: string; newTimestamp: string }]
  'add-event': [payload: { timestamp: string }]
}>()

interface EffectiveRow {
  original: EventRow
  effectiveDuration: string
}

interface DayGroup {
  date: string
  label: string
  rows: EffectiveRow[]
  dayTotal: string
}

const editing = ref<{ key: string } | null>(null)
const draftRow = ref<{ date: string } | null>(null)

const monthPrefix = computed(() => {
  const y = props.year
  const m = String(props.month).padStart(2, '0')
  return `${y}-${m}`
})

function computeDuration(clockIn: string, clockOut: string): string {
  const ms = new Date(clockOut.replace(' ', 'T')).getTime()
           - new Date(clockIn.replace(' ', 'T')).getTime()
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h${String(m).padStart(2, '0')}`
}

function msFromDuration(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0
  const ms = new Date(clockOut.replace(' ', 'T')).getTime()
           - new Date(clockIn.replace(' ', 'T')).getTime()
  return ms > 0 ? ms : 0
}

function fmtMs(ms: number): string {
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h${String(m).padStart(2, '0')}`
}

function isPendingField(row: EventRow, field: 'clock_in' | 'clock_out'): boolean {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  if (!ts) return false
  return props.pendingItems.some(p => p.action === 'EDIT' && p.timestamp === ts)
}

function pendingFor(row: EventRow, field: 'clock_in' | 'clock_out'): PendingItem | undefined {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  if (!ts) return undefined
  return props.pendingItems.find(p => p.action === 'EDIT' && p.timestamp === ts)
}

function hasPending(row: EventRow): boolean {
  return props.pendingItems.some(p =>
    (p.action === 'EDIT' && (p.timestamp === row.clock_in || p.timestamp === row.clock_out)) ||
    (p.action === 'DEL' && p.timestamp === row.clock_in)
  )
}

function hasPendingDel(row: EventRow): boolean {
  return props.pendingItems.some(p => p.action === 'DEL' && p.timestamp === row.clock_in)
}

function pendingNewTs(row: EventRow, field: 'clock_in' | 'clock_out'): string | null {
  return pendingFor(row, field)?.new_timestamp ?? null
}

const effectiveRows = computed<EffectiveRow[]>(() => {
  const prefix = monthPrefix.value
  return props.rows
    .filter(r => r.clock_in.startsWith(prefix))
    .map(row => {
      const pendingIn = pendingFor(row, 'clock_in')
      const pendingOut = pendingFor(row, 'clock_out')
      const effIn = pendingIn?.new_timestamp ?? row.clock_in
      const effOut = pendingOut?.new_timestamp ?? row.clock_out
      const effectiveDuration = row.incomplete
        ? '—'
        : computeDuration(effIn, effOut ?? '')
      return { original: row, effectiveDuration }
    })
    .sort((a, b) => a.original.clock_in.localeCompare(b.original.clock_in))
})

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(dateStr: string, fmt: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, d).getDay()
  return fmt
    .replace('YYYY', String(y))
    .replace('MM',   String(mo).padStart(2, '0'))
    .replace('dd',   String(d).padStart(2, '0'))
    .replace('ddd',  DAY_NAMES[dow])
}

function dayLabel(dateStr: string): string {
  return formatDate(dateStr, appConfig.value.date_format || 'MM/dd(ddd)')
}

const dayGroups = computed<DayGroup[]>(() => {
  const map = new Map<string, EffectiveRow[]>()
  for (const row of effectiveRows.value) {
    const date = row.original.clock_in.slice(0, 10)
    if (!map.has(date)) map.set(date, [])
    map.get(date)!.push(row)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const totalMs = rows.reduce((sum, r) => {
      const pendingIn = pendingFor(r.original, 'clock_in')
      const pendingOut = pendingFor(r.original, 'clock_out')
      const effIn = pendingIn?.new_timestamp ?? r.original.clock_in
      const effOut = pendingOut?.new_timestamp ?? r.original.clock_out
      return sum + msFromDuration(effIn, effOut)
    }, 0)
    return { date, label: dayLabel(date), rows, dayTotal: fmtMs(totalMs) }
  })
})

const monthTotal = computed<string>(() => {
  const totalMs = dayGroups.value.reduce((sum, g) => {
    return sum + g.rows.reduce((s, r) => {
      const pendingIn = pendingFor(r.original, 'clock_in')
      const pendingOut = pendingFor(r.original, 'clock_out')
      const effIn = pendingIn?.new_timestamp ?? r.original.clock_in
      const effOut = pendingOut?.new_timestamp ?? r.original.clock_out
      return s + msFromDuration(effIn, effOut)
    }, 0)
  }, 0)
  return fmtMs(totalMs)
})

function fmtTime(ts: string): string {
  const hhmm = ts.slice(11, 16)
  if (appConfig.value.time_format === '12h') {
    const [h, m] = hhmm.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
  }
  return hhmm
}

function startEdit(row: EventRow, field: 'clock_in' | 'clock_out') {
  editing.value = { key: row.clock_in + (field === 'clock_in' ? ':in' : ':out') }
}

function commitClockIn(row: EventRow, hhmm: string) {
  if (!editing.value) return
  editing.value = null
  const newTs = row.clock_in.slice(0, 10) + ' ' + hhmm + ':00'
  if (newTs === row.clock_in) return
  const pending = pendingFor(row, 'clock_in')
  if (pending) {
    emit('edit-cell-replace-pending', { pendingId: pending.id, oldTimestamp: row.clock_in, newTimestamp: newTs })
  } else {
    emit('edit-cell', { oldTimestamp: row.clock_in, newTimestamp: newTs })
  }
}

function commitClockOut(row: EventRow, hhmm: string) {
  if (!editing.value) return
  editing.value = null
  // Use existing clock_out date if present, otherwise use clock_in date
  const date = row.clock_out ? row.clock_out.slice(0, 10) : row.clock_in.slice(0, 10)
  const newTs = date + ' ' + hhmm + ':00'
  // Adding a missing clock-out on an incomplete session
  if (!row.clock_out) {
    emit('add-event', { timestamp: newTs })
    return
  }
  if (newTs === row.clock_out) return
  const pending = pendingFor(row, 'clock_out')
  if (pending) {
    emit('edit-cell-replace-pending', { pendingId: pending.id, oldTimestamp: row.clock_out, newTimestamp: newTs })
  } else {
    emit('edit-cell', { oldTimestamp: row.clock_out, newTimestamp: newTs })
  }
}

function commitDraft(date: string, hhmm: string) {
  draftRow.value = null
  emit('add-event', { timestamp: date + ' ' + hhmm + ':00' })
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.month-view {
  flex: 1;
  overflow: auto;
  padding: .5rem 0;
}

.empty-month {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 2rem;
  color: $text-muted;
  font-size: .875rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: .85rem;

  th, td {
    padding: .4rem .65rem;
    text-align: left;
    border-bottom: 1px solid $border-light;
  }

  th {
    font-weight: 600;
    color: $text-muted;
    font-size: .75rem;
    text-transform: uppercase;
    background: $bg;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  tbody tr:hover td { background: $border-light; }
  tbody tr.incomplete td { color: $warning; }
  tbody tr.has-pending td { background: #fffbeb; }
  tbody tr.has-pending:hover td { background: #fef3c7; }
  tbody tr.has-pending-del td { background: #fff1f2; text-decoration: line-through; opacity: .7; }
  tbody tr.has-pending-del:hover td { background: #ffe4e6; }
  tbody tr.draft-row td { background: $border-light; }
}

.col-date  { width: 110px; }
.col-time  { width: 140px; }
.col-dur   { width: 90px; }
.col-actions { width: 70px; text-align: right; white-space: nowrap; }

.date-label { font-weight: 500; color: $text-label; }

.time-cell {
  cursor: pointer;
}

.incomplete-mark { color: $warning; font-weight: 600; font-size: .8rem; letter-spacing: .04em; }

.strikethrough { text-decoration: line-through; opacity: .6; }

.pending-val {
  font-size: .78rem;
  margin-left: .35rem;
  color: $warning;
}

.badge-pending {
  display: inline-block;
  font-size: .65rem;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  color: #92400e;
  border-radius: 3px;
  padding: 0 .3rem;
  vertical-align: middle;
  margin-left: .2rem;
}

.badge-pending-del {
  display: inline-block;
  font-size: .65rem;
  background: #ffe4e6;
  border: 1px solid #fca5a5;
  color: #991b1b;
  border-radius: 3px;
  padding: 0 .3rem;
  vertical-align: middle;
}

.subtotal-row td {
  font-weight: 600;
  border-top: 1px solid $border;
  background: $bg !important;
  color: $text-muted;
  font-size: .8rem;
}
.subtotal-label { font-style: italic; }

tfoot .month-total-row td {
  font-weight: 700;
  border-top: 2px solid $border;
  background: $bg;
  padding-top: .6rem;
  padding-bottom: .6rem;
}
.total-label { color: $text-label; }

.add-btn {
  background: none;
  border: 1px solid $border;
  border-radius: 3px;
  cursor: pointer;
  color: $accent;
  font-size: .8rem;
  padding: .1rem .4rem;
  opacity: 0;
  transition: opacity .15s;
  tr:hover & { opacity: 1; }
  &:hover { background: $selected-bg; }
}
</style>
