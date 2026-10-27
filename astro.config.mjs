import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// Two modes, one codebase:
//   STARRING_MODE=static (default) — YAML profiles, static HTML, GitHub Pages / any static host
//   STARRING_MODE=server           — Node server + Postgres: registration, profiles in the DB
const MODE = process.env.STARRING_MODE === 'server' ? 'server' : 'static';

// Server-only routes live in src/server/ and are injected only in server mode,
// so the static build never sees endpoints that need a request.
const serverRoutes = () => ({
  name: 'starring-server-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (MODE !== 'server') return;
      const routes = {
        '/api/auth/[...all]': 'src/server/routes/auth.ts',
        '/api/me': 'src/server/routes/me.ts',
        '/api/health': 'src/server/routes/health.ts',
        '/api/me/export': 'src/server/routes/export.ts',
        '/api/profile': 'src/server/routes/profile.ts',
        '/api/handle': 'src/server/routes/handle.ts',
        '/login': 'src/server/routes/login.astro',
        '/account': 'src/server/routes/account.astro',
        '/forgot-password': 'src/server/routes/forgot-password.astro',
        '/reset-password': 'src/server/routes/reset-password.astro',
        '/oembed': 'src/server/routes/oembed.ts',
        '/api/import/github': 'src/server/routes/import-github.ts',
        '/api/import/cv': 'src/server/routes/import-cv.ts',
        '/api/discover': 'src/server/routes/discover.ts',
        '/api/upload/photo': 'src/server/routes/upload-photo.ts',
        '/media/[...key]': 'src/server/routes/media.ts',
        '/api/report': 'src/server/routes/api-report.ts',
        '/api/access': 'src/server/routes/api-access.ts',
        '/api/domain': 'src/server/routes/api-domain.ts',
        '/api/domain/allowed': 'src/server/routes/domain-allowed.ts',
        '/api/digest': 'src/server/routes/api-digest.ts',
        '/api/digest/unsubscribe': 'src/server/routes/digest-unsubscribe.ts',
        '/api/admin': 'src/server/routes/api-admin.ts',
        '/report': 'src/server/routes/report.astro',
        '/admin': 'src/server/routes/admin.astro',
      };
      for (const [pattern, entrypoint] of Object.entries(routes)) injectRoute({ pattern, entrypoint });
    },
  },
});

// GitHub Pages sets these in .github/workflows/pages.yml:
//   SITE_URL  = https://<user>.github.io        (or your custom domain)
//   BASE_PATH = /<repo>   for project pages,  /  for <user>.github.io or a custom domain
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  output: MODE,
  adapter: MODE === 'server' ? node({ mode: 'standalone' }) : undefined,
  integrations: [react(), serverRoutes()],
  vite: {
    define: { 'import.meta.env.STARRING_MODE': JSON.stringify(MODE) },
  },
});
