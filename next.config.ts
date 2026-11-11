import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The create-next-app template turns on `cacheComponents`. It is removed on purpose:
  // with it every page streams a static shell first, so `forbidden()` would answer 200, not 403.
  experimental: {
    // Enables `forbidden()` + `app/forbidden.tsx`: a real HTTP 403 page for logged-in users without access.
    authInterrupts: true,
  },
  // Self-contained server for Docker. It must run as ONE process: users, clients and sessions live in memory.
  output: "standalone",
  // No `X-Powered-By: Next.js` header.
  poweredByHeader: false,
};

export default nextConfig;
