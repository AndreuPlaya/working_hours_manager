<template>
  <div class="editor-layout">
    <header>
      <h1>Working Hours</h1>
      <RouterLink v-if="config?.is_admin" to="/admin" class="hdr-icon" title="Admin">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </RouterLink>
      <button class="hdr-icon" title="Change password" @click="showPasswordModal = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
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
            <div class="toolbar-actions">
              <button class="btn btn-primary" @click="showAddModal = true">+ Add session</button>
              <button v-if="config?.is_admin && selectedRows.length > 0" class="btn btn-danger" @click="bulkDelete">
                Delete ({{ selectedRows.length }})
              </button>
              <button class="btn btn-secondary" @click="sortAsc = !sortAsc">
                {{ sortAsc ? '↑ Oldest first' : '↓ Newest first' }}
              </button>
              <RouterLink v-if="reportUrl" :to="reportUrl" class="btn btn-secondary" target="_blank">
                View report
              </RouterLink>
            </div>
          </div>

          <!-- Session table -->
          <SessionTable
            :rows="sortedRows"
            :pending-items="myPending"
            :is-admin="config?.is_admin ?? false"
            :selected-rows="selectedRows"
            @toggle-select="toggleSelect"
            @select-all="toggleSelectAll"
            @edit-cell="onEditCell"
            @delete-row="onDeleteRow"
          />
        </template>
      </div>
    </div>

    <!-- Modals -->
    <AddSessionModal
      v-if="showAddModal"
      :emp-id="selectedEmpId"
      :name="selectedName"
      :dept="selectedDept"
      @close="showAddModal = false"
      @saved="onAddSaved"
    />
    <ChangePasswordModal
      v-if="showPasswordModal"
      @close="showPasswordModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../api/client.js'
import type { Config, EventRow, PendingItem, Profile } from '../api/client.js'
import { useToast } from '../composables/useToast.js'
import EmployeeSidebar from '../components/editor/EmployeeSidebar.vue'
import SessionTable from '../components/editor/SessionTable.vue'
import AddSessionModal from '../components/editor/AddSessionModal.vue'
import ChangePasswordModal from '../components/editor/ChangePasswordModal.vue'

const router = useRouter()
const { toast } = useToast()

const config = ref<Config | null>(null)
const profiles = ref<Record<string, Profile>>({})
const events = ref<Record<string, EventRow[]>>({})
const myReports = ref<{ stem: string; year: number; url: string }[]>([])
const pending = ref<PendingItem[]>([])

const selectedKey = ref<string | null>(null)
const sortAsc = ref(false)
const selectedRows = ref<string[]>([])
const showAddModal = ref(false)
const showPasswordModal = ref(false)

onMounted(async () => {
  const [cfg, profs, evts, reports] = await Promise.all([
    api.config(),
    api.profiles(),
    api.events(),
    api.myReports(),
  ])
  config.value = cfg
  profiles.value = profs
  events.value = evts
  myReports.value = reports

  // For non-admin, auto-select self
  if (!cfg.is_admin && cfg.emp_id) {
    const k = Object.keys(evts).find(k => k.startsWith(cfg.emp_id + '|'))
    selectedKey.value = k ?? null
  }

  pending.value = await api.myPending()
})

// Parse key: "empId|name|dept"
function keyParts(k: string) {
  const [empId, name, dept] = k.split('|')
  return { empId, name, dept }
}

const selectedEmpId = computed(() => selectedKey.value ? keyParts(selectedKey.value).empId : '')
const selectedName = computed(() => selectedKey.value ? keyParts(selectedKey.value).name : '')
const selectedDept = computed(() => selectedKey.value ? keyParts(selectedKey.value).dept : '')

const currentRows = computed<EventRow[]>(() =>
  selectedKey.value ? (events.value[selectedKey.value] ?? []) : []
)

const sortedRows = computed(() =>
  [...currentRows.value].sort((a, b) => {
    const cmp = a.clock_in.localeCompare(b.clock_in)
    return sortAsc.value ? cmp : -cmp
  })
)

const reportUrl = computed(() => {
  if (!myReports.value.length || !selectedEmpId.value) return null
  const r = myReports.value.find(r => String(r.url).includes(`-${selectedEmpId.value}-`))
  return r?.url ?? null
})

const myPending = computed(() =>
  pending.value.filter(p => p.emp_id === selectedEmpId.value)
)

function selectEmployee(key: string) {
  selectedKey.value = key
  selectedRows.value = []
}

function toggleSelect(clockIn: string) {
  const idx = selectedRows.value.indexOf(clockIn)
  if (idx === -1) selectedRows.value.push(clockIn)
  else selectedRows.value.splice(idx, 1)
}

function toggleSelectAll(all: boolean) {
  selectedRows.value = all ? sortedRows.value.map(r => r.clock_in) : []
}

async function onEditCell(payload: { oldTimestamp: string; newTimestamp: string }) {
  const { empId, name, dept } = keyParts(selectedKey.value!)
  try {
    const res = await api.edit({ emp_id: empId, name, dept, old_timestamp: payload.oldTimestamp, new_timestamp: payload.newTimestamp })
    if (res.pending) toast('Submitted for approval.')
    else toast('Saved.')
    events.value = await api.events()
    pending.value = await api.myPending()
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error saving.')
  }
}

async function onDeleteRow(timestamp: string) {
  if (!confirm('Delete this session?')) return
  const { empId, name, dept } = keyParts(selectedKey.value!)
  try {
    await api.delete({ emp_id: empId, name, dept, timestamp })
    events.value = await api.events()
    toast('Deleted.')
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error deleting.')
  }
}

async function bulkDelete() {
  if (!confirm(`Delete ${selectedRows.value.length} session(s)?`)) return
  const { empId, name, dept } = keyParts(selectedKey.value!)
  await api.bulkDelete(selectedRows.value.map(ts => ({ emp_id: empId, name, dept, timestamp: ts })))
  selectedRows.value = []
  events.value = await api.events()
  toast('Deleted.')
}

async function onAddSaved() {
  showAddModal.value = false
  events.value = await api.events()
  pending.value = await api.myPending()
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
  .toolbar-name { font-weight: 600; flex: 1; }
  .toolbar-actions { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
  a.btn { text-decoration: none; display: inline-flex; align-items: center; }
}

.empty-state {
  display: flex; align-items: center; justify-content: center;
  flex: 1; color: $text-muted; font-size: .875rem;
}
</style>
