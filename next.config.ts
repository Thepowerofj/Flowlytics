import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone in Linux/CI Docker builds: OUTPUT_STANDALONE=1
  ...(process.env.OUTPUT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["nodemailer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
