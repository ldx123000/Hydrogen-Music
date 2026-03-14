import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    target: 'es2018', // 更新到ES2018以支持async generator functions
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'desktop-lyric': resolve(__dirname, 'desktop-lyric.html')
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
      },
      mangle: {
        // 避免 eval 相关问题
        eval: false
      },
      format: {
        // 移除注释
        comments: false
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
