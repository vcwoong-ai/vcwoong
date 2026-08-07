/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static optimization for pages using server session
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
    // pdf-parse(pdfjs-dist)가 DOMMatrix/ImageData 폴리필용으로 로드하는
    // @napi-rs/canvas는 네이티브(.node) 바이너리라 webpack이 번들링할 수
    // 없다. 여기서 external로 빼야 @vercel/nft가 실제 require() 경로를
    // 추적해 배포 번들에 포함시킨다 — 그렇지 않으면 웹팩 번들 안에 조용히
    // 딸려 들어가려다 실패해서, 프로덕션에서만 "DOMMatrix is not defined"로
    // PDF 파싱이 죽는다(로컬 빌드/개발 환경은 node_modules가 그대로 있어
    // 재현되지 않음).
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "@napi-rs/canvas",
    ],
    // @napi-rs/canvas는 pdf-parse 번들 내부에서 조건부 require()로 로드되기
    // 때문에 @vercel/nft가 정적 분석만으로는 찾지 못한다 — 네이티브(.node)
    // 바이너리를 명시적으로 강제 포함시켜야 배포 번들에 실제로 실린다.
    outputFileTracingIncludes: {
      "/api/upload": [
        "./node_modules/@napi-rs/canvas/**/*",
        "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
        "./node_modules/@napi-rs/canvas-linux-x64-musl/**/*",
      ],
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
