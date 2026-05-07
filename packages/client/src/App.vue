<template>
  <RouterView />
  <Teleport to="body">
    <div class="toast" :class="{ show: visible, 'has-undo': !!undoFn }">
      {{ message }}
      <button v-if="undoFn" class="toast-undo-btn" @click="handleUndo">Undo</button>
    </div>
    <ConfirmModal
      v-if="confirmVisible"
      :message="confirmMessage"
      @accept="accept"
      @decline="decline"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from './composables/useToast.js'
import { useConfirm, confirmVisible, confirmMessage } from './composables/useConfirm.js'
import ConfirmModal from './components/ConfirmModal.vue'

const { message, visible, undoFn, dismiss } = useToast()
const { accept, decline } = useConfirm()

function handleUndo() {
  const fn = undoFn.value
  dismiss()
  fn?.()
}
</script>
