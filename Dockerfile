FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend
RUN bun run build

# Runtime
ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "run", "server/index.ts"]
