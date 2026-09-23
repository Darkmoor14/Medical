import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  build: { target: "es2022" },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
} as never);
