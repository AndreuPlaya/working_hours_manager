<template>
  <div class="admin-layout">
    <header>
      <h1>Admin</h1>
      <RouterLink to="/" class="hdr-icon" title="Editor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
      </RouterLink>
      <button class="hdr-icon" title="Logout" @click="logout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/></svg>
      </button>
    </header>

    <div class="tabs">
      <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
        {{ tab.label }}
        <span v-if="tab.id === 'pending' && pendingCount > 0" class="badge badge-count">{{ pendingCount }}</span>
      </button>
    </div>

    <div class="tab-content">
      <AdminEmployees v-show="activeTab === 'employees'" />
      <AdminAdmins v-show="activeTab === 'admins'" />
      <AdminDataFiles v-show="activeTab === 'files'" />
      <AdminPending v-show="activeTab === 'pending'" @count="pendingCount = $event" />
      <AdminConfig v-show="activeTab === 'config'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import AdminEmployees from '../components/admin/AdminEmployees.vue'
import AdminAdmins from '../components/admin/AdminAdmins.vue'
import AdminDataFiles from '../components/admin/AdminDataFiles.vue'
import AdminPending from '../components/admin/AdminPending.vue'
import AdminConfig from '../components/admin/AdminConfig.vue'
import { useAppConfig } from '../composables/useAppConfig.js'

useAppConfig()

const router = useRouter()
const activeTab = ref('employees')
const pendingCount = ref(0)

const tabs = [
  { id: 'employees', label: 'Employees' },
  { id: 'admins', label: 'Admins' },
  { id: 'files', label: 'Data Files' },
  { id: 'pending', label: 'Pending' },
  { id: 'config', label: 'Config' },
]

async function logout() {
  await api.auth.logout()
  router.push('/login')
}
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.admin-layout { display: flex; flex-direction: column; min-height: 100vh; }

.tabs {
  display: flex; border-bottom: 1px solid $border; padding: 0 1rem; background: $card;
}

.tab-btn {
  padding: .75rem 1rem; font-size: .875rem; font-weight: 500; cursor: pointer;
  border: none; background: none; color: $text-muted; border-bottom: 2px solid transparent;
  display: flex; align-items: center; gap: .4rem; margin-bottom: -1px;
  &.active { color: $accent; border-bottom-color: $accent; }
  &:hover:not(.active) { color: $text; }
}

.tab-content { flex: 1; overflow: auto; }
</style>
