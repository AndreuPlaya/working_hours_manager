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
}>()

const emit = defineEmits<{
  commit: [hhmm: string]
  cancel: []
}>()

const inputEl = ref<HTMLInputElement | null>(null)

const display = ref(props.time ? props.time.slice(0, 5) : '')

onMounted(() => {
  inputEl.value?.focus()
  inputEl.value?.select()
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
  font-size: .8rem;
  padding: .15rem .35rem;
  width: 60px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 3px;
  background: var(--card, #fff);
  color: var(--text, #1e293b);
  font-family: inherit;
  text-align: center;
  &:focus {
    outline: none;
    border-color: var(--accent, #2563eb);
  }
}
</style>
