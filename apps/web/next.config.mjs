/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing from sibling workspace packages (TS source).
  transpilePackages: ["@hashden/db", "@hashden/nostr", "@hashden/shared"],
  experimental: {
    typedRoutes: true,
  },
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
