import { ref } from 'vue'
import { api } from '../api/client.js'
import { applyTheme } from '../utils/theme.js'

export interface AppConfigState {
  theme: string
  date_format: string
}

let promise: Promise<AppConfigState> | null = null
const config = ref<AppConfigState>({ theme: 'blue', date_format: 'MM/dd(ddd)' })

export function useAppConfig() {
  if (!promise) {
    promise = api.appConfig()
      .then(cfg => {
        config.value = { ...config.value, ...cfg, date_format: cfg.date_format ?? config.value.date_format }
        applyTheme(cfg.theme)
        return config.value
      })
      .catch(() => config.value)
  }
  return {
    config,
    reload: () => { promise = null; return useAppConfig() },
  }
}
