import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ART_WEB_BASE_PATH = '/art/';

export default defineConfig({
  base: ART_WEB_BASE_PATH,
  plugins: [react()],
});
