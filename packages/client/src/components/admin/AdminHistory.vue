<template>
  <div class="panel">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!items.length" class="muted">No correction history yet.</div>
    <table v-else>
      <thead>
        <tr><th>Employee</th><th>Action</th><th>Change</th><th>Applied by</th><th>At</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id" :class="{ undone: item.undone }">
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
          <td>{{ item.applied_by }}</td>
          <td>{{ item.applied_at.replace('T', ' ') }}</td>
          <td class="row-actions">
            <button
              class="btn btn-secondary sm"
              :disabled="item.undone"
              :title="item.undone ? 'Already undone' : 'Undo this correction'"
              @click="undo(item.id)"
            >Undo</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import type { HistoryItem } from '../../api/client.js'
import { useToast } from '../../composables/useToast.js'

const { toast } = useToast()
const items = ref<HistoryItem[]>([])
const loading = ref(true)

async function load() {
  items.value = await api.admin.history()
}

onMounted(async () => { try { await load() } finally { loading.value = false } })

function badgeClass(action: string) {
  if (action === 'ADD') return 'badge-add'
  if (action === 'DEL') return 'badge-del'
  return 'badge-edit'
}

async function undo(id: string) {
  if (!confirm('Undo this correction? The inverse correction will be applied.')) return
  try {
    await api.admin.undoCorrection(id)
    await load()
    toast('Correction undone.')
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error.')
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.panel { padding: 1.25rem; overflow-x: auto; }

table {
  width: 100%; border-collapse: collapse; font-size: .83rem;
  th, td { padding: .4rem .5rem; text-align: left; border-bottom: 1px solid $border; }
  th { font-weight: 600; color: $text-muted; font-size: .72rem; text-transform: uppercase; }
}

tr.undone td { opacity: .45; }

.change-cell { white-space: nowrap; }
.ts { font-variant-numeric: tabular-nums; font-size: .8rem; }
.arrow { margin: 0 .3rem; color: $text-muted; }

.row-actions { display: flex; gap: .4rem; white-space: nowrap; }
.btn.sm { padding: .25rem .55rem; font-size: .78rem; }
.btn:disabled { opacity: .4; cursor: default; }

.muted { color: $text-muted; font-size: .875rem; }
</style>
