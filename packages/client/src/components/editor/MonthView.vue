<template>
  <div class="month-view">
    <!-- Month name header -->
    <div class="month-header">{{ monthName }}</div>

    <div v-if="!dayGroups.length && newRowAt === null" class="empty-month">
      No sessions<template v-if="!isFutureMonth"> — <button class="add-link" @click.stop="openNewRow(-1)">+ Add</button></template>
    </div>

    <template v-if="dayGroups.length > 0 || newRowAt !== null">
      <!-- Column headers -->
      <div class="records-header">
        <div class="hcol hcol-date">Date</div>
        <div class="hcol hcol-group">Clock In</div>
        <div class="hcol hcol-group">Clock Out</div>
        <div class="hcol hcol-dur">Duration</div>
      </div>

      <!-- Spacer: breathing room below header -->
      <div class="records-spacer" />

      <!-- Separator before first group -->
      <div v-if="!isFutureMonth" class="day-separator" @click.stop="openNewRow(-1)" />
      <NewRowInput
        v-if="newRowAt === -1"
        :year="props.year"
        :month="props.month"
        :min-date="minDate"
        @add="onNewRowAdd"
        @cancel="newRowAt = null"
      />

      <!-- One DayRecord per day group, each followed by a separator -->
      <template v-for="(group, idx) in dayGroups" :key="group.date">
        <DayRecord
          :label="group.label"
          :date="group.date"
          :rows="group.rows"
          :day-total="group.dayTotal"
          :pending-items="pendingItems"
          @edit-cell="$emit('edit-cell', $event)"
          @edit-cell-replace-pending="$emit('edit-cell-replace-pending', $event)"
          @add-event="$emit('add-event', $event)"
          @delete-event="$emit('delete-event', $event)"
          @cancel-pending="$emit('cancel-pending', $event)"
        />
        <div v-if="!isFutureMonth" class="day-separator" @click.stop="openNewRow(idx)" />
        <NewRowInput
          v-if="newRowAt === idx"
          :year="props.year"
          :month="props.month"
          :min-date="minDate"
          @add="onNewRowAdd"
          @cancel="newRowAt = null"
        />
      </template>

      <!-- Month total -->
      <div v-if="dayGroups.length > 0" class="month-total-row">
        <span class="month-total-label">Month total</span>
        <span class="month-total-dur">{{ monthTotal }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EventRow, PendingItem } from '../../api/client.js'
import { useAppConfig } from '../../composables/useAppConfig.js'
import { fmtMs, msFromDuration } from '../../utils/time.js'
import { dayLabel } from '../../utils/date.js'
import DayRecord from './DayRecord.vue'
import NewRowInput from './NewRowInput.vue'
import type { EffectiveRow } from './DayRecord.vue'

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
  'delete-event': [payload: { timestamp: string }]
  'cancel-pending': [payload: { pendingId: string }]
}>()

interface DayGroup {
  date: string
  label: string
  rows: EffectiveRow[]
  dayTotal: string
}

// ─── New-session row ──────────────────────────────────────────────────────────

const newRowAt = ref<number | null>(null)  // -1 = before first group; idx = after group[idx]

function openNewRow(at: number) {
  newRowAt.value = at
}

function onNewRowAdd(timestamp: string) {
  emit('add-event', { timestamp })
}

const isFutureMonth = computed(() => {
  const n = new Date()
  return props.year > n.getFullYear() || (props.year === n.getFullYear() && props.month > n.getMonth() + 1)
})

const minDate = computed(() => {
  if (!props.rows.length) return null
  return props.rows.reduce((min, r) => r.clock_in < min ? r.clock_in : min, props.rows[0].clock_in).slice(0, 10)
})

// ─── Date helpers ─────────────────────────────────────────────────────────────

const monthName = computed(() =>
  new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(props.year, props.month - 1))
)

const monthPrefix = computed(() => {
  const y = props.year
  const m = String(props.month).padStart(2, '0')
  return `${y}-${m}`
})

// ─── Data helpers ─────────────────────────────────────────────────────────────

function pendingFor(row: EventRow, field: 'clock_in' | 'clock_out'): PendingItem | undefined {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  if (!ts) return undefined
  return props.pendingItems.find(p => p.action === 'EDIT' && p.timestamp === ts)
}

function localDayLabel(dateStr: string): string {
  return dayLabel(dateStr, appConfig.value.date_format || 'MM/dd(ddd)')
}

// ─── Computed data ────────────────────────────────────────────────────────────

const effectiveRows = computed<EffectiveRow[]>(() => {
  const prefix = monthPrefix.value
  return props.rows
    .filter(r => r.clock_in.startsWith(prefix))
    .map(row => {
      const pendingIn = pendingFor(row, 'clock_in')
      const pendingOut = pendingFor(row, 'clock_out')
      const effIn = pendingIn?.new_timestamp ?? row.clock_in
      const effOut = pendingOut?.new_timestamp ?? row.clock_out
      const effectiveMs = row.incomplete ? 0 : msFromDuration(effIn, effOut)
      return { original: row, effectiveDuration: fmtMs(effectiveMs), effectiveMs }
    })
    .sort((a, b) => a.original.clock_in.localeCompare(b.original.clock_in))
})

const dayGroups = computed<DayGroup[]>(() => {
  const prefix = monthPrefix.value
  const map = new Map<string, EffectiveRow[]>()

  for (const row of effectiveRows.value) {
    const date = row.original.clock_in.slice(0, 10)
    if (!map.has(date)) map.set(date, [])
    map.get(date)!.push(row)
  }

  // Pending ADD items show as synthetic orange rows
  for (const p of props.pendingItems) {
    if (p.action !== 'ADD') continue
    if (!p.timestamp.startsWith(prefix)) continue
    const date = p.timestamp.slice(0, 10)

    // Skip pending ADD if it's likely a clock_out for an incomplete session
    const dayRows = map.get(date)
    const hasIncomplete = dayRows?.some(r => r.original.incomplete && r.original.clock_out === null)
    if (hasIncomplete) continue

    if (!map.has(date)) map.set(date, [])
    map.get(date)!.push({
      original: { date, clock_in: p.timestamp, clock_out: null, duration: null, incomplete: true },
      effectiveDuration: '—',
      effectiveMs: 0,
      pendingAddId: p.id,
    })
  }

  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const totalMs = rows
      .filter(r => !r.pendingAddId)
      .reduce((sum, r) => sum + r.effectiveMs, 0)
    return { date, label: localDayLabel(date), rows, dayTotal: fmtMs(totalMs) }
  })
})

const monthTotal = computed<string>(() => {
  const totalMs = effectiveRows.value.reduce((sum, r) => sum + r.effectiveMs, 0)
  return fmtMs(totalMs)
})
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;


.month-view {
  padding: .5rem 0 2rem;
}

// ─── Month header ─────────────────────────────────────────────────────────────

.month-header {
  font-family: $font-ui;
  font-size: 1rem;
  font-weight: 700;
  color: $text;
  letter-spacing: .02em;
  padding: .75rem .65rem .5rem;
  width: fit-content;
  margin: 0 auto;
  min-width: calc($col-date + $col-group * 2 + $col-dur);
  border-bottom: 1.5px solid $border-light;
  margin-bottom: .1rem;
}

.empty-month {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding: .35rem .65rem .75rem;
  color: $text-muted;
  font-size: .8rem;
  width: fit-content;
  margin: 0 auto;
}

.add-link {
  background: none;
  border: none;
  cursor: pointer;
  color: $accent;
  font-size: .8rem;
  padding: 0;
  font-family: inherit;
  &:hover { text-decoration: underline; }
}

// ─── Spacer ───────────────────────────────────────────────────────────────────

.records-spacer {
  height: .75rem;
}

// ─── Column headers ───────────────────────────────────────────────────────────

.records-header {
  display: grid;
  grid-template-columns: $col-date $col-group $col-group $col-dur;
  background: $bg;
  border-bottom: 1px solid $border-light;
  margin: 0 auto;
  width: fit-content;
}

.hcol {
  padding: .35rem .5rem;
  font-family: $font-ui;
  font-size: .7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: $text-muted;
  text-align: center;

  &.hcol-date { padding-left: .65rem; text-align: left; }
  &.hcol-dur  { text-align: center; }
}

// ─── Day separator ────────────────────────────────────────────────────────────

.day-separator {
  height: 2px;
  width: calc($col-date + $col-group * 2 + $col-dur);
  margin: 0 auto;
  cursor: pointer;
  background: $border-light;
  border-radius: 2px;
  transition: height .12s, background .12s, opacity .12s;

  &:hover {
    height: 6px;
    background: $accent;
    opacity: .3;
  }
}

// ─── Month total ──────────────────────────────────────────────────────────────

.month-total-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: .65rem;
  padding: .6rem .85rem;
  border-top: 2px solid $border;
  font-family: $font-ui;
  font-weight: 700;
  font-size: .95rem;
  color: $text-label;
  width: calc($col-date + $col-group * 2 + $col-dur);
  margin: 0 auto;
}

.month-total-label {
  font-weight: 400;
  font-size: .88rem;
  color: $text-muted;
  margin-right: auto;
  padding-left: .15rem;
}

.month-total-dur {
  font-family: $font-mono;
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: right;
}
</style>
