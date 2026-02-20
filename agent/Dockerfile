# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 agent && adduser -u 1001 -G agent -s /bin/sh -D agent

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist

USER agent
EXPOSE 8080

# Graceful shutdown via dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
