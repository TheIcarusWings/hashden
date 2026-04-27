/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing from sibling workspace packages (TS source).
  transpilePackages: ["@hashden/db", "@hashden/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
