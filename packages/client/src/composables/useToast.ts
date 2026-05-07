import { ref } from 'vue'

const message = ref('')
const visible = ref(false)
const undoFn = ref<(() => void) | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  function toast(msg: string, options?: { onUndo?: () => void }) {
    message.value = msg
    visible.value = true
    undoFn.value = options?.onUndo ?? null
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { visible.value = false }, 4500)
  }

  function dismiss() {
    visible.value = false
    undoFn.value = null
    if (timer) { clearTimeout(timer); timer = null }
  }

  return { message, visible, undoFn, toast, dismiss }
}
