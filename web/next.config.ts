import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      // qrcode uses canvas on server; exclude it since QRDisplay is client-only
      config.externals = [...(config.externals ?? []), "canvas"];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      // Supabase storage (moment photos, avatars)
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Apple Music artwork
      {
        protocol: "https",
        hostname: "*.mzstatic.com",
      },
      {
        protocol: "https",
        hostname: "is1-ssl.mzstatic.com",
      },
    ],
  },
};

export default nextConfig;
