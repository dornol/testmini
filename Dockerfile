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
# Dummy env vars for SvelteKit postbuild analyse (not used at runtime)
RUN DATABASE_URL="postgres://build:build@localhost:5432/build" \
    BETTER_AUTH_SECRET="build-only-dummy-secret-not-used-at-runtime" \
    ORIGIN="http://localhost:3000" \
    pnpm build

# ---- Stage 3: Production dependencies ----
FROM node:24-alpine AS prod-deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ---- Stage 4: Runtime ----
FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.source="https://github.com/dornol/testmini"

# tini for proper PID 1 signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy production-only dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

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
