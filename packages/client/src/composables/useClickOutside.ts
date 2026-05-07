import { onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export function useClickOutside(
  elementRef: Ref<HTMLElement | null>,
  callback: () => void,
) {
  function handler(e: MouseEvent) {
    if (elementRef.value && !elementRef.value.contains(e.target as Node)) {
      callback()
    }
  }
  onMounted(() => document.addEventListener('click', handler, { capture: true }))
  onUnmounted(() => document.removeEventListener('click', handler, { capture: true }))
}
