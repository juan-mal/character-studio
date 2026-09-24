import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { studioAssetsPlugin } from "./tools/studio/asset-server.ts";

export default defineConfig({
  plugins: [react(), studioAssetsPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/.tools/**", "**/reports/**"], awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 25 } },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: {
    target: "es2022",
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("/three/") || id.includes("\\three\\"))
            return "three";
          if (/[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
});
