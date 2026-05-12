import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev runner (./dev) sets SERVER_PORT; we honour it so overriding ports
// at the script level keeps the proxy pointed at the right backend.
const SERVER_PORT = process.env.SERVER_PORT ?? "3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
