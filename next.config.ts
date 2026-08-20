import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
      images: {
    unoptimized: true,
  },


  async redirects() {
    return [
      {
        // 301 Redirect for the single broken 404 URL identified in Ahrefs
        source: "/the-new-scarcity-economy-macro-crisis",
        destination: "/", // Redirects permanently to the homepage
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
