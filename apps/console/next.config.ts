import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    const hub = process.env.HUB_URL || "http://127.0.0.1:8787";
    return [{ source: "/api/:path*", destination: `${hub}/api/:path*` }];
  },
};

export default nextConfig;
