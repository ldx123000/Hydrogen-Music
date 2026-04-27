import { createApp } from 'vue'
import DesktopLyric from './components/DesktopLyric.vue'
import './assets/css/common.css'
import './assets/css/fonts.css'
import './assets/css/theme.css'
import { initTheme, setTheme } from './utils/theme'
import { applyCustomFontStyle } from './utils/setFont'
import { resolveSystemFontOptionAsync } from './utils/fontResolver'

const app = createApp(DesktopLyric)
app.mount('#desktop-lyric-app')

// Initialize theme for desktop lyric window
initTheme()

if (typeof windowApi !== 'undefined' && typeof windowApi?.getSettings === 'function') {
  windowApi.getSettings()
    .then(settings => resolveSystemFontOptionAsync(settings?.other?.customFont, settings?.other?.customFontLabel))
    .then(({ value, label }) => applyCustomFontStyle(value, label))
    .catch(() => {})
}

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
