import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const useTunnel = true;
  const odooUrl = process.env.VITE_ODOO_URL || 'http://localhost:8069';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      ...(useTunnel
        ? {
            allowedHosts: ['biotechnology-richards-equation-golden.trycloudflare.com'],
            hmr: { clientPort: 443, protocol: 'wss' },
          }
        : {}),
      proxy: {
        '/odoo': {
          target: odooUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/odoo/, ''),
        },
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});