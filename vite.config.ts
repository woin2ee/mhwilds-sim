import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages(프로젝트 페이지)는 /<레포명>/ 아래에서 서빙되므로 배포 워크플로가 BASE_PATH 를 넘겨준다.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // OCR 언어 데이터는 tesseract.js 가 '<폴더>/kor.traineddata.gz' 로 찾으므로 이름을 바꾸지 않는다
        // (src/features/talismans/talismanOcr.ts)
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.traineddata.gz'))
            ? 'tessdata/[name][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
