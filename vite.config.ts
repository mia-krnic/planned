import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Project-pages deploys serve from /planned/ (set by the Pages workflow);
  // local dev and plain builds stay at the root.
  base: process.env.GH_PAGES ? '/planned/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    // Dev-time CORS proxy for the university timetable feed.
    // TODO(backend): in production, proxy this through the app's own server.
    proxy: {
      '/tabula': {
        target: 'https://tabula.warwick.ac.uk',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tabula/, ''),
      },
    },
  },
})
