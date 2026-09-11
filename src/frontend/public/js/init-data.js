/**
 * Script para Inicializar Dados no Firestore
 * Execute este código no console do navegador (F12) quando estiver na página index.html
 */

// Função para criar dados de teste
async function initializeTestData() {
  try {
    console.log("[Init] Iniciando populacao de dados de teste...");
    
    // Importar necessario (ja disponivel no app.js)
    // const { db } = await import("./config/firebase.js");
    // const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
    
    const testRecords = [
      {
        protocolo: "2024001",
        cpfCnpj: "12345678901",
        responsavelAbertura: "João Silva",
        dataAbertura: "2024-01-15",
        tipo: "Instalacao",
        ac: "AC-001",
        contato: "joao@example.com",
        descricao: "Solicitacao de instalacao de novo equipamento",
        tecnico: "MATHEUS",
        status: "FINALIZADO",
        statusAbertura: "DEVIDO"
      },
      {
        protocolo: "2024002",
        cpfCnpj: "98765432100",
        responsavelAbertura: "Maria Santos",
        dataAbertura: "2024-01-18",
        tipo: "Reparo",
        ac: "AC-002",
        contato: "maria@example.com",
        descricao: "Reparo de equipamento com problemas",
        tecnico: "HENRIQUE",
        status: "EM ANDAMENTO",
        statusAbertura: "DEVIDO"
      },
      {
        protocolo: "2024003",
        cpfCnpj: "55544433322",
        responsavelAbertura: "Pedro Costa",
        dataAbertura: "2024-01-20",
        tipo: "Manutencao",
        ac: "AC-001",
        contato: "pedro@example.com",
        descricao: "Manutencao preventiva de sistema",
        tecnico: "VICTOR",
        status: "EM ABERTO",
        statusAbertura: "DEVIDO"
      },
      {
        protocolo: "2024004",
        cpfCnpj: "11222333444",
        responsavelAbertura: "Ana Paula",
        dataAbertura: "2024-01-22",
        tipo: "Suporte",
        ac: "AC-003",
        contato: "ana@example.com",
        descricao: "Suporte tecnico remoto",
        tecnico: "ISABELE",
        status: "FINALIZADO",
        statusAbertura: "DEVIDO"
      },
      {
        protocolo: "2024005",
        cpfCnpj: "99888777666",
        responsavelAbertura: "Carlos Mendes",
        dataAbertura: "2024-01-25",
        tipo: "Instalacao",
        ac: "AC-002",
        contato: "carlos@example.com",
        descricao: "Instalacao de nova infraestrutura",
        tecnico: "MATHEUS",
        status: "REAGENDADO",
        statusAbertura: "DEVIDO"
      }
    ];

    console.log(`[Init] Adicionando ${testRecords.length} registros de teste...`);
    
    // Aqui seria necessario estar no contexto da aplicacao com db ja inicializado
    // Para agora, apenas log
    console.log("[Init] Registros de teste:", testRecords);
    console.log("[Init] ✅ Dados prontos para serem inseridos manualmente no Firestore");
    
    return testRecords;
  } catch (error) {
    console.error("[Init] ❌ Erro:", error);
    throw error;
  }
}

// Exportar para uso no console
window.initializeTestData = initializeTestData;

console.log("=== INICIALIZACAO DE DADOS ===");
console.log("Execute no console: initializeTestData()");
