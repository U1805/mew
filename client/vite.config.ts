import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
        return {
      plugins: [react()],
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
