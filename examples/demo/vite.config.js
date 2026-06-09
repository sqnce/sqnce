import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base matches the GitHub Pages project path: sqnce.github.io/sqnce/
export default defineConfig({
  base: "/sqnce/",
  plugins: [react()],
});
