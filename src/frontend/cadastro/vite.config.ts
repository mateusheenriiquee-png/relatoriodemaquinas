import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos no build: o cadastro pode ser publicado numa subpasta
  // (ex.: /cadastro/) sem precisar saber o endereço final na hora de compilar.
  base: "./",
  server: {
    // 5173 é o painel principal; os dois rodam juntos em desenvolvimento.
    port: 5174,
    // Os estilos vêm de ../web/src/styles (fora da raiz deste projeto).
    fs: { allow: ["../.."] }
  },
  build: {
    rollupOptions: {
      output: {
        // O SDK é grande e quase nunca muda: em arquivo próprio, o navegador
        // reaproveita o cache entre deploys.
        manualChunks: { supabase: ["@supabase/supabase-js"] }
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
