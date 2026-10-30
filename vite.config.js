import { defineConfig } from "vite";
import { normalizeBase } from "./src/paths.js";

export default defineConfig({
  // Keep existing root-domain hosting working. GitHub Actions supplies the project path.
  base: normalizeBase(process.env.VITE_BASE_PATH || "/"),
  build: { target: "safari16.4" },
});
