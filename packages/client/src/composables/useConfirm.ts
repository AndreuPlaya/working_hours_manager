import { ref } from 'vue'

const message = ref('')
const visible = ref(false)
const _resolve = ref<((v: boolean) => void) | null>(null)

export function useConfirm() {
  function confirm(msg: string): Promise<boolean> {
    message.value = msg
    visible.value = true
    return new Promise(resolve => { _resolve.value = resolve })
  }

  function accept() {
    visible.value = false
    _resolve.value?.(true)
    _resolve.value = null
  }

  function decline() {
    visible.value = false
    _resolve.value?.(false)
    _resolve.value = null
  }

  return { confirm, accept, decline, visible, message }
}
