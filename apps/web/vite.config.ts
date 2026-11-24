import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const agentUrl = process.env.MAILKEEP_PUBLIC_URL ?? 'http://localhost:8080';
const proxy = {
  '/api': { target: agentUrl, changeOrigin: true },
  '/auth': { target: agentUrl, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
});
