import { createApp } from 'vue'
import App from './App.vue'
import router from './router/router.js'
import pinia from './store/pinia'
import lazy from './utils/lazy'
import './assets/css/style.css'
import './assets/css/reset.css'
import './assets/css/common.css'
import './assets/css/fonts.css'
import './assets/css/theme.css'
import { initTheme } from './utils/theme'
import { init } from './utils/initApp'
const app = createApp(App)
app.use(router)
app.use(pinia)
app.directive('lazy', lazy)
// Initialize theme before app renders
initTheme()
app.mount('#app')

void init().catch(() => {})

// Prevent default browser file open on drag/drop globally
window.addEventListener('dragover', (e) => {
  e.preventDefault()
})
window.addEventListener('drop', (e) => {
  e.preventDefault()
})
