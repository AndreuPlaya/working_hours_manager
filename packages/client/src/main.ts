import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './styles/base.scss'

createApp(App).use(router).mount('#app')
