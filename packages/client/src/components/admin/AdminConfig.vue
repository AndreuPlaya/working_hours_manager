<template>
  <div class="panel">
    <div v-if="loading" class="muted">Loading…</div>
    <template v-else>

      <!-- Time format -->
      <section class="config-section">
        <h3>Time format</h3>
        <div class="radio-group">
          <label>
            <input type="radio" v-model="timeFormat" value="24h" />
            24h (14:30)
          </label>
          <label>
            <input type="radio" v-model="timeFormat" value="12h" />
            12h (2:30 PM)
          </label>
        </div>
      </section>

      <!-- Date format -->
      <section class="config-section">
        <h3>Date format</h3>
        <input type="text" v-model="dateFormat" class="text-input" placeholder="MM/dd(ddd)" />
        <p class="hint">Tokens: YYYY year · MM month · dd day · ddd weekday abbrev (e.g. <code>YYYY/MM/dd(ddd)</code>)</p>
      </section>

      <!-- Color theme -->
      <section class="config-section">
        <h3>Color theme</h3>
        <div class="theme-row">
          <button
            v-for="t in themes"
            :key="t.id"
            class="theme-btn"
            :class="{ active: selectedTheme === t.id }"
            @click="pickTheme(t.id)"
          >
            <span class="swatch" :style="{ background: t.color }"></span>
            {{ t.label }}
          </button>
        </div>
      </section>

      <div class="actions">
        <button class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
      </div>

      <!-- Favicon -->
      <section class="config-section">
        <h3>Favicon</h3>
        <div class="favicon-row">
          <img v-if="faviconExt" :src="'/favicon.ico'" class="favicon-preview" alt="Current favicon" :key="faviconKey" />
          <span v-else class="muted">No custom favicon set.</span>
          <label class="btn btn-secondary upload-btn">
            Upload favicon
            <input type="file" accept=".ico,.png,.svg,.jpg,.jpeg" hidden @change="uploadFavicon" />
          </label>
        </div>
        <p class="hint">Accepted: .ico, .png, .svg, .jpg — refresh the page after upload to see the browser tab icon update.</p>
      </section>

    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import { applyTheme } from '../../composables/useAppConfig.js'
import { useToast } from '../../composables/useToast.js'

const { toast } = useToast()

const loading = ref(true)
const saving = ref(false)
const timeFormat = ref<'24h' | '12h'>('24h')
const dateFormat = ref('MM/dd(ddd)')
const selectedTheme = ref('blue')
const faviconExt = ref<string | undefined>()
const faviconKey = ref(0)

const themes = [
  { id: 'blue',   label: 'Blue',   color: '#2563eb' },
  { id: 'green',  label: 'Green',  color: '#16a34a' },
  { id: 'purple', label: 'Purple', color: '#7c3aed' },
  { id: 'dark',   label: 'Dark',   color: '#0f172a' },
]

onMounted(async () => {
  try {
    const cfg = await api.admin.getAppConfig()
    timeFormat.value = (cfg.time_format as '24h' | '12h') ?? '24h'
    dateFormat.value = cfg.date_format ?? 'MM/dd(ddd)'
    selectedTheme.value = cfg.theme ?? 'blue'
    faviconExt.value = cfg.favicon_ext
  } finally {
    loading.value = false
  }
})

function pickTheme(id: string) {
  selectedTheme.value = id
  applyTheme(id)
}

async function save() {
  saving.value = true
  try {
    await api.admin.updateAppConfig({ time_format: timeFormat.value, theme: selectedTheme.value, date_format: dateFormat.value })
    applyTheme(selectedTheme.value)
    toast('Settings saved.')
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Error saving settings.')
  } finally {
    saving.value = false
  }
}

async function uploadFavicon(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const res = await api.admin.uploadFavicon(file)
    faviconExt.value = res.ext
    faviconKey.value++
    toast('Favicon uploaded.')
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Error uploading favicon.')
  }
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.panel { padding: 1.5rem; max-width: 520px; display: flex; flex-direction: column; gap: 0; }

.config-section {
  padding: 1.25rem 0;
  border-bottom: 1px solid $border;
  &:last-of-type { border-bottom: none; }

  h3 { margin: 0 0 .75rem; font-size: .9rem; font-weight: 600; color: $text-label; text-transform: uppercase; letter-spacing: .04em; }
}

.radio-group {
  display: flex; gap: 1.5rem;
  label { display: flex; align-items: center; gap: .4rem; font-size: .875rem; cursor: pointer; }
}

.theme-row { display: flex; gap: .5rem; flex-wrap: wrap; }

.theme-btn {
  display: flex; align-items: center; gap: .4rem;
  padding: .35rem .75rem; border-radius: 6px;
  border: 2px solid $border; background: $card; cursor: pointer; font-size: .83rem;
  transition: border-color .15s;
  &:hover { border-color: $text-muted; }
  &.active { border-color: $accent; color: $accent; font-weight: 600; }
}

.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; }

.actions { padding: 1.25rem 0; border-bottom: 1px solid $border; }

.favicon-row {
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
}

.favicon-preview { width: 32px; height: 32px; object-fit: contain; border: 1px solid $border; border-radius: 4px; }

.upload-btn { position: relative; cursor: pointer; }

.hint { margin: .5rem 0 0; font-size: .78rem; color: $text-muted; }

.muted { color: $text-muted; font-size: .875rem; }

.text-input {
  width: 100%; max-width: 260px;
  padding: .35rem .6rem; border: 1px solid $border; border-radius: 4px;
  font-size: .875rem; background: $card; color: $text;
  &:focus { outline: none; border-color: $accent; }
}
</style>
