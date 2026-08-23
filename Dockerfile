# Multi-stage Dockerfile for Druids Multi-Agent System
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json tsconfig.build.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Install all dependencies including devDependencies
RUN npm ci

# Copy source code
COPY . .

# Expose development port
EXPOSE 3000

# Start development server with hot reload
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build

# NODE_ENV must NOT be 'production' here: npm omits devDependencies when it is,
# so TypeScript would be absent and `npm run build` would fail with
# "sh: tsc: not found". The production stage sets NODE_ENV itself, and the prune
# below removes devDependencies from what gets copied out.
RUN npm ci

# Copy source code
COPY . .

# Build the application (tsc, then copy non-TS runtime assets into dist/)
RUN npm run build

# Remove development dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Production stage
FROM node:20-alpine AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S druids && \
    adduser -S druids -u 1001

# Install runtime dependencies only
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built application and dependencies
COPY --from=build --chown=druids:druids /app/dist ./dist
COPY --from=build --chown=druids:druids /app/node_modules ./node_modules
COPY --from=build --chown=druids:druids /app/package*.json ./

# Runtime assets that tsc does not emit. These are read from process.cwd() at
# runtime (PromptSourceResolver -> cwd/prompts, AgentService -> cwd/config), so
# without them prompt composition fails to load its required global base layer
# and silently falls back to the legacy prompt path. SQL migrations are already
# inside dist/ via the build step.
COPY --from=build --chown=druids:druids /app/prompts ./prompts
COPY --from=build --chown=druids:druids /app/config ./config

# Switch to non-root user
USER druids

# Expose production port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start production server
CMD ["node", "dist/index.js"]