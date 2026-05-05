<template>
  <div class="report-index">
    <header>
      <h1>Reports</h1>
      <a href="/" class="hdr-icon" title="Editor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
      </a>
    </header>
    <div class="content">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="!index" class="muted">No reports found.</div>
      <div v-else>
        <div v-for="year in index.years" :key="year" class="year-section">
          <h2>{{ year }}</h2>
          <ul>
            <li v-for="item in index.stems_by_year[year]" :key="item.stem">
              <RouterLink :to="`/reports/${item.stem}`">{{ item.display }}</RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import type { ReportIndex } from '../api/client.js'

const index = ref<ReportIndex | null>(null)
const loading = ref(true)

onMounted(async () => {
  try { index.value = await api.reports() } finally { loading.value = false }
})
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.report-index { min-height: 100vh; }

.content { padding: 2rem; max-width: 600px; margin: 0 auto; }

.year-section {
  margin-bottom: 2rem;
  h2 { font-size: 1rem; font-weight: 600; margin-bottom: .5rem; color: $text-muted; text-transform: uppercase; letter-spacing: .05em; }
  ul { list-style: none; display: flex; flex-direction: column; gap: .35rem; }
  a { color: $accent; text-decoration: none; font-size: .9rem; &:hover { text-decoration: underline; } }
}

.muted { color: $text-muted; font-size: .875rem; }
</style>
