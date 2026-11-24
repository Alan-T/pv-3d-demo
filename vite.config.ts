import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tinyVueImport from '@opentiny/vue-vite-import';

export default defineConfig({
  plugins: [vue(), tinyVueImport([{ libraryName: '@opentiny/vue' }], 'pc')],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
  },
});
