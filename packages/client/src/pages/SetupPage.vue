<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>Initial Setup</h1>
      <p class="subtitle">Create the first admin account.</p>
      <form @submit.prevent="submit">
        <div class="field">
          <label for="username">Username</label>
          <input id="username" v-model="username" type="text" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" autocomplete="new-password" required />
        </div>
        <div class="field">
          <label for="confirm">Confirm password</label>
          <input id="confirm" v-model="confirm" type="password" autocomplete="new-password" required />
        </div>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Creating…' : 'Create account' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../api/client.js'

const router = useRouter()
const username = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await api.auth.setup(username.value, password.value, confirm.value)
    await router.push('/')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Setup failed.'
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.auth-wrap {
  min-height: 100vh; display: flex; align-items: center; justify-content: center; background: $bg;
}

.auth-card {
  background: $card; border-radius: .5rem; padding: 2rem;
  width: 100%; max-width: 360px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
  display: flex; flex-direction: column; gap: 1.25rem;
  h1 { font-size: 1.25rem; font-weight: 700; color: $accent; text-align: center; }
  form { display: flex; flex-direction: column; gap: 1rem; }
}

.subtitle { font-size: .85rem; color: $text-muted; text-align: center; }
.field { display: flex; flex-direction: column; gap: .25rem; }
.auth-error { font-size: .82rem; color: $danger; }
.btn { width: 100%; padding: .55rem; }
</style>
