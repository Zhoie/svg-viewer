import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
