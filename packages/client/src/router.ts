import { createRouter, createWebHistory } from 'vue-router'
import { api, ApiError } from './api/client.js'
import type { Config } from './api/client.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
    { path: '/setup', component: () => import('./pages/SetupPage.vue'), meta: { public: true } },
    { path: '/', component: () => import('./pages/EditorPage.vue') },
    { path: '/admin', component: () => import('./pages/AdminPage.vue'), meta: { adminOnly: true } },
    { path: '/reports', component: () => import('./pages/ReportIndexPage.vue'), meta: { adminOnly: true } },
    { path: '/reports/:stem', component: () => import('./pages/ReportPage.vue') },
  ],
})

let cachedConfig: Config | null = null

export function clearAuthCache(): void {
  cachedConfig = null
}

router.beforeEach(async to => {
  if (to.meta.public) {
    if (to.path === '/login') cachedConfig = null
    return true
  }

  try {
    if (!cachedConfig) cachedConfig = await api.auth.config()
    if (to.meta.adminOnly && !cachedConfig.is_admin) return '/'
    return true
  } catch (e) {
    cachedConfig = null
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      try {
        const s = await api.auth.setupStatus()
        if (s.needs_setup) return '/setup'
      } catch (setupErr) {
        console.error('Router setup check failed:', setupErr)
      }
    }
    return '/login'
  }
})

export default router
