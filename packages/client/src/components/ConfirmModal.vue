<template>
  <div class="modal-overlay" @click.self="$emit('decline')">
    <div class="modal">
      <p class="message">{{ message }}</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('decline')">Cancel</button>
        <button class="btn btn-danger" @click="$emit('accept')">Confirm</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ accept: []; decline: [] }>()
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.message {
  font-size: .925rem;
  color: $text;
  margin: 0 0 1.5rem;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: .5rem;
}
</style>
