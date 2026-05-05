<template>
  <div class="panel">
    <div v-if="loading" class="muted">Loading…</div>
    <table v-else>
      <thead>
        <tr><th>ID</th><th>Name (raw)</th><th>Alias</th><th>Full name</th><th>Username</th><th>Password</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="emp in employees" :key="emp.emp_id">
          <td>{{ emp.emp_id }}</td>
          <td>{{ emp.raw_name }}</td>
          <td><input v-model="edits[emp.emp_id].alias" /></td>
          <td><input v-model="edits[emp.emp_id].full_name" /></td>
          <td><input v-model="edits[emp.emp_id].username" /></td>
          <td>
            <input v-if="showPw[emp.emp_id]" type="password" v-model="edits[emp.emp_id].password" placeholder="New password" />
            <button v-else class="btn btn-secondary sm" @click="showPw[emp.emp_id] = true">
              {{ emp.has_password ? 'Change' : 'Set' }}
            </button>
          </td>
          <td>
            <select v-model="edits[emp.emp_id].enabled">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </td>
          <td>
            <button class="btn btn-primary sm" @click="save(emp.emp_id)">Save</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import type { Employee } from '../../api/client.js'
import { useToast } from '../../composables/useToast.js'

const { toast } = useToast()
const employees = ref<Employee[]>([])
const loading = ref(true)
const edits = reactive<Record<string, { alias: string; full_name: string; username: string; password: string; enabled: boolean }>>({})
const showPw = reactive<Record<string, boolean>>({})

onMounted(async () => {
  try {
    employees.value = await api.admin.employees()
    for (const emp of employees.value) {
      edits[emp.emp_id] = { alias: emp.alias, full_name: emp.full_name, username: emp.username, password: '', enabled: emp.enabled }
      showPw[emp.emp_id] = false
    }
  } finally { loading.value = false }
})

async function save(empId: string) {
  try {
    const d = edits[empId]
    await api.admin.updateEmployee(empId, { alias: d.alias, full_name: d.full_name, username: d.username, enabled: d.enabled, ...(d.password ? { password: d.password } : {}) })
    d.password = ''
    showPw[empId] = false
    toast('Saved.')
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error saving.')
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;
.panel { padding: 1.25rem; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .83rem;
  th, td { padding: .4rem .5rem; text-align: left; border-bottom: 1px solid $border; }
  th { font-weight: 600; color: $text-muted; font-size: .72rem; text-transform: uppercase; }
}
input, select { font-size: .83rem; }
.btn.sm { padding: .25rem .55rem; font-size: .78rem; }
.muted { color: $text-muted; font-size: .875rem; }
</style>
