/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // DB 드라이버는 번들하지 않고 node_modules에서 그대로 불러온다 (PGlite는 WASM 포함)
    serverComponentsExternalPackages: ["postgres", "@electric-sql/pglite"],
  },
};

export default nextConfig;
