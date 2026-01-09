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
              if (id.includes('@tiptap')) return 'tiptap';
              if (id.includes('@tanstack')) return 'tanstack';
              if (id.includes('socket.io-client')) return 'socket';
              if (id.includes('@iconify')) return 'iconify';
              if (id.includes('marked') || id.includes('dompurify')) return 'markdown';
              if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
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
