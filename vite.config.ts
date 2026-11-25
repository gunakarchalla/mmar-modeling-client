import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT ?? "8085"),
    host: true,
  },
  preview: {
    port: parseInt(process.env.PORT ?? "8085"),
    host: true,
  },
  resolve: {
    alias: {
      "@gds": path.resolve(import.meta.dirname, "../mmar-global-data-structure"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
