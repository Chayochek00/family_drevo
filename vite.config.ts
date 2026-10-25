import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For https://USERNAME.github.io/REPO/ set VITE_BASE_PATH=/REPO/ in GitHub Actions.
// Locally the base is /.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
});