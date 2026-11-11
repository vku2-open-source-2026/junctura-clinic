// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The identity provider only accepts redirects to the registered web port (5181), so the
// dev server uses it and forwards the API to the Clinic server (`PORT=5191 npm run dev:server`).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5181,
    strictPort: true,
    proxy: { "/api": process.env.CLINIC_API ?? "http://127.0.0.1:5191" },
  },
  test: { environment: "node" },
});
