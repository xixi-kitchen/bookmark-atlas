import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Excalidraw's development bundle imports extensionless RoughJS internals,
    // which Node's test runner cannot resolve. The production export is the
    // same public API and is also the bundle shipped by the extension.
    conditions: ['production'],
    alias: [
      {
        find: /^@excalidraw\/excalidraw$/,
        replacement: fileURLToPath(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/index.js', import.meta.url)),
      },
      {
        find: /^roughjs\/bin\/rough$/,
        replacement: fileURLToPath(new URL('./node_modules/roughjs/bin/rough.js', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: { reporter: ['text', 'html'] },
    server: {
      deps: {
        inline: ['@excalidraw/excalidraw', 'roughjs'],
      },
    },
  },
});
