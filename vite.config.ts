/// <reference types="vitest/config" />
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Routes of the single-page app (see src/shared/router.ts and src/apps.ts). The build writes a
 * copy of index.html at each one, so a static host (GitHub Pages) serves the app at every URL
 * without redirects. 404.html covers anything else, and the app sends it to the landing page.
 */
const ROUTES = ['mailmerge', 'mailmerge/review', 'credentials']

function routeCopies(routes: string[]): Plugin {
  return {
    name: 'route-copies',
    apply: 'build',
    async writeBundle({ dir = 'dist' }) {
      const index = join(dir, 'index.html')
      for (const route of routes) {
        await mkdir(join(dir, route), { recursive: true })
        await copyFile(index, join(dir, route, 'index.html'))
      }
      await copyFile(index, join(dir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Absolute base path, because pages live at different depths. The deploy sets it from the
  // GitHub Pages URL (e.g. "/tools/"); in development the site is served at "/".
  base: process.env.BASE_PATH || '/',
  plugins: [react(), routeCopies(ROUTES)],
  test: {
    // DOMParser (plain text of the emails) and localStorage.
    environment: 'happy-dom',
  },
})
