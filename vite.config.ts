import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  base: './', // đường dẫn tương đối: chạy được ở gốc lẫn dưới /<repo>/ của GitHub Pages
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        stage: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
