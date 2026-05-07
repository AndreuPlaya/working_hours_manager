<template>
  <div class="panel">
    <div
      class="drop-zone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <span>Drop .txt files here or click to upload</span>
      <input ref="fileInput" type="file" accept=".txt" multiple style="display:none" @change="onFileInput" />
    </div>
    <p v-if="uploadError" class="error">{{ uploadError }}</p>

    <table v-if="files.length">
      <thead>
        <tr>
          <th @click="sortBy('name')" class="sortable">Name {{ sortIcon('name') }}</th>
          <th @click="sortBy('size')" class="sortable">Size {{ sortIcon('size') }}</th>
          <th @click="sortBy('modified')" class="sortable">Modified {{ sortIcon('modified') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in sortedFiles" :key="f.name">
          <td>{{ f.name }}</td>
          <td>{{ fmtSize(f.size) }}</td>
          <td>{{ fmtDate(f.modified) }}</td>
          <td>
            <button class="btn btn-danger sm" @click="deleteFile(f.name)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="muted">No data files uploaded yet.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, ApiError } from '../../api/client.js'
import type { RawFile } from '../../api/client.js'
import { useAsyncOp } from '../../composables/useAsyncOp.js'
import { useToast } from '../../composables/useToast.js'
import { useConfirm } from '../../composables/useConfirm.js'

const { loading, run } = useAsyncOp()
const { toast } = useToast()
const { confirm } = useConfirm()
const files = ref<RawFile[]>([])
const dragging = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const sortKey = ref<'name' | 'size' | 'modified'>('name')
const sortDir = ref<1 | -1>(1)

async function load() {
  files.value = await api.admin.rawFiles()
}

onMounted(() => run(load))

const sortedFiles = computed(() =>
  [...files.value].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir.value
  })
)

function sortBy(key: 'name' | 'size' | 'modified') {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1
  } else {
    sortKey.value = key
    sortDir.value = 1
  }
}

function sortIcon(key: string): string {
  if (sortKey.value !== key) return ''
  return sortDir.value === 1 ? '↑' : '↓'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString()
}

async function upload(file: File) {
  uploadError.value = ''
  try {
    await api.admin.uploadFile(file)
    await load()
    toast(`Uploaded ${file.name}`)
  } catch (e) {
    uploadError.value = e instanceof ApiError ? e.message : 'Upload failed.'
  }
}

async function onDrop(e: DragEvent) {
  dragging.value = false
  const dropped = Array.from(e.dataTransfer?.files ?? [])
  for (const f of dropped) await upload(f)
}

async function onFileInput(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  for (const f of picked) await upload(f)
}

async function deleteFile(name: string) {
  if (!await confirm(`Delete ${name}?`)) return
  await run(async () => {
    await api.admin.deleteFile(name)
    await load()
    toast('Deleted.')
  })
}
</script>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.panel {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.drop-zone {
  border: 2px dashed $input-border;
  border-radius: .5rem;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  color: $text-muted;
  font-size: .875rem;
  transition: border-color .15s, background .15s;

  &:hover,
  &.dragging {
    border-color: $accent;
    background: $selected-bg;
    color: $accent;
  }
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: .85rem;

  th,
  td {
    padding: .4rem .5rem;
    text-align: left;
    border-bottom: 1px solid $border;
  }

  th {
    font-weight: 600;
    color: $text-muted;
    font-size: .72rem;
    text-transform: uppercase;

    &.sortable {
      cursor: pointer;

      &:hover {
        color: $text;
      }
    }
  }
}

.btn.sm {
  padding: .25rem .55rem;
  font-size: .78rem;
}

.error {
  font-size: .82rem;
  color: $danger;
}

.muted {
  color: $text-muted;
  font-size: .875rem;
}
</style>
