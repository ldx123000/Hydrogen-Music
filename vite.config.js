import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  manifest: true,
  build: {
    target: 'es2015',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'desktop-lyric': resolve(__dirname, 'desktop-lyric.html')
      },
      output: {
        // 手动代码分割，优化加载性能
        manualChunks: {
          // Vue 生态系统
          'vendor-vue': ['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate'],
          // UI 组件库
          'vendor-ui': ['plyr', 'vue-slider-component', 'vue-virtual-scroller'],
          // 工具库
          'vendor-utils': ['axios', 'howler', 'js-cookie', 'js-md5', 'nanoid'],
          // Electron 相关
          'vendor-electron': ['electron-store', 'electron-updater', 'electron-win-state'],
          // 大型第三方库
          'vendor-music-api': ['NeteaseCloudMusicApi'],
          // 其他工具
          'vendor-misc': ['qrcode', 'music-metadata', 'fs-extra']
        },
        // 优化文件名
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop().replace('.vue', '') : 'chunk'
          return `js/${facadeModuleId}-[hash].js`
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetInfo.name)) {
            return `media/[name]-[hash].${ext}`
          }
          if (/\.(png|jpe?g|gif|svg)(\?.*)?$/i.test(assetInfo.name)) {
            return `images/[name]-[hash].${ext}`
          }
          if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetInfo.name)) {
            return `fonts/[name]-[hash].${ext}`
          }
          return `assets/[name]-[hash].${ext}`
        }
      }
    },
    // 启用更激进的压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        // 生产环境移除 console
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.warn']
      }
    },
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 减少打包体积阈值警告
    chunkSizeWarningLimit: 1000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    // 预构建优化
    include: [
      'vue',
      'vue-router',
      'pinia',
      'axios',
      'howler'
    ],
    exclude: [
      // 排除 Electron 相关包避免预构建问题
      'electron',
      'fs-extra'
    ]
  },
  // CSS 优化
  css: {
    // 启用 CSS modules（如果需要）
    modules: false,
    // PostCSS 配置（可以添加 autoprefixer 等）
    postcss: {},
    preprocessorOptions: {
      scss: {
        // 静默弃用警告
        quietDeps: true
      }
    }
  },
  // 开发服务器优化
  server: {
    // 启用 gzip 压缩
    open: false,
    cors: true
  },
  // 预览服务器配置
  preview: {
    port: 4173,
    strictPort: true
  }
})