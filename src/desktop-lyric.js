import { createApp } from 'vue'
import DesktopLyric from './components/DesktopLyric.vue'
import './assets/css/common.css'
import './assets/css/fonts.css'

const app = createApp(DesktopLyric)
app.mount('#desktop-lyric-app')

if (window.electronAPI) {
  window.electronAPI.lyricWindowReady()
}