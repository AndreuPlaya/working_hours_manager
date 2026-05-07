import { ref } from 'vue'
import { ApiError } from '../api/client.js'
import { useToast } from './useToast.js'

export function useAsyncOp() {
  const { toast } = useToast()
  const loading = ref(false)

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    loading.value = true
    try {
      return await fn()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong.')
    } finally {
      loading.value = false
    }
  }

  return { loading, run }
}
