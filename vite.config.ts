import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // StyleX の babel 設定は babel.config.js（postcss plugin と共用）
  plugins: [react({ babel: { configFile: true } })],
  resolve: { alias: { "@": `${import.meta.dirname}/src` } }, // tsconfig paths / babel.config.js aliases と揃える
  server: {
    // 実機検証: tailscale serve 経由の Host ヘッダを許可（先頭 . はサフィックス一致）
    allowedHosts: [".ts.net"],
    proxy: {
      "/gh": { target: "http://localhost:8989", rewrite: (p) => p.replace(/^\/gh/, "") },
    },
  },
  test: { passWithNoTests: true },
});
