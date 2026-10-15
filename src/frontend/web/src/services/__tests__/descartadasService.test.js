import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/supabase", () => ({ supabase: {}, getApiBaseUrl: () => "" }));

const { mapDescartada, MOTIVO_DESCARTE } = await import("../descartadasService");

describe("possíveis pedidos de suporte (09/10)", () => {
  it("linha do banco vira o item da lista", () => {
    const item = mapDescartada({
      id: "a1",
      criado_em: "2026-10-09T12:00:00Z",
      atualizado_em: "2026-10-09T13:00:00Z",
      kommo_lead_id: "50875918",
      kommo_talk_id: "26128",
      nome: "Cantinho do Sossego",
      mensagem: "não achei a chave",
      motivo: "sem_palavra_chave",
      resumo_ia: "",
      status: "pendente"
    });
    expect(item).toMatchObject({ id: "a1", leadId: "50875918", nome: "Cantinho do Sossego", motivo: "sem_palavra_chave", atualizadoEm: "2026-10-09T13:00:00Z" });
  });

  it("sem data de atualização usa a de criação; campos ausentes ficam vazios", () => {
    const item = mapDescartada({ id: "b", criado_em: "2026-10-09T10:00:00Z", mensagem: "x", motivo: "ia_nao_suporte" });
    expect(item.atualizadoEm).toBe("2026-10-09T10:00:00Z");
    expect(item.leadId).toBe("");
    expect(item.status).toBe("pendente");
  });

  it("os dois motivos têm texto para a tela", () => {
    expect(MOTIVO_DESCARTE.sem_palavra_chave).toBe("Sem palavra-chave");
    expect(MOTIVO_DESCARTE.ia_nao_suporte).toMatch(/IA/);
  });
});
