import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * Bibliotecas grandes em chunks próprios: elas quase nunca mudam, então
         * separá-las faz o navegador reaproveitar o cache entre deploys em vez
         * de rebaixar meio megabyte a cada correção de uma linha nossa.
         */
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          chartjs: ["chart.js/auto"]
        }
      }
    }
  },
  test: {
    // Os módulos testados são cálculo puro (métricas, séries, leitura de
    // planilha) — nenhum toca DOM, então o ambiente node basta e roda bem mais
    // rápido que jsdom.
    environment: "node",
    include: ["src/**/*.test.js"]
  }
});
