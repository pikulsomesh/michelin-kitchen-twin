import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/; `vite` dev serves from /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/michelin-kitchen-twin/' : '/',
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1500,
    // pages: the 3D site, the studio, the operations dashboard and the wiki
    rollupOptions: { input: {
      main: resolve(import.meta.dirname, 'index.html'),
      studio: resolve(import.meta.dirname, 'studio.html'),
      dashboard: resolve(import.meta.dirname, 'dashboard.html'),
      wiki: resolve(import.meta.dirname, 'wiki.html'),
    } },
  },
}));
