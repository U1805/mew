import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
        return {
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              const moduleId = id.replace(/\\/g, '/');

              // Keep React ecosystem together in vendor to avoid chunk cycles.
              // Split only relatively isolated heavy dependencies.
              if (moduleId.includes('@tiptap') || moduleId.includes('/prosemirror-')) return 'tiptap';
              if (
                moduleId.includes('socket.io-client') ||
                moduleId.includes('engine.io-client') ||
                moduleId.includes('engine.io-parser') ||
                moduleId.includes('socket.io-parser')
              ) {
                return 'socket';
              }
              if (moduleId.includes('marked') || moduleId.includes('dompurify')) return 'markdown';
              if (moduleId.includes('/date-fns/')) return 'date-fns';
              if (moduleId.includes('/axios/')) return 'axios';

              return 'vendor';
            },
          },
        },
      },
      server: {
        proxy: {
          '/api': {
            target: 'http://localhost:3000',
            changeOrigin: true,
          },
          '/socket.io': {
            target: 'http://localhost:3000',
            changeOrigin: true,
            ws: true,
          },
        },
      },
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
      }
    };
});
