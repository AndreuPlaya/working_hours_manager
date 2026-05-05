<template>
  <RouterView />
  <Teleport to="body">
    <div class="toast" :class="{ show: visible }">{{ message }}</div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from './composables/useToast.js'
const { message, visible } = useToast()
</script>
