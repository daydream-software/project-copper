import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative base so the production build works on GitHub Pages regardless of the
  // repo name (project pages serve from /<repo>/, not /).
  base: './',
  server: {
    host: true,
    // Accept <ip>.nip.io hostnames (nip.io resolves <ip>.nip.io -> <ip>), e.g.
    // http://127.0.0.1.nip.io:5173 — the same dev-host convention the rest of the
    // workspace uses.
    allowedHosts: ['.nip.io'],
  },
  preview: {
    host: true,
    allowedHosts: ['.nip.io'],
  },
  test: {
    environment: 'node',
  },
})
