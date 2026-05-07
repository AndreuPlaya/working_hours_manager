<template>
  <div class="day-record">
    <!-- Date cell -->
    <div class="cell date-cell" :style="gridAt(1, 1)">
      <span class="date-label">{{ label }}</span>
    </div>

    <!-- Session rows -->
    <template v-for="(row, idx) in rows" :key="row.original.clock_in">
      <!-- Clock In group -->
      <div
        class="cell time-group"
        :class="{ clickable: canEdit(row, 'clock_in') }"
        :style="gridAt(idx + 1, 2)"
        @click="canEdit(row, 'clock_in') && startEdit(row, 'clock_in')"
      >
        <template v-if="row.pendingAddId">
          <span class="pending-time">{{ fmtTime(row.original.clock_in) }}</span>
          <button
            class="cancel-pending-btn"
            title="Cancel pending"
            @click.stop="emit('cancel-pending', { pendingId: row.pendingAddId! })"
          >×</button>
        </template>
        <template v-else-if="isEditing(row, 'clock_in')">
          <TimeInput
            :time="row.original.clock_in.slice(11, 16)"
            @commit="commitInlineEdit(row, 'clock_in', $event)"
            @cancel="editingCell = null"
          />
        </template>
        <template v-else>
          <span :class="{ 'pending-time': isPendingField(row.original, 'clock_in'), 'pending-del': hasPendingDelIn(row.original) }">
            {{ fmtTime(row.original.clock_in) }}
          </span>
          <button class="delete-btn" @click.stop="handleDeleteClick(row, 'clock_in')">×</button>
        </template>
      </div>

      <!-- Clock Out group -->
      <div
        class="cell time-group"
        :class="{ clickable: canEdit(row, 'clock_out') }"
        :style="gridAt(idx + 1, 3)"
        @click="canEdit(row, 'clock_out') && startEdit(row, 'clock_out')"
      >
        <template v-if="row.pendingAddId">
          <template v-if="findPendingClockOut(row.original)">
            <span class="pending-time">{{ fmtTime(findPendingClockOut(row.original)!.timestamp) }}</span>
            <button
              class="cancel-pending-btn"
              title="Cancel pending"
              @click.stop="emit('cancel-pending', { pendingId: findPendingClockOut(row.original)!.id })"
            >×</button>
          </template>
          <template v-else>
            <span class="ghost-placeholder">--:--</span>
          </template>
        </template>
        <template v-else-if="row.original.incomplete">
          <template v-if="findPendingClockOut(row.original)">
            <span class="pending-time">{{ fmtTime(findPendingClockOut(row.original)!.timestamp) }}</span>
            <button
              class="cancel-pending-btn"
              title="Cancel pending"
              @click.stop="emit('cancel-pending', { pendingId: findPendingClockOut(row.original)!.id })"
            >×</button>
          </template>
          <template v-else-if="isEditing(row, 'clock_out')">
            <TimeInput
              :time="null"
              @commit="commitInlineEdit(row, 'clock_out', $event)"
              @cancel="editingCell = null"
            />
          </template>
          <template v-else>
            <span class="incomplete-mark">--:--</span>
          </template>
        </template>
        <template v-else-if="isEditing(row, 'clock_out')">
          <TimeInput
            :time="row.original.clock_out!.slice(11, 16)"
            @commit="commitInlineEdit(row, 'clock_out', $event)"
            @cancel="editingCell = null"
          />
        </template>
        <template v-else>
          <span :class="{ 'pending-time': isPendingField(row.original, 'clock_out'), 'pending-del': hasPendingDelOut(row.original) }">
            {{ getPendingOrOriginal(row.original, 'clock_out') }}
          </span>
          <button class="delete-btn" @click.stop="handleDeleteClick(row, 'clock_out')">×</button>
        </template>
      </div>

      <!-- Duration -->
      <div class="cell dur-cell" :style="gridAt(idx + 1, 4)">
        <template v-if="row.original.incomplete">
          <span v-if="findPendingClockOut(row.original)" class="pending-time">
            {{ fmtMs(msFromDuration(row.original.clock_in, findPendingClockOut(row.original)!.timestamp)) }}
          </span>
          <span v-else class="incomplete-dur">incomplete</span>
        </template>
        <template v-else>{{ row.effectiveDuration }}</template>
      </div>
    </template>

    <!-- Day total (only when more than one real session) -->
    <div
      v-if="rows.filter(r => !r.pendingAddId).length > 1"
      class="total-row"
      :style="{ gridRow: rows.length + 1, gridColumn: '2 / 5' }"
    >
      <span class="total-label">Day total</span>
      <span class="total-dur">{{ dayTotal }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { EventRow, PendingItem } from '../../api/client.js'
import { useConfirm } from '../../composables/useConfirm.js'
import { fmtTime, fmtMs, msFromDuration } from '../../utils/time.js'
import TimeInput from './TimeInput.vue'

export interface EffectiveRow {
  original: EventRow
  effectiveDuration: string
  effectiveMs: number
  pendingAddId?: string
}

const props = defineProps<{
  label: string
  date: string
  rows: EffectiveRow[]
  dayTotal: string
  pendingItems: PendingItem[]
}>()

const emit = defineEmits<{
  'edit-cell': [payload: { oldTimestamp: string; newTimestamp: string }]
  'edit-cell-replace-pending': [payload: { pendingId: string; oldTimestamp: string; newTimestamp: string }]
  'add-event': [payload: { timestamp: string }]
  'delete-event': [payload: { timestamp: string }]
  'cancel-pending': [payload: { pendingId: string }]
}>()

// ─── Inline editing ───────────────────────────────────────────────────────────

const editingCell = ref<{ key: string; field: 'clock_in' | 'clock_out' } | null>(null)
const { confirm } = useConfirm()

function canEdit(row: EffectiveRow, field: 'clock_in' | 'clock_out'): boolean {
  if (row.pendingAddId) return false
  if (isEditing(row, field)) return false
  if (field === 'clock_out' && row.original.incomplete && findPendingClockOut(row.original)) return false
  return true
}

function startEdit(row: EffectiveRow, field: 'clock_in' | 'clock_out') {
  editingCell.value = { key: row.original.clock_in, field }
}

function isEditing(row: EffectiveRow, field: 'clock_in' | 'clock_out'): boolean {
  return editingCell.value?.key === row.original.clock_in && editingCell.value?.field === field
}

function commitInlineEdit(row: EffectiveRow, field: 'clock_in' | 'clock_out', hhmm: string) {
  editingCell.value = null
  const ts = field === 'clock_in' ? row.original.clock_in : row.original.clock_out
  const isAdd = !ts || (row.original.incomplete && field === 'clock_out')
  const date = field === 'clock_in'
    ? row.original.clock_in.slice(0, 10)
    : (row.original.clock_out?.slice(0, 10) ?? row.original.clock_in.slice(0, 10))
  const newTs = `${date} ${hhmm}:00`

  if (isAdd) { emit('add-event', { timestamp: newTs }); return }
  if (newTs === ts) return
  const pending = pendingFor(row.original, field)
  if (pending) {
    emit('edit-cell-replace-pending', { pendingId: pending.id, oldTimestamp: ts!, newTimestamp: newTs })
  } else {
    emit('edit-cell', { oldTimestamp: ts!, newTimestamp: newTs })
  }
}

function pendingDelFor(row: EventRow, field: 'clock_in' | 'clock_out'): PendingItem | undefined {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  if (!ts) return undefined
  return props.pendingItems.find(p => p.action === 'DEL' && p.timestamp === ts)
}

async function handleDeleteClick(row: EffectiveRow, field: 'clock_in' | 'clock_out') {
  const del = pendingDelFor(row.original, field)
  if (del) {
    emit('cancel-pending', { pendingId: del.id })
    return
  }
  const ts = field === 'clock_in' ? row.original.clock_in : row.original.clock_out!
  const ok = await confirm(`Delete the entry at ${fmtTime(ts)}?`)
  if (ok) emit('delete-event', { timestamp: ts })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gridAt(row: number, col: number) {
  return { gridRow: row, gridColumn: col }
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

function hasPendingDelIn(row: EventRow): boolean {
  return props.pendingItems.some(p => p.action === 'DEL' && p.timestamp === row.clock_in)
}

function hasPendingDelOut(row: EventRow): boolean {
  if (!row.clock_out) return false
  return props.pendingItems.some(p => p.action === 'DEL' && p.timestamp === row.clock_out)
}

function getPendingOrOriginal(row: EventRow, field: 'clock_in' | 'clock_out'): string {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  if (!ts) return ''
  const pending = props.pendingItems.find(p => p.action === 'EDIT' && p.timestamp === ts)
  const value = pending?.new_timestamp ?? ts
  return fmtTime(value)
}

function findPendingClockOut(row: EventRow): PendingItem | undefined {
  if (!row.incomplete || row.clock_out !== null) return undefined
  const date = row.clock_in.slice(0, 10)
  return props.pendingItems.find(p =>
    p.action === 'ADD' &&
    p.timestamp.startsWith(date) &&
    p.timestamp > row.clock_in
  )
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

// ─── Grid (4 columns: date | clock-in group | clock-out group | duration) ────

.day-record {
  display: grid;
  grid-template-columns: $col-date $col-group $col-group $col-dur;
  align-items: center;
  width: fit-content;
  margin: 0 auto;
}

// ─── Cells ───────────────────────────────────────────────────────────────────

.cell {
  display: flex;
  align-items: center;
  padding: .5rem .8rem;
  font-size: .95rem;
  min-height: 40px;
  gap: .4rem;
}

.date-cell {
  justify-content: flex-start;
  padding: .5rem .85rem;
  font-family: $font-ui;
  font-weight: 600;
  font-size: .92rem;
  color: $text;
  letter-spacing: .01em;
  gap: .5rem;
}

.time-group {
  position: relative;
  justify-content: center;
  font-family: $font-mono;
  font-size: .95rem;
  font-variant-numeric: tabular-nums;
  border-radius: $radius-sm;

  &.clickable {
    cursor: pointer;
  }

  &.clickable:hover {
    background: $selected-bg;
  }
}

.dur-cell {
  justify-content: center;
  font-family: $font-mono;
  font-size: .92rem;
  color: $text-label;
  font-variant-numeric: tabular-nums;
}

.ghost {
  opacity: .45;
  color: $text-muted;
  cursor: default;
}

// ─── Total row ───────────────────────────────────────────────────────────────

.total-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: .65rem;
  padding: .3rem .8rem;
  border-top: 1px solid $border;
  font-size: .88rem;
  font-weight: 600;
  color: $text-label;
}

.total-label {
  font-family: $font-ui;
  font-weight: 400;
  font-size: .82rem;
  color: $text-muted;
}

.total-dur {
  font-family: $font-mono;
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: right;
}

// ─── State indicators ─────────────────────────────────────────────────────────

.incomplete-mark {
  color: $danger;
  font-weight: 600;
}

.incomplete-dur {
  color: $danger;
  font-weight: 700;
  font-size: .82rem;
}

.pending-time {
  color: $warning;
}

.pending-del {
  color: $warning;
  text-decoration: line-through;
}

.ghost-placeholder {
  opacity: .4;
  font-size: .78rem;
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

.delete-btn {
  position: absolute;
  right: .4rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: $text-muted;
  font-size: .95rem;
  padding: 0 .1rem;
  line-height: 1;
  border-radius: 2px;
  opacity: 0;
  transition: opacity .12s, color .1s;

  &:hover { color: $danger; }
}

.time-group:hover .delete-btn {
  opacity: 1;
}

.cancel-pending-btn {
  position: absolute;
  right: .4rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: $text-muted;
  font-size: .95rem;
  padding: 0 .1rem;
  line-height: 1;
  border-radius: 2px;
  opacity: 0;
  transition: opacity .12s, color .1s;

  &:hover { color: $danger; }
}

.time-group:hover .cancel-pending-btn {
  opacity: 1;
}
</style>
