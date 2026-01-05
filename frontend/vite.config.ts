import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3004,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://druids-main:3000',
        changeOrigin: true
      },
      '/mcp': {
        target: process.env.VITE_MCP_URL || 'http://druids-mcp-server:3003',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})