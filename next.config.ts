import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HOSTED:
      process.env.COMMONPLACE_HOSTED === "1" || process.env.VERCEL === "1"
        ? "1"
        : "0",
  },
  serverExternalPackages: ["@tursodatabase/serverless"],
  webpack(config, { webpack }) {
    const runtimes: Record<string, string> = {
      "cloudflare:workers": "lib/hosted/runtime-env.ts",
      "virtual:commonplace-preview": "lib/hosted/runtime-preview.ts",
      "virtual:commonplace-story": "lib/hosted/runtime-story.ts",
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^(cloudflare:workers|virtual:commonplace-preview|virtual:commonplace-story)$/,
        (resource: { request: string }) => {
          resource.request = path.resolve(runtimes[resource.request]);
        },
      ),
    );
    return config;
  },
};
export default nextConfig;
