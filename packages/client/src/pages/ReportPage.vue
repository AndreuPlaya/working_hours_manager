<template>
  <div class="report-page">
    <div class="report-header">
      <RouterLink to="/reports" class="back-link">← Reports</RouterLink>
      <button class="btn btn-secondary print-btn" @click="print">Print</button>
    </div>
    <div v-if="loading" class="muted padded">Loading…</div>
    <div v-else-if="!report" class="muted padded">Report not found.</div>
    <div v-else class="report-body">
      <div class="report-title">
        <strong>{{ report.name }}</strong>
        <span class="sep">·</span>{{ report.dept }}
        <span class="sep">·</span>{{ report.year }}
      </div>
      <div v-for="month in report.months" :key="month.label" class="month-section">
        <h3>{{ month.label }}</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Clock In</th><th>Clock Out</th><th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in month.rows" :key="i"
                :class="{ subtotal: row.isSubtotal, incomplete: row.isIncomplete }">
              <td>{{ row.dateLabel }}</td>
              <td>{{ row.clockIn }}</td>
              <td>{{ row.clockOut }}</td>
              <td>{{ row.duration }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="month-total">
              <td colspan="3">Month total</td>
              <td>{{ month.total }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="year-total">Year total: <strong>{{ report.year_total }}</strong></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import type { EmployeeReport } from '../api/client.js'

const route = useRoute()
const report = ref<EmployeeReport | null>(null)
const loading = ref(true)

onMounted(async () => {
  try { report.value = await api.report(route.params.stem as string) } finally { loading.value = false }
})

function print() { window.print() }
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.report-page { min-height: 100vh; background: #fff; }

.report-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.5rem; border-bottom: 1px solid $border;
  @media print { display: none; }
}

.back-link { color: $accent; text-decoration: none; font-size: .875rem; &:hover { text-decoration: underline; } }

.report-body { padding: 2rem 1.5rem; max-width: 800px; margin: 0 auto; }

.report-title {
  font-size: 1.1rem; font-weight: 600; margin-bottom: 2rem;
  .sep { margin: 0 .4rem; color: $text-muted; }
}

.month-section {
  margin-bottom: 2.5rem;
  h3 { font-size: .9rem; font-weight: 600; margin-bottom: .75rem; color: $text-muted; text-transform: uppercase; }
}

table {
  width: 100%; border-collapse: collapse; font-size: .85rem;
  th, td { padding: .35rem .5rem; text-align: left; border-bottom: 1px solid $border; }
  th { font-weight: 600; color: $text-muted; font-size: .75rem; text-transform: uppercase; background: #f9fafb; }
  tr.subtotal td { font-weight: 600; border-top: 1px solid $border; }
  tr.incomplete td { color: $warning; }
}

tfoot td { font-weight: 600; border-top: 2px solid $border; }

.year-total { margin-top: 1rem; font-size: .9rem; color: $text-muted; }

.muted { color: $text-muted; font-size: .875rem; }
.padded { padding: 2rem; }
.print-btn { font-size: .8rem; padding: .3rem .6rem; }

@media print {
  .report-body { padding: 0; }
}
</style>
