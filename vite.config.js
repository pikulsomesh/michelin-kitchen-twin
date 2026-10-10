import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/; `vite` dev serves from /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/michelin-kitchen-twin/' : '/',
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1500,
    // two pages: the 3D site and the operations dashboard
    rollupOptions: { input: { main: 'index.html', dashboard: 'dashboard.html' } },
  },
}));
