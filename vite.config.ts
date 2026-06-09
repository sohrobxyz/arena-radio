import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages repo path: username.github.io/arena-radio/
export default defineConfig({
  plugins: [react()],
  base: "/arena-radio/",
});
