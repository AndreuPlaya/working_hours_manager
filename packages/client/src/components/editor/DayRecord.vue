<template>
  <div class="day-record">
    <!-- Date cell – row 1 only, no span (naturally aligns with first session row) -->
    <div class="cell date-cell" :style="gridAt(1, 1)">
      <span class="date-label">{{ label }}</span>
      <button class="add-session-btn" title="Add session" @click="startDraft">+</button>
    </div>

    <!-- Session rows -->
    <template v-for="(row, idx) in rows" :key="row.original.clock_in">
      <!-- Clock In group (time + edit hint, entire cell is clickable) -->
      <div
        class="cell time-group"
        :class="{ clickable: !row.pendingAddId }"
        :style="gridAt(idx + 1, 2)"
        @click="!row.pendingAddId && openPopup(row, 'clock_in', $event)"
      >
        <span :class="{ 'pending-time': row.pendingAddId || isPendingField(row.original, 'clock_in') || hasPendingDelIn(row.original) }">
          {{ fmtTime(row.original.clock_in) }}
        </span>
        <span v-if="!row.pendingAddId" class="edit-hint">
          <EditIcon />
        </span>
        <button
          v-else
          class="cancel-pending-btn"
          title="Cancel pending"
          @click.stop="emit('cancel-pending', { pendingId: row.pendingAddId! })"
        >×</button>
      </div>

      <!-- Clock Out group (click to edit or add clock-out) -->
      <div
        class="cell time-group"
        :class="{ clickable: !row.pendingAddId }"
        :style="gridAt(idx + 1, 3)"
        @click="!row.pendingAddId && openPopup(row, 'clock_out', $event)"
      >
        <template v-if="row.pendingAddId">
          <span class="ghost-placeholder">--:--</span>
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
          <template v-else>
            <span class="incomplete-mark">--:--</span>
            <span class="edit-hint">
              <EditIcon />
            </span>
          </template>
        </template>
        <template v-else>
          <span :class="{ 'pending-time': isPendingField(row.original, 'clock_out') || hasPendingDelOut(row.original) }">
            {{ getPendingOrOriginal(row.original, 'clock_out') }}
          </span>
          <span class="edit-hint">
            <EditIcon />
          </span>
        </template>
      </div>

      <!-- Duration -->
      <div class="cell dur-cell" :style="gridAt(idx + 1, 4)">
        <span v-if="row.pendingAddId" class="badge badge-pending">pending</span>
        <span v-else-if="row.original.incomplete && findPendingClockOut(row.original)" class="badge badge-pending">pending</span>
        <span v-else-if="row.original.incomplete" class="incomplete-dur">incomplete</span>
        <template v-else>{{ row.effectiveDuration }}</template>
      </div>
    </template>

    <!-- Draft row – persistent, not dismissed on blur -->
    <template v-if="draftActive">
      <div class="cell time-group draft-input-group" :style="gridAt(rows.length + 1, 2)">
        <TimeInput :time="null" @commit="commitDraft" />
      </div>
      <div class="cell time-group ghost" :style="gridAt(rows.length + 1, 3)">
        <span class="ghost-placeholder">--:--</span>
      </div>
      <div class="cell dur-cell ghost" :style="gridAt(rows.length + 1, 4)">—</div>
    </template>

    <!-- Day total (only when more than one real session) -->
    <div
      v-if="rows.filter(r => !r.pendingAddId).length > 1"
      class="total-row"
      :style="{
        gridRow: rows.length + (draftActive ? 1 : 0) + 1,
        gridColumn: '2 / 5',
      }"
    >
      <span class="total-label">Day total</span>
      <span class="total-dur">{{ dayTotal }}</span>
    </div>

    <!-- Edit / Add popup -->
    <Teleport to="body">
      <Transition name="popup">
        <div
          v-if="popup"
          ref="popupEl"
          class="edit-popup"
          :style="{ top: popup.y + 'px', left: popup.x + 'px' }"
          @click.stop
        >
          <div class="popup-field">
            <label class="popup-label">
              {{ popup.field === 'clock_in' ? 'Clock In' : 'Clock Out' }}
            </label>
            <input
              ref="popupInputEl"
              type="time"
              class="popup-time-input"
              v-model="popupValue"
              @keydown.enter.prevent="savePopup"
              @keydown.escape.prevent="closePopup"
            />
          </div>
          <div class="popup-actions">
            <button class="btn-save" @click="savePopup">
              {{ popup.isAdd ? 'Add' : 'Save' }}
            </button>
            <button
              v-if="!popup.isAdd"
              class="btn-delete"
              @click="doDelete"
            >Delete</button>
            <button class="btn-cancel" @click="closePopup">Cancel</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { EventRow, PendingItem } from '../../api/client.js'
import { useConfirm } from '../../composables/useConfirm.js'
import { useClickOutside } from '../../composables/useClickOutside.js'
import { fmtTime } from '../../utils/time.js'
import EditIcon from './EditIcon.vue'
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

// ─── Draft ───────────────────────────────────────────────────────────────────

const draftActive = ref(false)

function startDraft() {
  draftActive.value = true
}

function commitDraft(hhmm: string) {
  draftActive.value = false
  emit('add-event', { timestamp: `${props.date} ${hhmm}:00` })
}

// ─── Edit popup ──────────────────────────────────────────────────────────────

interface PopupState {
  row: EffectiveRow
  field: 'clock_in' | 'clock_out'
  x: number
  y: number
  isAdd: boolean
  currentTs: string
}

const popup = ref<PopupState | null>(null)
const popupValue = ref('')
const popupInputEl = ref<HTMLInputElement | null>(null)
const popupEl = ref<HTMLElement | null>(null)

const { confirm } = useConfirm()
useClickOutside(popupEl, closePopup)

function openPopup(row: EffectiveRow, field: 'clock_in' | 'clock_out', event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ts = field === 'clock_in' ? row.original.clock_in : row.original.clock_out
  const isAdd = !ts || (row.original.incomplete && field === 'clock_out')

  popup.value = { row, field, x: rect.left, y: rect.bottom + 6, isAdd, currentTs: ts ?? '' }
  popupValue.value = ts ? ts.slice(11, 16) : ''

  nextTick(() => popupInputEl.value?.focus())
}

function closePopup() {
  popup.value = null
}

function savePopup() {
  if (!popup.value || !popupValue.value) return
  const { row, field, isAdd, currentTs } = popup.value

  const date = field === 'clock_in'
    ? row.original.clock_in.slice(0, 10)
    : (row.original.clock_out?.slice(0, 10) ?? row.original.clock_in.slice(0, 10))
  const newTs = `${date} ${popupValue.value}:00`

  closePopup()

  if (isAdd) {
    emit('add-event', { timestamp: newTs })
    return
  }

  if (newTs === currentTs) return

  const pending = pendingFor(row.original, field)
  if (pending) {
    emit('edit-cell-replace-pending', { pendingId: pending.id, oldTimestamp: currentTs, newTimestamp: newTs })
  } else {
    emit('edit-cell', { oldTimestamp: currentTs, newTimestamp: newTs })
  }
}

async function doDelete() {
  if (!popup.value) return
  const { row, field } = popup.value
  const ts = field === 'clock_in' ? row.original.clock_in : row.original.clock_out!
  closePopup()
  const ok = await confirm(`Delete the session entry at ${fmtTime(ts)}?`)
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
  grid-template-columns: 118px 130px 130px 78px;
  align-items: center;
  border-bottom: 1px solid $border-light;
  width: fit-content;
  margin: 0 auto;

  &:hover .add-session-btn {
    opacity: 0.22;
    pointer-events: auto;
  }
}

.date-cell:hover .add-session-btn {
  opacity: 1;
}

// ─── Cells ───────────────────────────────────────────────────────────────────

.cell {
  display: flex;
  align-items: center;
  padding: .35rem .5rem;
  font-size: .85rem;
  min-height: 30px;
  gap: .3rem;
}

.date-cell {
  justify-content: flex-start;
  padding: .35rem .65rem;
  font-family: $font-ui;
  font-weight: 600;
  font-size: .82rem;
  color: $text;
  letter-spacing: .01em;
  gap: .5rem;
}

.time-group {
  justify-content: center;
  font-family: $font-mono;
  font-size: .84rem;
  font-variant-numeric: tabular-nums;
  border-radius: $radius-sm;
  transition: border-left .1s, padding-left .1s;
  border-left: 2px solid transparent;

  &.clickable {
    cursor: pointer;
  }

  &.clickable:hover {
    background: transparent;
    border-left: 2px solid $accent;
    padding-left: calc(.5rem - 2px);
  }

  .edit-hint {
    opacity: 0;
    color: $text-muted;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: opacity .12s;
  }

  &:hover .edit-hint {
    opacity: 1;
  }
}

.dur-cell {
  justify-content: center;
  font-family: $font-mono;
  font-size: .82rem;
  color: $text-label;
  font-variant-numeric: tabular-nums;
}

.ghost {
  opacity: .45;
  color: $text-muted;
  cursor: default;
}

.draft-input-group {
  justify-content: flex-start;
  padding: .2rem .5rem;
}

// ─── Total row ───────────────────────────────────────────────────────────────

.total-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: .65rem;
  padding: .2rem .5rem;
  border-top: 1px solid $border;
  font-size: .8rem;
  font-weight: 600;
  color: $text-label;
}

.total-label {
  font-family: $font-ui;
  font-weight: 400;
  font-size: .75rem;
  color: $text-muted;
}

.total-dur {
  font-family: $font-mono;
  font-variant-numeric: tabular-nums;
  min-width: 42px;
  text-align: right;
}

// ─── State indicators ─────────────────────────────────────────────────────────

.incomplete-mark {
  color: $danger;
  font-weight: 600;
  font-size: .78rem;
}

.incomplete-dur {
  color: $danger;
  font-weight: 700;
  font-size: .78rem;
}

.pending-time {
  color: $warning;
}

.ghost-placeholder {
  opacity: .4;
  font-size: .78rem;
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

.add-session-btn {
  background: none;
  border: 1px solid $border;
  border-radius: $radius-sm;
  cursor: pointer;
  color: $accent;
  font-size: .75rem;
  font-weight: 600;
  line-height: 1;
  padding: .12rem .38rem;
  opacity: 0;
  pointer-events: none;
  flex-shrink: 0;
  transition: opacity .18s ease, background .1s, border-color .1s;

  &:hover {
    background: $selected-bg;
    border-color: $accent;
    opacity: 1 !important;
  }
}

.cancel-pending-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: $text-muted;
  font-size: 1rem;
  padding: 0 .15rem;
  line-height: 1;
  border-radius: 2px;
  flex-shrink: 0;

  &:hover {
    color: $danger;
  }
}

// ─── Edit popup ──────────────────────────────────────────────────────────────

.edit-popup {
  position: fixed;
  z-index: 9000;
  background: rgba(255, 255, 255, .94);
  backdrop-filter: blur(8px) saturate(1.4);
  -webkit-backdrop-filter: blur(8px) saturate(1.4);
  border: 1px solid rgba(226, 232, 240, .8);
  border-radius: $radius-lg;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, .06),
    0 8px 32px rgba(0, 0, 0, .12);
  padding: .85rem;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: .55rem;
}

.popup-field {
  display: flex;
  flex-direction: column;
  gap: .25rem;
}

.popup-label {
  font-family: $font-ui;
  font-size: .68rem;
  font-weight: 600;
  text-transform: uppercase;
  color: $text-muted;
  letter-spacing: .06em;
}

.popup-time-input {
  border: 1px solid $input-border;
  border-radius: $radius-sm;
  padding: .3rem .45rem;
  font-family: $font-mono;
  font-size: .9rem;
  background: $bg;
  color: $text;
  width: 100%;

  &:focus {
    outline: none;
    border-color: $accent;
    box-shadow: 0 0 0 2px #{$accent}22;
  }
}

.popup-actions {
  display: flex;
  gap: .35rem;

  button {
    flex: 1;
    padding: .28rem .45rem;
    border-radius: $radius-sm;
    font-family: $font-ui;
    font-size: .77rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background .1s;
  }
}

.btn-save {
  background: $accent;
  color: #fff;
  border-color: $accent-dark;
  &:hover { background: $accent-dark; }
}

.btn-delete {
  background: $danger;
  color: #fff;
  border-color: $danger-dark;
  &:hover { background: $danger-dark; }
}

.btn-cancel {
  background: none;
  color: $text-muted;
  border-color: $border;
  &:hover { background: $border-light; }
}

// ─── Popup transition ─────────────────────────────────────────────────────────

.popup-enter-active {
  transition: opacity .14s ease, transform .14s cubic-bezier(.22, .68, 0, 1.2);
}
.popup-leave-active {
  transition: opacity .1s ease, transform .1s ease;
}
.popup-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(.97);
}
.popup-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(.98);
}
</style>
