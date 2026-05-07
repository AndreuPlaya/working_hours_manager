<template>
  <input
    ref="inputEl"
    type="text"
    class="time-input"
    :value="display"
    maxlength="5"
    placeholder="HH:MM"
    @keydown="onKeyDown"
    @input="onInput"
    @blur="onBlur"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{
  time: string | null
  autoFocus?: boolean
}>()

const emit = defineEmits<{
  commit: [hhmm: string]
  cancel: []
}>()

const inputEl = ref<HTMLInputElement | null>(null)

const display = ref(props.time ? props.time.slice(0, 5) : '')

onMounted(() => {
  if (props.autoFocus !== false) {
    inputEl.value?.focus()
    inputEl.value?.select()
  }
})

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    tryCommit()
    return
  }
  // Allow: digits, Backspace, Delete, Tab, Arrow keys, Home, End
  if (
    /^\d$/.test(e.key) ||
    ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
  ) return
  e.preventDefault()
}

function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  let raw = input.value.replace(/\D/g, '').slice(0, 4)
  let formatted = raw
  if (raw.length > 2) {
    formatted = raw.slice(0, 2) + ':' + raw.slice(2)
  }
  display.value = formatted
  input.value = formatted
}

function tryCommit() {
  const val = inputEl.value?.value ?? ''
  if (/^\d{2}:\d{2}$/.test(val)) {
    const [h, m] = val.split(':').map(Number)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      emit('commit', val)
      return
    }
  }
  emit('cancel')
}

function onBlur() {
  tryCommit()
}
</script>

<style scoped>
.time-input {
  font-size: .95rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  color: var(--text, #1e293b);
  background: transparent;
  border: none;
  border-bottom: 1.5px solid var(--accent, #2563eb);
  border-radius: 0;
  outline: none;
  padding: 0 .1rem;
  width: 52px;
  text-align: center;
  caret-color: var(--accent, #2563eb);
}
</style>
