# ============================================
# AI INTERVIEW - API DOCKERFILE
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
COPY apps/api/package.json ./apps/api/

# Bağımlılıkları yükle
RUN pnpm install --frozen-lockfile

# Kaynak kodları kopyala
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Shared package'ı build et
RUN pnpm --filter @ai-interview/shared build

# API'yi build et
RUN pnpm --filter api build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# ffmpeg kurulumu (audio recording: chunk birleştirme + MP3 encode)
RUN apk add --no-cache ffmpeg

# pnpm kurulumu (production için)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Production environment
ENV NODE_ENV=production

# Workspace dosyalarını kopyala
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json ./

# Package.json'ları kopyala
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Sadece production bağımlılıklarını yükle
RUN pnpm install --frozen-lockfile --prod

# Build edilmiş dosyaları kopyala
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Migrations dosyalarını kopyala (runtime'da gerekli olabilir)
COPY apps/api/migrations ./apps/api/migrations

# Port
EXPOSE 2223

# Başlat
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
