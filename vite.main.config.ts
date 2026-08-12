import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['electron', 'node-pty'],
      output: { entryFileNames: 'main.cjs', format: 'cjs' },
    },
  },
});
