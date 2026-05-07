<template>
  <div class="panel">
    <div v-if="loading" class="muted">Loading…</div>
    <template v-else>
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>New password</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="adm in admins" :key="adm.username">
            <td>{{ adm.username }}</td>
            <td>
              <input type="password" v-model="passwords[adm.username]" placeholder="New password" />
            </td>
            <td class="actions">
              <button class="btn btn-primary sm" @click="updatePassword(adm.username)">Save</button>
              <button
                v-if="adm.username !== 'admin'"
                class="btn btn-danger sm"
                @click="deleteAdmin(adm.username)"
              >Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="add-section">
        <h3>Add admin</h3>
        <div class="add-row">
          <input v-model="newUsername" placeholder="Username" />
          <input v-model="newPassword" type="password" placeholder="Password" />
          <button class="btn btn-primary" @click="createAdmin">Add</button>
        </div>
        <p v-if="addError" class="error">{{ addError }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import type { AdminAccount } from '../../api/client.js'
import { useAsyncOp } from '../../composables/useAsyncOp.js'
import { useToast } from '../../composables/useToast.js'
import { useConfirm } from '../../composables/useConfirm.js'

const { loading, run } = useAsyncOp()
const { toast } = useToast()
const { confirm } = useConfirm()
const admins = ref<AdminAccount[]>([])
const passwords = reactive<Record<string, string>>({})
const newUsername = ref('')
const newPassword = ref('')
const addError = ref('')

async function load() {
  admins.value = await api.admin.admins()
  for (const a of admins.value) passwords[a.username] ??= ''
}

onMounted(() => run(load))

async function updatePassword(username: string) {
  await run(async () => {
    await api.admin.updateAdmin(username, passwords[username])
    passwords[username] = ''
    toast('Password updated.')
  })
}

async function deleteAdmin(username: string) {
  if (!await confirm(`Delete admin "${username}"?`)) return
  await run(async () => {
    await api.admin.deleteAdmin(username)
    await load()
    toast('Deleted.')
  })
}

async function createAdmin() {
  addError.value = ''
  try {
    await api.admin.createAdmin(newUsername.value.trim(), newPassword.value)
    newUsername.value = ''
    newPassword.value = ''
    await load()
    toast('Admin created.')
  } catch (e) {
    addError.value = e instanceof ApiError ? e.message : 'Error.'
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.panel {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: .85rem;
  max-width: 600px;

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

.actions {
  display: flex;
  gap: .4rem;
}

.btn.sm {
  padding: .25rem .55rem;
  font-size: .78rem;
}

.add-section {
  max-width: 500px;

  h3 {
    font-size: .875rem;
    font-weight: 600;
    margin-bottom: .75rem;
  }
}

.add-row {
  display: flex;
  gap: .5rem;

  input {
    flex: 1;
  }
}

.error {
  font-size: .82rem;
  color: $danger;
  margin-top: .5rem;
}

.muted {
  color: $text-muted;
  font-size: .875rem;
}
</style>
