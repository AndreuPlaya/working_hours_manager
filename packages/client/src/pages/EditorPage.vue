<template>
  <div class="editor-layout">
    <header>
      <h1>Working Hours</h1>
      <RouterLink v-if="config?.is_admin" to="/admin" class="hdr-icon" title="Admin">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </RouterLink>
      <button v-if="config?.emp_id" class="hdr-icon" title="Profile" @click="showProfileModal = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </button>
      <button class="hdr-icon" title="Logout" @click="logout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/></svg>
      </button>
    </header>

    <div class="editor-body">
      <!-- Sidebar: employee list (admin only) -->
      <EmployeeSidebar
        v-if="config?.is_admin"
        :event-keys="Object.keys(events).sort()"
        :profiles="profiles"
        :pending="pending"
        :selected-key="selectedKey"
        @select="selectEmployee"
      />

      <!-- Main panel -->
      <div class="main-panel">
        <div v-if="!selectedKey" class="empty-state">Select an employee to view sessions.</div>
        <template v-else>
          <!-- Toolbar -->
          <div class="toolbar">
            <span class="toolbar-name">{{ selectedName }}</span>
            <div class="month-nav">
              <button class="btn btn-secondary nav-btn" :disabled="minYear !== null && currentYear <= minYear" @click="prevYear">←</button>
              <span class="month-label">{{ currentYear }}</span>
              <button class="btn btn-secondary nav-btn" :disabled="currentYear >= thisYear" @click="nextYear">→</button>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-secondary" title="Print" @click="showPrintModal = true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print
              </button>
            </div>
          </div>

          <!-- Year view: all 12 months scrollable -->
          <div class="year-scroll">
            <MonthView
              v-for="month in visibleMonths"
              :key="`${currentYear}-${month}`"
              :rows="currentRows"
              :pending-items="myPending"
              :year="currentYear"
              :month="month"
              @edit-cell="onEditCell"
              @edit-cell-replace-pending="onEditCellReplacePending"
              @add-event="onAddEvent"
              @delete-event="onDeleteEvent"
              @cancel-pending="onCancelPending"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- Modals -->
    <ProfileModal
      v-if="showProfileModal"
      :initial-full-name="config?.full_name ?? ''"
      :initial-email="config?.email ?? ''"
      :initial-username="config?.username ?? ''"
      @close="showProfileModal = false"
      @saved="onProfileSaved"
    />
    <PrintModal
      v-if="showPrintModal && selectedKey"
      :rows="events[selectedKey] ?? []"
      :year="currentYear"
      :month="currentMonth"
      :employee-name="selectedName"
      @close="showPrintModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../api/client.js'
import type { EventRow } from '../api/client.js'
import { useToast } from '../composables/useToast.js'
import { useEditorData } from '../composables/useEditorData.js'
import EmployeeSidebar from '../components/editor/EmployeeSidebar.vue'
import MonthView from '../components/editor/MonthView.vue'
import ProfileModal from '../components/editor/ProfileModal.vue'
import PrintModal from '../components/editor/PrintModal.vue'
import { useAppConfig } from '../composables/useAppConfig.js'

useAppConfig()

const router = useRouter()
const { toast } = useToast()
const {
  config, profiles, events, pending,
  load, refresh, reloadConfig,
  submitEdit, submitAdd, submitDelete, cancelPending, replacePendingWithEdit,
} = useEditorData()

const selectedKey = ref<string | null>(null)
const showProfileModal = ref(false)
const showPrintModal = ref(false)

const now = new Date()
const currentYear = ref(now.getFullYear())
const currentMonth = now.getMonth() + 1
const thisYear = now.getFullYear()

const minYear = computed(() => {
  if (!currentRows.value.length) return null
  const minTs = currentRows.value.reduce((min, r) => r.clock_in < min ? r.clock_in : min, currentRows.value[0].clock_in)
  return parseInt(minTs.slice(0, 4))
})

const visibleMonths = computed<number[]>(() => {
  const yearPrefix = String(currentYear.value)
  const timestamps = [
    ...currentRows.value.map(r => r.clock_in),
    ...myPending.value.map(p => p.timestamp),
  ].filter(ts => ts.startsWith(yearPrefix))

  if (!timestamps.length) {
    return currentYear.value === thisYear ? [currentMonth] : []
  }

  const months = timestamps.map(ts => parseInt(ts.slice(5, 7)))
  const minMonth = Math.min(...months)
  const maxMonth = currentYear.value === thisYear
    ? Math.max(Math.max(...months), currentMonth)
    : Math.max(...months)

  return Array.from({ length: maxMonth - minMonth + 1 }, (_, i) => minMonth + i)
})

function prevYear() {
  if (minYear.value !== null && currentYear.value <= minYear.value) return
  currentYear.value--
}
function nextYear() {
  if (currentYear.value >= thisYear) return
  currentYear.value++
}

onMounted(async () => {
  const cfg = await load()
  if (!cfg.is_admin && cfg.emp_id) {
    let k = Object.keys(events.value).find(k => k.startsWith(cfg.emp_id + '|'))
    if (!k) {
      const pItem = pending.value.find(p => String(p.emp_id) === String(cfg.emp_id))
      if (pItem) k = `${pItem.emp_id}|${pItem.name}|${pItem.dept}`
    }
    selectedKey.value = k ?? null
  }
})

function keyParts(k: string) {
  const [empId, name, dept] = k.split('|')
  return { empId, name, dept }
}

const selectedParts = computed(() => selectedKey.value ? keyParts(selectedKey.value) : null)
const selectedEmpId = computed(() => selectedParts.value?.empId ?? '')
const selectedName  = computed(() => selectedParts.value?.name  ?? '')

const currentRows = computed<EventRow[]>(() =>
  selectedKey.value ? (events.value[selectedKey.value] ?? []) : []
)

const myPending = computed(() =>
  pending.value.filter(p => String(p.emp_id) === selectedEmpId.value)
)

function selectEmployee(key: string) {
  selectedKey.value = key
}

async function onEditCell(payload: { oldTimestamp: string; newTimestamp: string }) {
  const { empId, name, dept } = selectedParts.value!
  try {
    const res = await submitEdit(empId, name, dept, payload.oldTimestamp, payload.newTimestamp)
    await refresh()
    let onUndo: (() => void) | undefined
    if (res.pending) {
      const p = myPending.value.find(p => p.action === 'EDIT' && p.timestamp === payload.oldTimestamp)
      if (p) onUndo = () => { cancelPending(p.id).then(() => refresh()) }
    } else {
      onUndo = () => onEditCell({ oldTimestamp: payload.newTimestamp, newTimestamp: payload.oldTimestamp })
    }
    toast(res.pending ? 'Submitted for approval.' : 'Saved.', { onUndo })
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error saving.')
  }
}

async function onAddEvent(payload: { timestamp: string }) {
  const { empId, name, dept } = selectedParts.value!
  try {
    const res = await submitAdd(empId, name, dept, payload.timestamp)
    await refresh()
    let onUndo: (() => void) | undefined
    if (res.pending) {
      const p = myPending.value.find(p => p.action === 'ADD' && p.timestamp === payload.timestamp)
      if (p) onUndo = () => { cancelPending(p.id).then(() => refresh()) }
    } else {
      onUndo = () => onDeleteEvent({ timestamp: payload.timestamp })
    }
    toast(res.pending ? 'Submitted for approval.' : 'Saved.', { onUndo })
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error saving.')
  }
}

async function onDeleteEvent(payload: { timestamp: string }) {
  const { empId, name, dept } = selectedParts.value!
  try {
    const res = await submitDelete(empId, name, dept, payload.timestamp)
    await refresh()
    let onUndo: (() => void) | undefined
    if (res.pending) {
      const p = myPending.value.find(p => p.action === 'DEL' && p.timestamp === payload.timestamp)
      if (p) onUndo = () => { cancelPending(p.id).then(() => refresh()) }
    } else {
      onUndo = () => onAddEvent({ timestamp: payload.timestamp })
    }
    toast(res.pending ? 'Submitted for approval.' : 'Deleted.', { onUndo })
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error deleting.')
  }
}

async function onEditCellReplacePending(payload: { pendingId: string; oldTimestamp: string; newTimestamp: string }) {
  const { empId, name, dept } = selectedParts.value!
  try {
    const res = await replacePendingWithEdit(payload.pendingId, empId, name, dept, payload.oldTimestamp, payload.newTimestamp)
    await refresh()
    toast(res.pending ? 'Submitted for approval.' : 'Saved.')
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error saving.')
  }
}

async function onCancelPending(payload: { pendingId: string }) {
  try {
    await cancelPending(payload.pendingId)
    await refresh()
    toast('Correction cancelled.')
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error cancelling.')
  }
}

async function onProfileSaved() {
  showProfileModal.value = false
  await reloadConfig()
}

async function logout() {
  await api.auth.logout()
  router.push('/login')
}
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.editor-layout { display: flex; flex-direction: column; height: 100vh; }

.editor-body { display: flex; flex: 1; overflow: hidden; }

.main-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.toolbar {
  display: flex; align-items: center; gap: .75rem; padding: .75rem 1rem;
  border-bottom: 1px solid $border; flex-wrap: wrap;
  .toolbar-name { font-weight: 600; min-width: 8rem; }
  .toolbar-actions { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-left: auto; }
  a.btn { text-decoration: none; display: inline-flex; align-items: center; }
}

.month-nav {
  display: flex; align-items: center; gap: .5rem;
  .month-label { font-size: .9rem; font-weight: 500; min-width: 130px; text-align: center; }
}

.nav-btn { padding: .25rem .6rem; font-size: .9rem; &:disabled { opacity: .35; cursor: default; } }

.year-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.empty-state {
  display: flex; align-items: center; justify-content: center;
  flex: 1; color: $text-muted; font-size: .875rem;
}
</style>
