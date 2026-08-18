/**
 * Configuração da aplicação
 * Valores públicos e URLs de endpoints
 */

export const APP_CONFIG = {
  // Firebase Firestore
  FIRESTORE_PROJECT_ID: "suportetecnico-api2",
  FIRESTORE_COLLECTION: "suportes_tecnicos",
  FIRESTORE_USERS_COLLECTION: "usuarios",

  // URLs de API
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL || "http://localhost:3000",
  WEBHOOK_URL: process.env.REACT_APP_WEBHOOK_URL || "http://localhost:3000/webhook/suportes",
  
  // Autenticação
  ENABLE_DEMO_MODE: process.env.REACT_APP_DEMO_MODE === "true",
  ADMIN_EMAIL: process.env.REACT_APP_ADMIN_EMAIL || "admin@suportetecnico.com.br",

  // Paginação
  PAGE_SIZE: 10,
  
  // Status padrão
  DEFAULT_STATUS: "EM ABERTO",
  STATUS_OPTIONS: ["EM ABERTO", "EM ANDAMENTO", "FINALIZADO", "SEM RETORNO", "REAGENDADO"],

  // Timing
  SYNC_INTERVAL: 30000, // 30 segundos
  CONNECTION_TIMEOUT: 5000
};

export default APP_CONFIG;
