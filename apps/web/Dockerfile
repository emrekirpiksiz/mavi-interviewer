# ============================================
# AI INTERVIEW - WEB DOCKERFILE
# ============================================

# Build stage
FROM node:20-alpine AS builder

# pnpm kurulumu
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Workspace dosyalarını kopyala
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json ./

# Package dosyalarını kopyala
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Bağımlılıkları yükle
RUN pnpm install --frozen-lockfile

# Kaynak kodları kopyala
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Shared package'ı build et
RUN pnpm --filter @ai-interview/shared build

# Next.js build (standalone output)
# ARG ile build-time environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SIMLI_API_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_SIMLI_API_KEY=$NEXT_PUBLIC_SIMLI_API_KEY

RUN pnpm --filter web build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user (güvenlik için)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone build dosyalarını kopyala (monorepo yapısını koruyarak)
COPY --from=builder /app/apps/web/.next/standalone ./

# Static dosyaları kopyala (standalone'a dahil değil)
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Public klasörü oluştur (varsa kopyalanır, yoksa boş kalır)
RUN mkdir -p ./apps/web/public

# Ownership ayarla
RUN chown -R nextjs:nodejs /app

USER nextjs

# Port
EXPOSE 2222

ENV PORT=2222
ENV HOSTNAME="0.0.0.0"

# Başlat
CMD ["node", "apps/web/server.js"]
