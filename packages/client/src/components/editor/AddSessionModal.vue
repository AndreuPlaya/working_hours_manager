<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Add Session</h2>
      <div class="field">
        <label>Clock In</label>
        <input type="datetime-local" v-model="clockIn" required />
      </div>
      <div class="field">
        <label>Clock Out <span class="optional">(optional)</span></label>
        <input type="datetime-local" v-model="clockOut" />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="!clockIn || loading" @click="save">
          {{ loading ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import { useToast } from '../../composables/useToast.js'

const props = defineProps<{ empId: string; name: string; dept: string; defaultDate?: string }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { toast } = useToast()

const clockIn = ref(props.defaultDate ? props.defaultDate + 'T00:00' : '')
const clockOut = ref(props.defaultDate ? props.defaultDate + 'T00:00' : '')
const error = ref('')
const loading = ref(false)

async function save() {
  error.value = ''
  loading.value = true
  try {
    const fmt = (v: string) => v.replace('T', ' ') + ':00'
    const res = await api.add({ emp_id: props.empId, name: props.name, dept: props.dept, timestamp: fmt(clockIn.value) })
    if (clockOut.value) {
      await api.add({ emp_id: props.empId, name: props.name, dept: props.dept, timestamp: fmt(clockOut.value) })
    }
    toast(res.pending ? 'Submitted for approval.' : 'Session added.')
    emit('saved')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Error saving.'
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;
.field { display: flex; flex-direction: column; gap: .25rem; }
.optional { font-weight: 400; color: $text-muted; }
.error { font-size: .82rem; color: $danger; }
</style>
