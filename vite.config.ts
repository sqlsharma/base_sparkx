import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/base_sparkx/",
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
});
