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

<style lang="scss" scoped>
@use '../styles/variables' as *;

.auth-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg;
}

.auth-card {
  background: $card;
  border-radius: .5rem;
  padding: 2rem;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .08);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  h1 {
    font-size: 1.25rem;
    font-weight: 700;
    color: $accent;
    text-align: center;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: .25rem;
}

.auth-error {
  font-size: .82rem;
  color: $danger;
}

.btn {
  width: 100%;
  padding: .55rem;
}
</style>
