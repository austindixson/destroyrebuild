import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
  },
});
