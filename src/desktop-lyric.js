import { createApp } from 'vue'
import DesktopLyric from './components/DesktopLyric.vue'
import './assets/css/common.css'
import './assets/css/fonts.css'
import './assets/css/theme.css'
import { initTheme, setTheme } from './utils/theme'

const app = createApp(DesktopLyric)
app.mount('#desktop-lyric-app')

// Initialize theme for desktop lyric window
initTheme()

// Sync theme when settings change in main window (localStorage storage event)
window.addEventListener('storage', (e) => {
  if (e && e.key === 'theme') {
    const mode = e.newValue || 'system'
    setTheme(mode)
  }
})

if (window.electronAPI) {
  window.electronAPI.lyricWindowReady()
}
