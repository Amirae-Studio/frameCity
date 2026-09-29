import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Cloudflare R2 public dev URLs  (https://pub-<token>.r2.dev)
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      // Cloudflare R2 storage endpoint  (https://<account>.r2.cloudflarestorage.com)
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
