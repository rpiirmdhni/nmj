import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly set root to this project's directory — avoids Turbopack
    // mistaking a parent-level package-lock.json as the workspace root.
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001",
  },
};

export default nextConfig;

