# Starring — server mode (registration + Postgres). For static hosting you don't need this.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV STARRING_MODE=server
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production STARRING_MODE=server HOST=0.0.0.0 PORT=4321
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/package.json ./package.json
# YAML profiles still work next to DB profiles; mount your own over /app/profiles
COPY --from=build /app/profiles ./profiles
COPY --from=build /app/examples ./examples
# The commit this image was built from (set by .github/workflows/image.yml); shown by /api/health
ARG STARRING_VERSION=dev
ENV STARRING_VERSION=$STARRING_VERSION
# uploads (STORAGE=local) live here; mount a volume over it
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
ENV STORAGE_DIR=/app/data/uploads
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:4321/api/health >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/server/entry.mjs"]
