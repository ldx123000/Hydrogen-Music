import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base:'./',
  manifest:true,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'desktop-lyric': resolve(__dirname, 'desktop-lyric.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    exclude: []
  }
})