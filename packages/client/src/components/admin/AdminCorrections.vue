<template>
  <div class="panel">
    <div class="filters">
      <input v-model="filterEmp" placeholder="Employee…" />
      <select v-model="filterStatus">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
      </select>
      <input type="text" v-model="filterFrom" placeholder="YYYY/MM/DD" class="date-filter" />
      <input type="text" v-model="filterTo" placeholder="YYYY/MM/DD" class="date-filter" />
      <button class="btn btn-secondary sm" @click="clearFilters">Clear</button>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!filteredItems.length" class="muted">No corrections found.</div>
    <table v-else>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Action</th>
          <th>Change</th>
          <th>Status</th>
          <th>By</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="item in filteredItems" :key="item.id">
          <tr>
            <td>{{ item.name }}</td>
            <td>
              <span class="badge" :class="badgeClass(item.action)">{{ item.action }}</span>
            </td>
            <td class="change-cell">
              <template v-if="item.action === 'EDIT'">
                <span class="ts">{{ item.timestamp.slice(0, 19) }}</span>
                <span class="arrow">→</span>
                <span class="ts">{{ item.new_timestamp!.slice(0, 19) }}</span>
              </template>
              <template v-else>
                <span class="ts">{{ item.timestamp.slice(0, 19) }}</span>
              </template>
            </td>
            <td>
              <span class="status-badge" :class="item.status === 'pending' ? 'status-pending' : 'status-approved'">
                {{ item.status === 'pending' ? 'Pending' : 'Approved' }}
              </span>
            </td>
            <td>{{ item.status === 'pending' ? item.submitted_by : item.applied_by }}</td>
            <td>{{ sortDate(item).replace('T', ' ').slice(0, 19) }}</td>
            <td class="row-actions">
              <template v-if="item.status === 'pending'">
                <button class="btn btn-secondary sm" @click="togglePreview(item.id)">Details</button>
                <button class="btn btn-primary sm" @click="approve(item.id)">Approve</button>
                <button class="btn btn-danger sm" @click="reject(item.id)">Reject</button>
              </template>
              <template v-else>
                <button class="btn btn-secondary sm" @click="revert(item.id)">Revert</button>
              </template>
            </td>
          </tr>
          <tr v-if="item.status === 'pending' && openPreviews.has(item.id)" class="preview-row">
            <td colspan="7">
              <div v-if="!previews[item.id]" class="muted">Loading preview…</div>
              <div v-else class="preview-grid">
                <div>
                  <h4>Before</h4>
                  <PreviewTable
                    :rows="previews[item.id]!.before.rows as any"
                    :total="previews[item.id]!.before.month_total"
                  />
                </div>
                <div>
                  <h4>After</h4>
                  <PreviewTable
                    :rows="previews[item.id]!.after.rows as any"
                    :total="previews[item.id]!.after.month_total"
                  />
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import type { CorrectionItem, PreviewResult } from '../../api/client.js'
import { useToast } from '../../composables/useToast.js'
import { useConfirm } from '../../composables/useConfirm.js'
import PreviewTable from './PreviewTable.vue'

const { confirm } = useConfirm()
const { toast } = useToast()

const emit = defineEmits<{ count: [n: number] }>()

const allItems = ref<CorrectionItem[]>([])
const loading = ref(true)

const filterEmp = ref('')
const filterStatus = ref<'' | 'pending' | 'approved'>('')
const filterFrom = ref('')
const filterTo = ref('')

const openPreviews = reactive(new Set<string>())
const previews = reactive<Record<string, PreviewResult | null>>({})

function sortDate(item: CorrectionItem): string {
  return item.status === 'pending' ? (item.submitted_at ?? '') : (item.applied_at ?? '')
}

async function load() {
  const [pending, history] = await Promise.all([api.admin.pending(), api.admin.history()])
  allItems.value = [
    ...pending.map(p => ({ ...p, status: 'pending' as const })),
    ...history.map(h => ({ ...h, status: 'approved' as const })),
  ]
  emit('count', pending.length)
}

onMounted(async () => {
  try { await load() } finally { loading.value = false }
})

const normalizeDate = (s: string) => s.replace(/\//g, '-')

const filteredItems = computed(() =>
  allItems.value
    .filter(item => {
      if (filterStatus.value && item.status !== filterStatus.value) return false
      if (filterEmp.value && !item.name.toLowerCase().includes(filterEmp.value.toLowerCase())) return false
      const d = (item.timestamp ?? '').slice(0, 10)
      if (filterFrom.value && d < normalizeDate(filterFrom.value)) return false
      if (filterTo.value && d > normalizeDate(filterTo.value)) return false
      return true
    })
    .sort((a, b) => sortDate(b).localeCompare(sortDate(a)))
)

function clearFilters() {
  filterEmp.value = ''
  filterStatus.value = ''
  filterFrom.value = ''
  filterTo.value = ''
}

function badgeClass(action: string) {
  if (action === 'ADD') return 'badge-add'
  if (action === 'DEL') return 'badge-del'
  return 'badge-edit'
}

async function togglePreview(id: string) {
  if (openPreviews.has(id)) { openPreviews.delete(id); return }
  openPreviews.add(id)
  if (!previews[id]) {
    try { previews[id] = await api.admin.pendingPreview(id) }
    catch { previews[id] = null }
  }
}

async function approve(id: string) {
  try {
    await api.admin.approvePending(id)
    openPreviews.delete(id)
    delete previews[id]
    await load()
    toast('Approved.')
  } catch (e) { toast(e instanceof ApiError ? e.message : 'Error.') }
}

async function reject(id: string) {
  if (!await confirm('Reject this correction?')) return
  try {
    await api.admin.rejectPending(id)
    openPreviews.delete(id)
    delete previews[id]
    await load()
    toast('Rejected.')
  } catch (e) { toast(e instanceof ApiError ? e.message : 'Error.') }
}

async function revert(id: string) {
  if (!await confirm('Revert this correction? The change will be permanently removed.')) return
  try {
    await api.admin.revertCorrection(id)
    await load()
    toast('Correction reverted.')
  } catch (e) { toast(e instanceof ApiError ? e.message : 'Error.') }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.panel {
  padding: 1.25rem;
  overflow-x: auto;
}

.filters {
  display: flex;
  gap: .5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  align-items: center;

  input,
  select {
    width: auto;
    min-width: 120px;
  }

  input.date-filter {
    width: 110px;
    min-width: unset;
    font-size: .83rem;
  }
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: .83rem;

  th,
  td {
    padding: .4rem .5rem;
    text-align: left;
    border-bottom: 1px solid $border;
  }

  th {
    font-weight: 600;
    color: $text-muted;
    font-size: .72rem;
    text-transform: uppercase;
  }
}

.change-cell {
  white-space: nowrap;
}

.ts {
  font-variant-numeric: tabular-nums;
  font-size: .8rem;
}

.arrow {
  margin: 0 .3rem;
  color: $text-muted;
}

.status-badge {
  display: inline-block;
  padding: .15rem .45rem;
  border-radius: .25rem;
  font-size: .72rem;
  font-weight: 600;

  &.status-pending {
    background: #fef3c7;
    color: #92400e;
  }

  &.status-approved {
    background: #f1f5f9;
    color: #475569;
  }
}

.row-actions {
  display: flex;
  gap: .4rem;
  white-space: nowrap;
}

.btn.sm {
  padding: .25rem .55rem;
  font-size: .78rem;
}

.preview-row td {
  background: $border-light;
  padding: 1rem;
}

.preview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  h4 {
    font-size: .8rem;
    font-weight: 600;
    margin-bottom: .5rem;
    color: $text-muted;
    text-transform: uppercase;
  }
}

.muted {
  color: $text-muted;
  font-size: .875rem;
}
</style>
