import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MySQL driver is native Node code; keep it out of the bundler.
  serverExternalPackages: ["mariadb", "@prisma/adapter-mariadb"],
  experimental: {
    serverActions: {
      // Document photos and bills are uploaded through server actions (5 MB each).
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
