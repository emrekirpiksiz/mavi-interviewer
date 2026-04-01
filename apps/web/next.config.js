/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ai-interview/shared'],
  
  // Railway deployment için standalone output
  output: 'standalone',
  
  // Environment variables'ın build time'da kullanılması için
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_SIMLI_API_KEY: process.env.NEXT_PUBLIC_SIMLI_API_KEY,
    NEXT_PUBLIC_SIMLI_FACE_ID: process.env.NEXT_PUBLIC_SIMLI_FACE_ID,
  },
};

module.exports = nextConfig;
