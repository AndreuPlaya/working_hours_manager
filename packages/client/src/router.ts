import { createRouter, createWebHistory } from 'vue-router'
import { api, ApiError } from './api/client.js'

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

router.beforeEach(async to => {
  if (to.meta.public) return true

  try {
    const cfg = await api.auth.config()
    if (to.meta.adminOnly && !cfg.is_admin) return '/'
    return true
  } catch (e) {
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
