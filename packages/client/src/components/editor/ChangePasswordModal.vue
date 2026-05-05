<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Change Password</h2>
      <div class="field">
        <label>Current password</label>
        <input type="password" v-model="current" autocomplete="current-password" />
      </div>
      <div class="field">
        <label>New password</label>
        <input type="password" v-model="newPw" autocomplete="new-password" />
      </div>
      <div class="field">
        <label>Confirm new password</label>
        <input type="password" v-model="confirm" autocomplete="new-password" />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="loading" @click="save">
          {{ loading ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import { useToast } from '../../composables/useToast.js'

const emit = defineEmits<{ close: [] }>()
const { toast } = useToast()

const current = ref('')
const newPw = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function save() {
  if (newPw.value !== confirm.value) { error.value = 'Passwords do not match.'; return }
  error.value = ''
  loading.value = true
  try {
    await api.changePassword(current.value, newPw.value)
    toast('Password changed.')
    emit('close')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Error changing password.'
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;
.field { display: flex; flex-direction: column; gap: .25rem; }
.error { font-size: .82rem; color: $danger; }
</style>
