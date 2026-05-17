import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Turbopack ignores per-worktree lockfiles
    // under `.claude/worktrees/*` and stops warning about multiple lockfiles.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
