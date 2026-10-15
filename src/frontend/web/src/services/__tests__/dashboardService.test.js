import { describe, expect, it, vi } from "vitest";

/*
 * dashboardService importa o cliente do Supabase. Nada aqui fala com o banco —
 * só os cálculos puros —, então o módulo é substituído por um stub para o
 * import não abrir conexão nenhuma.
 */
vi.mock("../../config/supabase", () => ({
  supabase: {},
  getApiBaseUrl: () => ""
}));

const {
  cruzarContagem,
  duracaoAtendimento,
  emReagendamento,
  mapDashboardDoc,
  matrizDiaHora,
  normalizarSistema,
  normalizarTipoCertificado,
  serieTemporal,
  tempoDeAtendimento,
  tempoDeFila
} = await import("../dashboardService");

const DIA_MS = 86400000;

function registro({ abertura, fim = null, status = "FINALIZADO" }) {
  return {
    dataAbertura: abertura ? new Date(abertura) : null,
    dataFinalizacao: fim ? new Date(fim) : null,
    dataAtualizacao: null,
    status
  };
}

describe("serieTemporal", () => {
  it("agrupa por dia e preenche os dias vazios com zero", () => {
    // Buraco no meio da linha esconderia queda real — o dia sem chamado
    // precisa aparecer como zero, não sumir do eixo.
    const dados = [
      registro({ abertura: "2026-02-01T09:00:00" }),
      registro({ abertura: "2026-02-01T15:00:00" }),
      registro({ abertura: "2026-02-04T09:00:00" })
    ];
    const intervalo = [new Date("2026-02-01T00:00:00").getTime(), new Date("2026-02-05T00:00:00").getTime()];

    const serie = serieTemporal(dados, intervalo);

    expect(serie.labels).toEqual(["01/02", "02/02", "03/02", "04/02"]);
    expect(serie.abertos).toEqual([2, 0, 0, 1]);
  });

  it("conta encerrados no dia do encerramento, não no da abertura", () => {
    const dados = [registro({ abertura: "2026-02-01T09:00:00", fim: "2026-02-03T09:00:00" })];
    const intervalo = [new Date("2026-02-01T00:00:00").getTime(), new Date("2026-02-04T00:00:00").getTime()];

    const serie = serieTemporal(dados, intervalo);

    expect(serie.abertos).toEqual([1, 0, 0]);
    expect(serie.encerrados).toEqual([0, 0, 1]);
  });

  it("não estica o eixo por causa de uma data de abertura no futuro", () => {
    /*
     * Regressão: uma linha da planilha com o ano digitado errado (2027 em vez
     * de 2026) fazia o eixo ir até lá, espremendo os dados reais num pedacinho
     * do gráfico. O fim agora para em "agora", sempre.
     */
    const ontem = new Date(Date.now() - DIA_MS);
    const anoQueVem = new Date(Date.now() + 365 * DIA_MS);

    const serie = serieTemporal([registro({ abertura: ontem }), registro({ abertura: anoQueVem })], null);

    // Sem a trava, seriam ~366 baldes. Com ela, só ontem e hoje.
    expect(serie.labels.length).toBe(2);
  });

  it("devolve série vazia quando não há nenhuma data de abertura", () => {
    expect(serieTemporal([registro({ abertura: null })], null).labels).toEqual([]);
  });
});

describe("matrizDiaHora", () => {
  it("soma as aberturas no cruzamento certo de dia da semana e hora", () => {
    const dados = [
      registro({ abertura: "2026-01-05T09:15:00" }), // segunda, 9h
      registro({ abertura: "2026-01-05T09:45:00" }), // segunda, 9h (mesma célula)
      registro({ abertura: "2026-01-05T14:00:00" }), // segunda, 14h
      registro({ abertura: "2026-01-11T10:00:00" }) // domingo, 10h
    ];

    const matriz = matrizDiaHora(dados);

    expect(matriz[1][9]).toBe(2);
    expect(matriz[1][14]).toBe(1);
    expect(matriz[0][10]).toBe(1);
  });

  it("devolve sempre a grade 7x24 completa, mesmo sem dados", () => {
    const matriz = matrizDiaHora([]);
    expect(matriz.length).toBe(7);
    expect(matriz.every((linha) => linha.length === 24)).toBe(true);
    expect(matriz.flat().every((v) => v === 0)).toBe(true);
  });

  it("ignora registro sem data ou com data inválida", () => {
    const matriz = matrizDiaHora([
      registro({ abertura: null }),
      { dataAbertura: new Date("data-quebrada") },
      registro({ abertura: "2026-01-05T09:00:00" })
    ]);
    expect(matriz.flat().reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("mapDashboardDoc", () => {
  it("converte as datas em Date e normaliza os campos de venda", () => {
    const r = mapDashboardDoc("abc", {
      dataAbertura: "2026-02-01T09:00:00.000Z",
      status: "FINALIZADO",
      vendaStatus: "ganho",
      valorVenda: "119.90"
    });

    expect(r.id).toBe("abc");
    expect(r.dataAbertura).toBeInstanceOf(Date);
    expect(r.vendaStatus).toBe("GANHO");
    expect(r.valorVenda).toBe(119.9);
  });

  it("trata valorVenda ausente como zero em vez de NaN", () => {
    expect(mapDashboardDoc("x", {}).valorVenda).toBe(0);
  });
});

describe("chamado REAGENDADO fora dos tempos", () => {
  const base = {
    dataAbertura: new Date("2026-10-01T10:00:00Z"),
    dataInicioAtendimento: new Date("2026-10-01T12:00:00Z"),
    dataFinalizacao: new Date("2026-10-01T15:00:00Z"),
    dataAtualizacao: null
  };

  it("enquanto REAGENDADO não conta no tempo de fila, de atendimento nem de conclusão", () => {
    const r = { ...base, status: "REAGENDADO" };
    expect(emReagendamento(r)).toBe(true);
    expect(tempoDeFila(r)).toBeNull();
    expect(tempoDeAtendimento(r)).toBeNull();
    expect(duracaoAtendimento(r)).toBeNull();
  });

  it("ao voltar para EM ABERTO / ao ser finalizado, conta normalmente", () => {
    expect(tempoDeFila({ ...base, status: "EM ABERTO" })).toBe(2);
    expect(tempoDeFila({ ...base, status: "EM ANDAMENTO" })).toBe(2);
    const fin = { ...base, status: "FINALIZADO" };
    expect(emReagendamento(fin)).toBe(false);
    expect(tempoDeAtendimento(fin)).toBe(3);
    expect(duracaoAtendimento(fin)).not.toBeNull();
  });
});

describe("tempo reagendado descontado", () => {
  const r = {
    status: "FINALIZADO",
    dataAbertura: new Date("2026-10-01T10:00:00Z"),
    dataInicioAtendimento: new Date("2026-10-01T11:00:00Z"),
    dataFinalizacao: new Date("2026-10-01T20:00:00Z"),
    dataAtualizacao: null,
    // assumido às 11h, reagendado das 12h às 18h, finalizado às 20h
    periodosReagendado: [{ de: "2026-10-01T12:00:00Z", ate: "2026-10-01T18:00:00Z" }]
  };

  it("sai do tempo de atendimento e de conclusão", () => {
    expect(tempoDeAtendimento(r)).toBe(3);
    expect(duracaoAtendimento(r)).toBe(3);
  });

  it("reagendado antes de alguém assumir sai da fila", () => {
    const fila = { ...r, dataInicioAtendimento: new Date("2026-10-01T19:00:00Z") };
    expect(tempoDeFila(fila)).toBe(3);
  });

  it("o mapeador lê os períodos do banco", () => {
    expect(mapDashboardDoc("x", { periodosReagendado: [{ de: "a", ate: "b" }] }).periodosReagendado).toHaveLength(1);
    expect(mapDashboardDoc("x", {}).periodosReagendado).toEqual([]);
  });
});

describe("de onde vem o suporte: sistema e tipo de certificado (09/10)", () => {
  it("sistema: o da finalização e, sem ele, o AC do cadastro", () => {
    expect(normalizarSistema("Consulti")).toBe("Consulti");
    expect(normalizarSistema("", "CONSULTI")).toBe("Consulti");
    expect(normalizarSistema("", "validcertificadora")).toBe("Valid");
    expect(normalizarSistema("Soluti", "Valid")).toBe("Soluti");
    expect(normalizarSistema("", "")).toBe("Não informado");
  });

  it("tipo de certificado: as várias formas viram a forma da Certify", () => {
    expect(normalizarTipoCertificado("A1 PJ")).toBe("PJ A1");
    expect(normalizarTipoCertificado("A1 CNPJ")).toBe("PJ A1");
    expect(normalizarTipoCertificado("e-CNPJ A1")).toBe("PJ A1");
    expect(normalizarTipoCertificado("PF A3 EM NUVEM")).toBe("PF A3 EM NUVEM");
    expect(normalizarTipoCertificado("")).toBe("Não informado");
  });

  it("o mapeador do dashboard traz sistema e tipo normalizados", () => {
    const r = mapDashboardDoc("x", { ac: "CONSULTI", tipoCertificado: "A1 CNPJ" });
    expect(r.sistema).toBe("Consulti");
    expect(r.tipoCertificado).toBe("PJ A1");
  });

  it("motivo × sistema: contagem cruzada, maiores primeiro", () => {
    const lista = [
      { m: "Instalação A1", s: "Consulti" }, { m: "Instalação A1", s: "Consulti" },
      { m: "Instalação A1", s: "Valid" }, { m: "Alteração de senha", s: "Consulti" }
    ];
    const t = cruzarContagem(lista, (r) => r.m, (r) => r.s);
    expect(t.linhas).toEqual(["Instalação A1", "Alteração de senha"]);
    expect(t.colunas).toEqual(["Consulti", "Valid"]);
    expect(t.valor("Instalação A1", "Consulti")).toBe(2);
    expect(t.valor("Alteração de senha", "Valid")).toBe(0);
    expect(t.total("Instalação A1")).toBe(3);
  });
});
