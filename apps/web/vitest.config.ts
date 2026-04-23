import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Load .env.test into process.env before vitest starts workers
const envTestPath = path.resolve(__dirname, ".env.test");
if (fs.existsSync(envTestPath)) {
  for (const line of fs.readFileSync(envTestPath, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const [, k, v] = match;
      if (!process.env[k.trim()]) process.env[k.trim()] = v.trim();
    }
  }
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    pool: "forks",
    fileParallelism: false,
    alias: {
      "@roy/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
