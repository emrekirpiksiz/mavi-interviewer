#!/usr/bin/env bash
# ============================================
# API servisini Railway'e deploy et (CLI)
# ============================================
# Kullanım: ./scripts/deploy-api.sh
#
# İlk kez kullanıyorsan (bir kerelik):
#   1. railway login
#   2. railway link  → Proje: ai-interview, Servis: api
set -e
cd "$(dirname "$0")/.."

if ! command -v railway &>/dev/null; then
  echo "Railway CLI yüklü değil. Kur: brew install railway"
  exit 1
fi

echo "Deploying api to Railway..."
railway up

echo "Deploy tetiklendi. Railway dashboard'dan ilerlemeyi takip edebilirsin."
