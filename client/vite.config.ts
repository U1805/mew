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

              if (moduleId.includes('/react/') || moduleId.includes('/react-dom/') || moduleId.includes('/scheduler/')) {
                return 'react-vendor';
              }
              if (moduleId.includes('@tiptap') || moduleId.includes('/prosemirror-')) return 'tiptap';
              if (id.includes('@tanstack')) return 'tanstack';
              if (id.includes('socket.io-client')) return 'socket';
              if (moduleId.includes('engine.io-client') || moduleId.includes('engine.io-parser') || moduleId.includes('socket.io-parser')) return 'socket';
              if (id.includes('@iconify')) return 'iconify';
              if (id.includes('marked') || id.includes('dompurify')) return 'markdown';
              if (moduleId.includes('/date-fns/')) return 'date-fns';
              if (moduleId.includes('/axios/')) return 'axios';
              if (
                moduleId.includes('@radix-ui/') ||
                moduleId.includes('@floating-ui/') ||
                moduleId.includes('react-remove-scroll') ||
                moduleId.includes('@popperjs/core') ||
                moduleId.includes('/tippy.js/')
              ) {
                return 'ui-vendor';
              }
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
