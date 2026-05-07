import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../api/client.js'

export function useAuthForm(submitFn: () => Promise<unknown>, redirectTo = '/') {
  const router = useRouter()
  const error = ref('')
  const loading = ref(false)

  async function submit() {
    error.value = ''
    loading.value = true
    try {
      await submitFn()
      await router.push(redirectTo)
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Request failed.'
    } finally {
      loading.value = false
    }
  }

  return { error, loading, submit }
}
