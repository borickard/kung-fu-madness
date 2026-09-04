import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Built to the repository root, where a host that knows nothing about the
  // workspace layout looks by default.
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173 },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
