import { ref } from 'vue'

const message = ref('')
const _resolve = ref<((v: boolean) => void) | null>(null)

export const confirmVisible = ref(false)
export const confirmMessage = message

export function useConfirm() {
  function confirm(msg: string): Promise<boolean> {
    message.value = msg
    confirmVisible.value = true
    return new Promise(resolve => { _resolve.value = resolve })
  }

  function accept() {
    confirmVisible.value = false
    _resolve.value?.(true)
    _resolve.value = null
  }

  function decline() {
    confirmVisible.value = false
    _resolve.value?.(false)
    _resolve.value = null
  }

  return { confirm, accept, decline }
}
