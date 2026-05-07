import { ref } from 'vue'
import { api } from '../api/client.js'
import type { Config, EventRow, PendingItem, Profile } from '../api/client.js'

export function useEditorData() {
  const config = ref<Config | null>(null)
  const profiles = ref<Record<string, Profile>>({})
  const events = ref<Record<string, EventRow[]>>({})
  const pending = ref<PendingItem[]>([])

  async function load(): Promise<Config> {
    const [cfg, profs, evts, pend] = await Promise.all([
      api.config(), api.profiles(), api.events(), api.myPending(),
    ])
    config.value = cfg
    profiles.value = profs
    events.value = evts
    pending.value = pend
    return cfg
  }

  async function refresh(): Promise<void> {
    const [evts, pend] = await Promise.all([api.events(), api.myPending()])
    events.value = evts
    pending.value = pend
  }

  async function reloadConfig(): Promise<void> {
    config.value = await api.config()
  }

  return {
    config,
    profiles,
    events,
    pending,
    load,
    refresh,
    reloadConfig,
    submitEdit: (empId: string, name: string, dept: string, oldTs: string, newTs: string) =>
      api.edit({ emp_id: empId, name, dept, old_timestamp: oldTs, new_timestamp: newTs }),
    submitAdd: (empId: string, name: string, dept: string, ts: string) =>
      api.add({ emp_id: empId, name, dept, timestamp: ts }),
    submitDelete: (empId: string, name: string, dept: string, ts: string) =>
      api.delete({ emp_id: empId, name, dept, timestamp: ts }),
    cancelPending: (id: string) =>
      api.cancelMyPending(id),
    replacePendingWithEdit: async (pendingId: string, empId: string, name: string, dept: string, oldTs: string, newTs: string) => {
      await api.cancelMyPending(pendingId)
      return api.edit({ emp_id: empId, name, dept, old_timestamp: oldTs, new_timestamp: newTs })
    },
  }
}
