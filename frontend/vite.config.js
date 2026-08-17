import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // "" prefix loads every var, not just VITE_-prefixed ones
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      host: true,
      port: Number(env.FRONTEND_PORT),
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://api:${Number(env.API_PORT)}`,
          changeOrigin: true,
        },
      },
      watch: {
        usePolling: true,
      },
    },
  };
});