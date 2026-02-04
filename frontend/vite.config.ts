import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

// API URL - Docker에서는 서비스명 사용, 로컬에서는 localhost
const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
  ],
  server: {
    port: 5173,
    host: '0.0.0.0', // Docker 컨테이너에서 외부 접근 허용
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
      '/ws': {
        target: apiUrl.replace('http', 'ws'),
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 라이브러리별 청크 분리로 캐싱 효율 극대화
        manualChunks: {
          // 차트 라이브러리 (가장 큰 의존성)
          'vendor-echarts': ['echarts'],
          'vendor-lightweight-charts': ['lightweight-charts'],
          // UI 프레임워크
          'vendor-solid': ['solid-js', '@solidjs/router'],
          'vendor-tanstack': ['@tanstack/solid-query'],
          // 유틸리티
          'vendor-lucide': ['lucide-solid'],
        },
      },
    },
    // 500KB 이상 청크 경고 한계 조정
    chunkSizeWarningLimit: 600,
  },
})
