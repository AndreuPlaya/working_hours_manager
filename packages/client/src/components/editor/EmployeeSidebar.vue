<template>
  <div class="sidebar">
    <div
      v-for="key in eventKeys"
      :key="key"
      class="emp-row"
      :class="{ selected: key === selectedKey }"
      @click="$emit('select', key)"
    >
      <span class="emp-name">{{ displayName(key) }}</span>
      <span v-if="pendingCountFor(empIdOf(key)) > 0" class="badge badge-count">
        {{ pendingCountFor(empIdOf(key)) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PendingItem, Profile } from '../../api/client.js'

const props = defineProps<{
  eventKeys: string[]
  profiles: Record<string, Profile>
  pending: PendingItem[]
  selectedKey: string | null
}>()

defineEmits<{ select: [key: string] }>()

function empIdOf(key: string): string {
  return key.split('|')[0]
}

function nameOf(key: string): string {
  return key.split('|')[1]
}

function displayName(key: string): string {
  const empId = empIdOf(key)
  return props.profiles[empId]?.alias || nameOf(key)
}

function pendingCountFor(empId: string): number {
  return props.pending.filter(p => p.emp_id === empId).length
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid $border;
  overflow-y: auto;
  background: $card;
}

.emp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .6rem .85rem;
  cursor: pointer;
  font-size: .875rem;
  border-bottom: 1px solid $border-light;

  &:hover {
    background: $border-light;
  }

  &.selected {
    background: $selected-bg;
    color: $accent;
    font-weight: 500;
  }
}

.emp-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
