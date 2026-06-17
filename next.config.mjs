/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static optimization for pages using server session
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  // Required for pdf-parse - it tries to read test files
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "canvas"];
    }
    return config;
  },
};

export default nextConfig;
