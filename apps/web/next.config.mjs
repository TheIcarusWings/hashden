/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output bundles every runtime dep into .next/standalone/
  // so the production image needs only Node + that dir (~150 MB total)
  // instead of shipping the whole monorepo (~1.7 GB).
  output: "standalone",
  // Standalone traces files starting from the workspace root, not the
  // app dir, so it picks up workspace-package source it needs.
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  // Allow importing from sibling workspace packages (TS source).
  transpilePackages: ["@hashden/db", "@hashden/nostr", "@hashden/shared"],
  typedRoutes: true,
  // Workspace packages use NodeNext-style `.js` import extensions
  // (required for Node ESM); webpack needs this alias to map them back
  // to `.ts` source when bundling them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
