# ---- Stage 1: Dependencies ----
FROM node:24-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy only dependency manifests for optimal layer caching
COPY package.json pnpm-lock.yaml ./

# Mount pnpm store as cache to speed up repeated builds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM deps AS build

COPY . .
RUN pnpm build

# Use pnpm deploy to create a minimal production-only node_modules
# (more efficient than install + prune: copies only prod deps, no symlinks)
RUN pnpm deploy --prod --filter=testmini /app/prod

# ---- Stage 3: Runtime ----
FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.source="https://github.com/dornol/testmini"

# tini for proper PID 1 signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy production-only dependencies (from pnpm deploy)
COPY --from=build /app/prod/node_modules ./node_modules

# Copy build output (adapter-node)
COPY --from=build /app/build ./build

# Copy drizzle migrations for runtime migration
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/package.json ./package.json

# Create data directory for file uploads
RUN mkdir -p data/uploads && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use node for health check instead of installing wget/curl
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build"]
