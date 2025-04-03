import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      treeshake: "smallest",
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
