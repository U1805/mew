import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
      }
    };
});