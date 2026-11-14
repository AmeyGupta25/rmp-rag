import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Keep CRA's output folder and env prefix so the existing Vercel project settings still apply.
  build: { outDir: "build" },
  server: { port: 3000 },  // the API's default CORS origin for local dev
  envPrefix: ["VITE_", "REACT_APP_"],
});
