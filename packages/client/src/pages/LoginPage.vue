<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>Working Hours</h1>
      <form @submit.prevent="submit">
        <div class="field">
          <label for="username">Username</label>
          <input id="username" v-model="username" type="text" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" autocomplete="current-password" required />
        </div>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
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

const { error, loading, submit } = useAuthForm(
  () => api.auth.login(username.value, password.value),
)
</script>

