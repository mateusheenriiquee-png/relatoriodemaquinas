import { describe, expect, it, vi } from "vitest";

// Só a leitura/mapeamento de planilha é testada aqui; a gravação em lote é a
// parte que fala com o Firestore e fica de fora.
vi.mock("../../config/firebase", () => ({
  db: {},
  getApiBaseUrl: () => ""
}));

const { diagnosticarRegistros, lerArquivo, lerCsv } = await import("../importExportService");

/** Vira um File como o <input type="file"> entregaria para lerArquivo. */
function arquivoCsv(texto, nome = "planilha.csv") {
  return new File([texto], nome, { type: "text/csv" });
}

describe("lerCsv", () => {
  it("reconhece ponto e vírgula como separador", () => {
    const linhas = lerCsv('Protocolo;Cliente\n"102-005-389";"Fulano"');
    expect(linhas).toEqual([{ Protocolo: "102-005-389", Cliente: "Fulano" }]);
  });

  it("não quebra o campo entre aspas que contém o separador", () => {
    const linhas = lerCsv('Nome,Obs\n"Silva, João","mora em Bauru, SP"');
    expect(linhas[0].Nome).toBe("Silva, João");
    expect(linhas[0].Obs).toBe("mora em Bauru, SP");
  });

  it("mantém a coluna preenchida quando o cabeçalho vem duplicado", () => {
    /*
     * Regressão: o export do Kommo repete "Protocolo do Certificado" e a
     * segunda ocorrência vem sempre vazia. Antes, a última vencia e o dado
     * real era descartado silenciosamente.
     */
    const linhas = lerCsv("ID,Protocolo do Certificado,X,Protocolo do Certificado\n1,ABC123,x,");
    expect(linhas[0]["Protocolo do Certificado"]).toBe("ABC123");
  });

  it("descarta linhas totalmente vazias", () => {
    expect(lerCsv("A,B\n1,2\n,\n3,4")).toHaveLength(2);
  });
});

/* ------------------------------------------------------------ layout Kommo */

const CABECALHO_KOMMO = [
  "ID",
  "Lead título",
  "Lead venda R$",
  "Usuário responsável",
  "Criado em",
  "modificada em",
  "Fechado às",
  "Etapa do lead",
  "Funil de vendas",
  "Nome completo",
  "Pessoa de contato",
  "Telefone comercial",
  "Protocolo do Certificado",
  "Sistema"
].join(",");

function csvKommo(...linhas) {
  return [CABECALHO_KOMMO, ...linhas].join("\n");
}

describe("importação — layout Kommo", () => {
  it("mapeia os campos do lead para o registro de suporte", async () => {
    const csv = csvKommo(
      '53376592,"Autolead: GILMAR",85,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,Gilmar Souza,Yuri,+5511999753721,102-005-389,Consulti'
    );

    const [r] = await lerArquivo(arquivoCsv(csv));

    expect(r.nomeCliente).toBe("Gilmar Souza"); // "Nome completo" manda
    expect(r.responsavelAbertura).toBe("Yuri"); // "Pessoa de contato"
    expect(r.tecnico).toBe("Não atribuído"); // Kommo não traz técnico do sistema
    expect(r.protocolo).toBe("102-005-389"); // "Protocolo do Certificado"
    expect(r.ac).toBe("Consulti"); // "Sistema"
    expect(r.contato).toBe("+5511999753721"); // "Telefone comercial"
    expect(r.status).toBe("FINALIZADO");
    expect(r.kommoLeadId).toBe("53376592");
    expect(r.docId).toBe("kommo_lead_53376592");
    expect(r.origemIntegracao).toBe("kommo");
  });

  it("usa o Lead título sem o prefixo Autolead quando não há Nome completo", async () => {
    const csv = csvKommo(
      '53376592,"Autolead: GILMAR",85,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,,Yuri,+5511999753721,,'
    );

    const [r] = await lerArquivo(arquivoCsv(csv));

    expect(r.nomeCliente).toBe("GILMAR");
  });

  it("cai no Usuário responsável quando Pessoa de contato vem vazia", async () => {
    const csv = csvKommo(
      "53376592,Cliente X,85,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,Cliente X,,+5511999753721,,"
    );

    const [r] = await lerArquivo(arquivoCsv(csv));

    expect(r.responsavelAbertura).toBe("Suporte");
  });

  it("marca venda ganha quando há valor, e não grava o campo quando não há", async () => {
    const comValor = csvKommo(
      "1,Lead A,120,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,Cliente A,Yuri,+551199999,,"
    );
    const semValor = csvKommo(
      "2,Lead B,0,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,Cliente B,Yuri,+551199999,,"
    );

    const [a] = await lerArquivo(arquivoCsv(comValor));
    const [b] = await lerArquivo(arquivoCsv(semValor));

    expect(a.valorVenda).toBe(120);
    expect(a.vendaStatus).toBe("GANHO");
    // Sem valor o campo nem é escrito — no modo mesclar, gravar "" apagaria um
    // "PERDIDO" definido à mão.
    expect(b.valorVenda).toBe(0);
    expect(b).not.toHaveProperty("vendaStatus");
  });

  it("lê a data brasileira com ponto e usa 'modificada em' como encerramento", async () => {
    const csv = csvKommo(
      "1,Lead A,0,Suporte,02.09.2026 14:49:35,03.09.2026 10:00:00,não fechado,FINALIZADO,07 - Funil de Suporte,Cliente A,Yuri,+551199999,,"
    );

    const [r] = await lerArquivo(arquivoCsv(csv));

    // 02.09.2026 é 2 de setembro — não 9 de fevereiro, como o Date nativo leria.
    expect(new Date(r.dataAbertura).getMonth()).toBe(8);
    expect(new Date(r.dataAbertura).getDate()).toBe(2);
    // "Fechado às" = "não fechado" não é data; o encerramento vem de "modificada em".
    expect(new Date(r.dataFinalizacao).getDate()).toBe(3);
  });

  it("traduz a etapa do funil para o status interno", async () => {
    const csv = csvKommo(
      "1,Lead A,0,Suporte,02.09.2026 14:49:35,02.09.2026 15:00:00,não fechado,AGUARDANDO SUPORTE,07 - Funil de Suporte,Cliente A,Yuri,+551199999,,",
      "2,Lead B,0,Suporte,02.09.2026 14:49:35,02.09.2026 15:00:00,não fechado,EM ATENDIMENTO,07 - Funil de Suporte,Cliente B,Yuri,+551199999,,"
    );

    const [a, b] = await lerArquivo(arquivoCsv(csv));

    expect(a.status).toBe("EM ABERTO"); // ninguém pegou ainda
    expect(b.status).toBe("EM ANDAMENTO");
  });
});

/* -------------------------------------------------- layout Central de Chamados */

describe("importação — layout Central de Chamados", () => {
  const cabecalho = [
    "#",
    "Protocolo",
    "Responsável da abertura",
    "Cliente",
    "Telefone",
    "Motivo",
    "Motivo da utilização",
    "Status",
    "Responsável",
    "Aberto em",
    "Encerrado em"
  ].join(";");

  it("lê Cliente como cliente e Responsável como técnico", async () => {
    const csv = [
      cabecalho,
      "167;102-005-389;Dayran;FERRAGISTA SAO FRANCISCO LTDA;+5588920366;Formatou o HD;Instalação;Encerrado com sucesso;Vinicius;12/08/2026 13:24;12/08/2026 13:53"
    ].join("\n");

    const [r] = await lerArquivo(arquivoCsv(csv));

    expect(r.nomeCliente).toBe("FERRAGISTA SAO FRANCISCO LTDA");
    expect(r.responsavelAbertura).toBe("Dayran");
    expect(r.tecnico).toBe("Vinicius");
    expect(r.protocolo).toBe("102-005-389");
    expect(r.status).toBe("FINALIZADO");
  });

  it("lê data com barra no formato brasileiro", async () => {
    const csv = [
      cabecalho,
      "1;102-000-001;Dayran;Cliente;+55;Motivo;Instalação;Encerrado com sucesso;Vinicius;28/08/2026 09:00;28/08/2026 10:00"
    ].join("\n");

    const [r] = await lerArquivo(arquivoCsv(csv));

    // Dia 28 não existe como mês — sem o parser próprio isso viraria data inválida.
    expect(new Date(r.dataAbertura).getDate()).toBe(28);
    expect(new Date(r.dataAbertura).getMonth()).toBe(7);
  });
});

describe("diagnosticarRegistros", () => {
  it("aponta encerramento anterior à abertura como erro", () => {
    const { itens } = diagnosticarRegistros([
      { dataAbertura: "2027-08-12T13:24:00", dataFinalizacao: "2026-08-12T13:53:00" }
    ]);

    const erro = itens.find((i) => i.nivel === "erro");
    expect(erro).toBeDefined();
    expect(erro.quantidade).toBe(1);
  });

  it("não inventa problema quando a planilha está limpa", () => {
    const { itens, total } = diagnosticarRegistros([
      {
        dataAbertura: "2026-08-12T10:00:00",
        dataFinalizacao: "2026-08-12T11:00:00",
        protocolo: "102-000-001",
        tipo: "Instalação",
        ac: "Consulti",
        tecnico: "Vinicius",
        motivoCat: "Instalação"
      }
    ]);

    expect(total).toBe(1);
    expect(itens.filter((i) => i.nivel === "erro")).toHaveLength(0);
  });

  it("devolve zero itens para lista vazia", () => {
    expect(diagnosticarRegistros([])).toEqual({ total: 0, itens: [] });
  });
});
