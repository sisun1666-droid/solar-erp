import { defineConfig } from "vite";

export default defineConfig({
  base: "/solar-erp/",   // GitHub Pages 배포 경로
  build: {
    outDir: "dist",
    rollupOptions: {
      input: { main: "index.html" },
    },
  },
});
