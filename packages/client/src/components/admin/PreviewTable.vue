<template>
  <table class="preview-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>In</th>
        <th>Out</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(row, i) in rows"
        :key="i"
        :class="{ subtotal: row.is_subtotal, affected: row.affected }"
      >
        <td>{{ row.date_label }}</td>
        <td>{{ row.clock_in }}</td>
        <td>{{ row.clock_out }}</td>
        <td>{{ row.duration }}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Month total</td>
        <td>{{ total }}</td>
      </tr>
    </tfoot>
  </table>
</template>

<script setup lang="ts">
interface PreviewRow {
  date_label: string
  clock_in: string
  clock_out: string
  duration: string
  is_subtotal?: boolean
  affected?: boolean
}

defineProps<{
  rows: PreviewRow[]
  total: string
}>()
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .78rem;

  th,
  td {
    padding: .3rem .4rem;
    border-bottom: 1px solid $border;
  }

  th {
    font-weight: 600;
    color: $text-muted;
    font-size: .7rem;
    text-transform: uppercase;
  }

  tr.subtotal td {
    font-weight: 600;
  }

  tr.affected td {
    background: #fef9c3;
  }

  tfoot td {
    font-weight: 600;
    border-top: 1px solid $border;
  }
}
</style>
