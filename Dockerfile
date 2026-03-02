# ---- Stage 1: Build ----
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Prune dev dependencies
RUN pnpm prune --prod

# ---- Stage 2: Runtime ----
FROM node:24-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app

# Copy production dependencies
COPY --from=build /app/node_modules ./node_modules

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

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build"]
