import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // The phone opens this dev server by Tailscale IP. Without this, Next
  // blocks the page script, so the login form reloads instead of signing in.
  allowedDevOrigins: ["100.*.*.*", "*.ts.net"],
  async rewrites() {
    const hub = process.env.HUB_URL || "http://127.0.0.1:8797";
    return [{ source: "/api/:path*", destination: `${hub}/api/:path*` }];
  },
};

export default nextConfig;
