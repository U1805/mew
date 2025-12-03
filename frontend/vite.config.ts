import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
      }
    };
});