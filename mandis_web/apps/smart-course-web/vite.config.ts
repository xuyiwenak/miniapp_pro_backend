import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { base: env.VITE_BASE_PATH || '/smartcourse/', plugins: [react()],
    resolve: { alias: { '@pattern': fileURLToPath(new URL('../../../src/apps/smartCourse/pattern', import.meta.url)) } },
    server: {
    port: 5178, host: '127.0.0.1', proxy: {
      '/smartcourse-api': { target: env.SMARTCOURSE_DEV_API || 'http://127.0.0.1:43002' },
    },
  } };
});
