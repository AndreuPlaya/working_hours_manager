<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-if="isAdmin">
            <input type="checkbox" :checked="allSelected" @change="$emit('select-all', !allSelected)" />
          </th>
          <th>Date</th>
          <th>Clock In</th>
          <th>Clock Out</th>
          <th>Duration</th>
          <th v-if="isAdmin"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.clock_in" :class="{ incomplete: row.incomplete, pending: isPending(row) }">
          <td v-if="isAdmin">
            <input v-if="!row.incomplete" type="checkbox"
              :checked="selectedRows.includes(row.clock_in)"
              @change="$emit('toggle-select', row.clock_in)" />
          </td>
          <td>{{ row.date }}</td>
          <td class="time-cell" @click="startEdit(row, 'clock_in')">
            <template v-if="editing?.key === row.clock_in + ':in'">
              <input type="datetime-local" :value="toLocalInput(row.clock_in)"
                @change="e => commitEdit(row, 'clock_in', (e.target as HTMLInputElement).value)"
                @keydown.enter.prevent="e => commitEdit(row, 'clock_in', (e.target as HTMLInputElement).value)"
                @keydown.escape="editing = null"
                @blur="e => commitEdit(row, 'clock_in', (e.target as HTMLInputElement).value)"
                ref="editInput" />
            </template>
            <template v-else>
              <span :class="{ strikethrough: isPending(row) }">{{ fmtDisplay(row.clock_in) }}</span>
              <span v-if="isPendingField(row, 'clock_in')" class="pending-val">{{ pendingNew(row, 'clock_in') }} <span class="badge badge-pending">pending</span></span>
            </template>
          </td>
          <td class="time-cell" @click="!row.incomplete ? startEdit(row, 'clock_out') : null">
            <template v-if="editing?.key === row.clock_in + ':out'">
              <input type="datetime-local" :value="row.clock_out ? toLocalInput(row.clock_out) : ''"
                @change="e => commitEdit(row, 'clock_out', (e.target as HTMLInputElement).value)"
                @keydown.enter.prevent="e => commitEdit(row, 'clock_out', (e.target as HTMLInputElement).value)"
                @keydown.escape="editing = null"
                @blur="e => commitEdit(row, 'clock_out', (e.target as HTMLInputElement).value)" />
            </template>
            <template v-else>
              <span v-if="row.incomplete" class="incomplete-mark">?</span>
              <span v-else :class="{ strikethrough: isPending(row) }">{{ fmtDisplay(row.clock_out!) }}</span>
              <span v-if="isPendingField(row, 'clock_out')" class="pending-val">{{ pendingNew(row, 'clock_out') }} <span class="badge badge-pending">pending</span></span>
            </template>
          </td>
          <td>{{ row.duration ?? '—' }}</td>
          <td v-if="isAdmin">
            <button v-if="!row.incomplete" class="del-btn" title="Delete" @click.stop="$emit('delete-row', row.clock_in)">✕</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="isAdmin ? 6 : 4" class="empty">No sessions found.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import type { EventRow, PendingItem } from '../../api/client.js'

const props = defineProps<{
  rows: EventRow[]
  pendingItems: PendingItem[]
  isAdmin: boolean
  selectedRows: string[]
}>()

const emit = defineEmits<{
  'toggle-select': [clockIn: string]
  'select-all': [all: boolean]
  'edit-cell': [payload: { oldTimestamp: string; newTimestamp: string }]
  'delete-row': [timestamp: string]
}>()

const editing = ref<{ key: string } | null>(null)

const allSelected = computed(() =>
  props.rows.length > 0 && props.rows.every(r => props.selectedRows.includes(r.clock_in))
)

function toLocalInput(ts: string): string {
  return ts.replace(' ', 'T').slice(0, 16)
}

function fmtDisplay(ts: string): string {
  return ts.slice(11, 19)
}

function startEdit(row: EventRow, field: 'clock_in' | 'clock_out') {
  if (!props.isAdmin && !isPendingField(row, field) === false) return
  editing.value = { key: row.clock_in + (field === 'clock_in' ? ':in' : ':out') }
  nextTick(() => {
    const el = document.querySelector('.table-wrap input[type="datetime-local"]') as HTMLInputElement | null
    el?.focus()
  })
}

function commitEdit(row: EventRow, field: 'clock_in' | 'clock_out', value: string) {
  if (!editing.value) return
  editing.value = null
  const newTs = value.replace('T', ' ') + ':00'
  const oldTs = field === 'clock_in' ? row.clock_in : row.clock_out!
  if (newTs === oldTs) return
  emit('edit-cell', { oldTimestamp: oldTs, newTimestamp: newTs })
}

function isPending(row: EventRow): boolean {
  return props.pendingItems.some(p => p.timestamp === row.clock_in || p.timestamp === row.clock_out)
}

function isPendingField(row: EventRow, field: 'clock_in' | 'clock_out'): boolean {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  return props.pendingItems.some(p => p.timestamp === ts || p.new_timestamp === ts)
}

function pendingNew(row: EventRow, field: 'clock_in' | 'clock_out'): string {
  const ts = field === 'clock_in' ? row.clock_in : row.clock_out
  const item = props.pendingItems.find(p => p.timestamp === ts)
  return item?.new_timestamp?.slice(11, 19) ?? ''
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.table-wrap { flex: 1; overflow: auto; }

table {
  width: 100%; border-collapse: collapse; font-size: .85rem;
  th, td { padding: .45rem .65rem; text-align: left; border-bottom: 1px solid $border-light; }
  th { font-weight: 600; color: $text-muted; font-size: .75rem; text-transform: uppercase; background: $bg; position: sticky; top: 0; }
  tr:hover td { background: $border-light; }
  tr.incomplete td { color: $warning; }
  tr.pending td { background: #fffbeb; }
}

.time-cell { cursor: pointer; min-width: 120px; }

input[type="datetime-local"] {
  font-size: .8rem; padding: .2rem .4rem; width: auto; min-width: 160px;
}

.incomplete-mark { color: $warning; font-weight: 600; }

.pending-val { font-size: .78rem; margin-left: .4rem; color: $warning; }

.strikethrough { text-decoration: line-through; opacity: .6; }

.del-btn {
  background: none; border: none; cursor: pointer; color: $danger; font-size: .85rem; padding: .1rem .3rem;
  opacity: 0; transition: opacity .15s;
  tr:hover & { opacity: 1; }
}

.empty { text-align: center; color: $text-muted; padding: 2rem; }
</style>
