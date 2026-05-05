<template>
  <div class="panel">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!items.length" class="muted">No pending corrections.</div>
    <table v-else>
      <thead>
        <tr><th>Employee</th><th>Action</th><th>From</th><th>To</th><th>Submitted by</th><th>At</th><th></th></tr>
      </thead>
      <tbody>
        <template v-for="item in items" :key="item.id">
          <tr>
            <td>{{ item.name }}</td>
            <td><span class="badge" :class="item.action === 'ADD' ? 'badge-add' : 'badge-edit'">{{ item.action }}</span></td>
            <td>{{ item.action === 'EDIT' ? item.timestamp.slice(11, 19) : '—' }}</td>
            <td>{{ (item.new_timestamp ?? item.timestamp).slice(11, 19) }}</td>
            <td>{{ item.submitted_by }}</td>
            <td>{{ item.submitted_at.replace('T', ' ') }}</td>
            <td class="row-actions">
              <button class="btn btn-secondary sm" @click="togglePreview(item.id)">Details</button>
              <button class="btn btn-primary sm" @click="approve(item.id)">Approve</button>
              <button class="btn btn-danger sm" @click="reject(item.id)">Reject</button>
            </td>
          </tr>
          <tr v-if="openPreviews.has(item.id)" class="preview-row">
            <td colspan="7">
              <div v-if="!previews[item.id]" class="muted">Loading preview…</div>
              <div v-else class="preview-grid">
                <div>
                  <h4>Before</h4>
                  <PreviewTable :rows="previews[item.id]!.before.rows" :total="previews[item.id]!.before.month_total" />
                </div>
                <div>
                  <h4>After</h4>
                  <PreviewTable :rows="previews[item.id]!.after.rows" :total="previews[item.id]!.after.month_total" />
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
import { onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import type { PendingItem, PreviewResult } from '../../api/client.js'
import { useToast } from '../../composables/useToast.js'

const emit = defineEmits<{ count: [n: number] }>()
const { toast } = useToast()

const items = ref<PendingItem[]>([])
const loading = ref(true)
const openPreviews = reactive(new Set<string>())
const previews = reactive<Record<string, PreviewResult | null>>({})

async function load() {
  items.value = await api.admin.pending()
  emit('count', items.value.length)
}

onMounted(async () => { try { await load() } finally { loading.value = false } })

async function togglePreview(id: string) {
  if (openPreviews.has(id)) { openPreviews.delete(id); return }
  openPreviews.add(id)
  if (!previews[id]) {
    try {
      const res = await api.admin.pendingPreview(id)
      previews[id] = res
    } catch { previews[id] = null }
  }
}

async function approve(id: string) {
  try { await api.admin.approvePending(id); await load(); openPreviews.delete(id); toast('Approved.') }
  catch (e) { toast(e instanceof ApiError ? e.message : 'Error.') }
}

async function reject(id: string) {
  if (!confirm('Reject this correction?')) return
  try { await api.admin.rejectPending(id); await load(); openPreviews.delete(id); toast('Rejected.') }
  catch (e) { toast(e instanceof ApiError ? e.message : 'Error.') }
}

// Inline preview table component
const PreviewTable = {
  props: ['rows', 'total'],
  template: `
    <table class="prev-table">
      <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Duration</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i" :class="{ subtotal: r.is_subtotal, affected: r.affected }">
          <td>{{ r.date_label }}</td><td>{{ r.clock_in }}</td><td>{{ r.clock_out }}</td><td>{{ r.duration }}</td>
        </tr>
      </tbody>
      <tfoot><tr><td colspan="3">Month total</td><td>{{ total }}</td></tr></tfoot>
    </table>
  `,
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;
.panel { padding: 1.25rem; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .83rem;
  th, td { padding: .4rem .5rem; text-align: left; border-bottom: 1px solid $border; }
  th { font-weight: 600; color: $text-muted; font-size: .72rem; text-transform: uppercase; }
}
.row-actions { display: flex; gap: .4rem; white-space: nowrap; }
.btn.sm { padding: .25rem .55rem; font-size: .78rem; }
.preview-row td { background: $border-light; padding: 1rem; }
.preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;
  h4 { font-size: .8rem; font-weight: 600; margin-bottom: .5rem; color: $text-muted; text-transform: uppercase; }
}
:deep(.prev-table) { width: 100%; border-collapse: collapse; font-size: .78rem;
  th, td { padding: .3rem .4rem; border-bottom: 1px solid $border; }
  th { font-weight: 600; color: $text-muted; font-size: .7rem; text-transform: uppercase; }
  tr.subtotal td { font-weight: 600; }
  tr.affected td { background: #fef9c3; }
  tfoot td { font-weight: 600; border-top: 1px solid $border; }
}
.muted { color: $text-muted; font-size: .875rem; }
</style>
