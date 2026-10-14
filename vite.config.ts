import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/sqlsharma.github.io",
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
});
