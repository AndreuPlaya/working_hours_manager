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
          <input id="confirm" v-model="confirmPw" type="password" autocomplete="new-password" required />
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
import { api } from '../api/client.js'
import { useAuthForm } from '../composables/useAuthForm.js'

const username = ref('')
const password = ref('')
const confirmPw = ref('')

const { error, loading, submit } = useAuthForm(
  () => api.auth.setup(username.value, password.value, confirmPw.value),
)
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.subtitle {
  font-size: .85rem;
  color: $text-muted;
  text-align: center;
}
</style>
