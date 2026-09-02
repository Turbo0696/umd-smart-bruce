import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-pptx-parser -> unzipper has an optional @aws-sdk/client-s3
  // require() (only used for reading zips from S3, which we never do)
  // that the bundler otherwise tries and fails to resolve statically.
  serverExternalPackages: ["node-pptx-parser", "unzipper"],
};

export default nextConfig;
