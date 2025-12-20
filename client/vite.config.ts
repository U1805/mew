import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
        return {
      plugins: [react()],
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
      }
    };
});