import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate  from 'pinia-plugin-persistedstate'

const pinia = createPinia()
const app = createApp()

pinia.use(piniaPluginPersistedstate)
app.use(pinia)

export default pinia