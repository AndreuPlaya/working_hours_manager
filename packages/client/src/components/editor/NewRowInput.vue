<template>
  <div ref="el" class="new-session-row">
    <div class="ns-date">
      <input
        ref="dateEl"
        type="text"
        class="date-draft-input"
        :value="draftDate"
        maxlength="5"
        placeholder="MM/dd"
        @keydown="onKeyDown"
        @input="onInput"
      />
    </div>
    <div class="ns-time">
      <TimeInput :time="null" :auto-focus="false" @commit="v => (draftIn = v)" @cancel="() => {}" />
    </div>
    <div class="ns-time">
      <TimeInput :time="null" :auto-focus="false" @commit="onOutCommit" @cancel="() => {}" />
    </div>
    <div class="ns-dur">—</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useClickOutside } from '../../composables/useClickOutside.js'
import TimeInput from './TimeInput.vue'

const props = defineProps<{
  year: number
  month: number
  minDate: string | null
}>()

const emit = defineEmits<{
  add: [timestamp: string]
  cancel: []
}>()

const el = ref<HTMLElement | null>(null)
const dateEl = ref<HTMLInputElement | null>(null)
const draftDate = ref('')
const draftIn = ref<string | null>(null)
const draftOut = ref<string | null>(null)

onMounted(() => dateEl.value?.focus())

function nowHHMM(): string {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

function todayISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function parseDraftDate(input: string): string | null {
  const m = input.match(/^(\d{2})\/(\d{2})$/)
  if (!m) return null
  const mm = parseInt(m[1]), dd = parseInt(m[2])
  if (mm < 1 || mm > 12) return null
  const maxDay = new Date(props.year, mm, 0).getDate()
  if (dd < 1 || dd > maxDay) return null
  const dateStr = `${props.year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  if (dateStr > todayISO()) return null
  if (props.minDate && dateStr < props.minDate) return null
  return dateStr
}

function submit() {
  const dateStr = parseDraftDate(draftDate.value)
  emit('cancel')
  if (!dateStr || !draftIn.value) return
  const isToday = dateStr === todayISO()
  const currentHHMM = nowHHMM()
  if (isToday && draftIn.value > currentHHMM) return
  emit('add', `${dateStr} ${draftIn.value}:00`)
  if (draftOut.value && !(isToday && draftOut.value > currentHHMM)) {
    emit('add', `${dateStr} ${draftOut.value}:00`)
  }
}

function onOutCommit(hhmm: string) {
  draftOut.value = hhmm
  submit()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') { emit('cancel'); return }
  if (/^\d$/.test(e.key) || ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
}

function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.replace(/\D/g, '').slice(0, 4)
  const formatted = raw.length > 2 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw
  draftDate.value = formatted
  input.value = formatted
}

useClickOutside(el, submit)
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.new-session-row {
  display: grid;
  grid-template-columns: $col-date $col-group $col-group $col-dur;
  align-items: center;
  background: $border-light;
  margin: 0 auto;
  width: fit-content;
}

.ns-date {
  display: flex;
  align-items: center;
  padding: .25rem .65rem;
  min-height: 30px;
}

.ns-time {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: .25rem .5rem;
  min-height: 30px;
}

.ns-dur {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: .25rem .5rem;
  font-family: $font-mono;
  font-size: .82rem;
  color: $text-muted;
  min-height: 30px;
}

.date-draft-input {
  font-size: .82rem;
  font-family: $font-mono;
  border: 1px solid $input-border;
  border-radius: 3px;
  padding: .15rem .3rem;
  background: $card;
  color: $text;
  width: 60px;
  text-align: center;
  &:focus { outline: none; border-color: $accent; }
}
</style>
