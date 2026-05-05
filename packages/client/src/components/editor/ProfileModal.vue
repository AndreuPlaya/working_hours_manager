<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Profile</h2>

      <div class="field">
        <label>Full name</label>
        <input type="text" v-model="fullName" autocomplete="name" />
      </div>
      <div class="field">
        <label>Email</label>
        <input type="email" v-model="email" autocomplete="email" />
      </div>
      <div class="field">
        <label>Username</label>
        <input type="text" v-model="username" autocomplete="username" />
      </div>

      <div class="pw-section">
        <button class="btn btn-secondary btn-sm" type="button" @click="showPw = !showPw">
          {{ showPw ? 'Cancel password change' : 'Change password' }}
        </button>
        <template v-if="showPw">
          <div class="field">
            <label>Current password</label>
            <input type="password" v-model="currentPw" autocomplete="current-password" />
          </div>
          <div class="field">
            <label>New password</label>
            <input type="password" v-model="newPw" autocomplete="new-password" />
          </div>
          <div class="field">
            <label>Confirm new password</label>
            <input type="password" v-model="confirmPw" autocomplete="new-password" />
          </div>
        </template>
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

const props = defineProps<{
  initialFullName: string
  initialEmail: string
  initialUsername: string
}>()

const emit = defineEmits<{ close: []; saved: [] }>()
const { toast } = useToast()

const fullName = ref(props.initialFullName)
const email = ref(props.initialEmail)
const username = ref(props.initialUsername)
const showPw = ref(false)
const currentPw = ref('')
const newPw = ref('')
const confirmPw = ref('')
const error = ref('')
const loading = ref(false)

async function save() {
  error.value = ''
  if (showPw.value && newPw.value !== confirmPw.value) {
    error.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  try {
    const payload: Record<string, string> = {
      full_name: fullName.value,
      email: email.value,
      username: username.value,
    }
    if (showPw.value && currentPw.value && newPw.value) {
      payload.current_password = currentPw.value
      payload.new_password = newPw.value
    }
    await api.updateProfile(payload)
    toast('Profile saved.')
    emit('saved')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Error saving profile.'
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;
.field { display: flex; flex-direction: column; gap: .25rem; }
.error { font-size: .82rem; color: $danger; }
.pw-section { display: flex; flex-direction: column; gap: .75rem; margin-top: .5rem; }
.btn-sm { font-size: .8rem; padding: .2rem .6rem; align-self: flex-start; }
</style>
