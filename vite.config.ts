import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: '/',
  plugins: [react()],
  build: {
    outDir: path.resolve('build/web'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
