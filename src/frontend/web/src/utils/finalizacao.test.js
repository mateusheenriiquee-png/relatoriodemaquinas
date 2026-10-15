import { describe, expect, it } from "vitest";
import { CAMPOS_DA_IA, casarOpcao, mesclarPrefill, parseValor, rotuloFonte, situacaoParaIA, validarFinalizacao } from "./finalizacao";

const valido = {
  emailCliente: "cliente@exemplo.com",
  comprouOutroProduto: false,
  protocoloCertificado: "123456",
  cpfCnpj: "123.456.789-01",
  dataEmissao: "2026-09-23",
  dataVencimento: "2027-09-23",
  tipoCertificado: "e-CPF A1",
  valor: "150,00",
  validadeEstendida: "2 anos",
  sistema: "VALID"
};

describe("finalização do suporte", () => {
  it("valor no formato brasileiro", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("R$ 150")).toBe(150);
    expect(parseValor("150.5")).toBe(150.5);
    expect(parseValor("abc")).toBeNaN();
    expect(parseValor("")).toBeNaN();
  });

  it("formulário completo passa", () => {
    expect(validarFinalizacao(valido)).toEqual({});
  });

  it("nenhum campo é obrigatório: formulário vazio passa", () => {
    const vazio = Object.fromEntries(Object.keys(valido).map((k) => [k, k === "comprouOutroProduto" ? null : ""]));
    expect(validarFinalizacao(vazio)).toEqual({});
  });

  it("vencimento sozinho, sem emissão, é aceito", () => {
    expect(validarFinalizacao({ ...valido, dataEmissao: "", dataVencimento: "2027-09-24" })).toEqual({});
  });

  it("Valor V.E é opcional, mas se preenchido precisa ser um valor", () => {
    expect(validarFinalizacao({ ...valido, valorVE: "" }).valorVE).toBeUndefined();
    expect(validarFinalizacao({ ...valido, valorVE: "49,90" }).valorVE).toBeUndefined();
    expect(validarFinalizacao({ ...valido, valorVE: "abc" }).valorVE).toBeDefined();
  });

  it("validade aceita as opções vindas do Kommo no lugar da lista padrão", () => {
    const validades = ["Sem V.E", "1 ano", "2 anos"];
    expect(validarFinalizacao({ ...valido, validadeEstendida: "Sem V.E" }, { validades })).toEqual({});
    expect(validarFinalizacao({ ...valido, validadeEstendida: "3 anos" }, { validades }).validadeEstendida).toBeDefined();
  });

  it("o que for preenchido em formato errado continua apontado", () => {
    const erros = validarFinalizacao({
      ...valido,
      emailCliente: "sem-arroba",
      cpfCnpj: " ",
      dataVencimento: "2026-01-01",
      valor: "x",
      validadeEstendida: "5 anos",
      sistema: " "
    });
    expect(Object.keys(erros).sort()).toEqual(["dataVencimento", "emailCliente", "validadeEstendida", "valor"]);
  });
});

describe("pré-preenchimento da finalização", () => {
  const vazio = {
    emailCliente: "",
    comprouOutroProduto: null,
    protocoloCertificado: "",
    cpfCnpj: "",
    dataEmissao: "",
    dataVencimento: "",
    tipoCertificado: "",
    valor: "",
    valorVE: "",
    validadeEstendida: "",
    sistema: ""
  };
  const opcoes = { sistema: ["Soluti", "Consulti", "Valid"], validade_estendida: ["1 ano", "2 anos", "3 anos"] };

  it("preenche campos vazios no formato da tela e guarda a fonte", () => {
    const { form, fontes } = mesclarPrefill(
      vazio,
      {
        protocoloCertificado: { valor: "102-856-427", fonte: "conversa", sugerido: false },
        valor: { valor: 199.8, fonte: "kommo", sugerido: true },
        comprouOutroProduto: { valor: false, fonte: "kommo" },
        sistema: { valor: "consulti", fonte: "conversa", sugerido: true },
        dataVencimento: { valor: "2027-09-24", fonte: "dedução", sugerido: true }
      },
      { opcoes }
    );
    expect(form.protocoloCertificado).toBe("102-856-427");
    expect(form.valor).toBe("199,80");
    expect(form.comprouOutroProduto).toBe(false);
    expect(form.sistema).toBe("Consulti");
    expect(form.dataVencimento).toBe("2027-09-24");
    expect(fontes.valor).toEqual({ fonte: "kommo", sugerido: true });
  });

  it("nunca sobrescreve o que já está preenchido nem o que o técnico mexeu", () => {
    const { form, fontes } = mesclarPrefill(
      { ...vazio, protocoloCertificado: "111", cpfCnpj: "" },
      {
        protocoloCertificado: { valor: "222", fonte: "kommo" },
        cpfCnpj: { valor: "054.623.245-02", fonte: "kommo" }
      },
      { editados: new Set(["cpfCnpj"]) }
    );
    expect(form.protocoloCertificado).toBe("111");
    expect(form.cpfCnpj).toBe("");
    expect(fontes).toEqual({});
  });

  it("opção que não existe na lista do Kommo não entra; campo desconhecido é ignorado", () => {
    const { form } = mesclarPrefill(
      vazio,
      { sistema: { valor: "AC Estranha", fonte: "foto" }, campoInventado: { valor: "x", fonte: "foto" } },
      { opcoes }
    );
    expect(form.sistema).toBe("");
    expect("campoInventado" in form).toBe(false);
  });

  it("casarOpcao e rótulos", () => {
    expect(casarOpcao("pf a1", ["PF A1", "PJ A1"])).toBe("PF A1");
    expect(casarOpcao("x", ["PF A1"])).toBe("");
    expect(casarOpcao("x", [])).toBe("x");
    expect(rotuloFonte({ fonte: "kommo" })).toBe("Kommo");
    expect(rotuloFonte({ fonte: "foto", sugerido: true })).toBe("foto · confira");
  });
});

describe("quando acionar a IA", () => {
  const cheio = {
    emailCliente: "a@b.com", comprouOutroProduto: false, protocoloCertificado: "1", cpfCnpj: "054.623.245-02", cpf: "054.623.245-02",
    dataEmissao: "2026-09-24", dataVencimento: "2027-09-24", tipoCertificado: "PJ A1", valor: "80,00",
    valorVE: "", validadeEstendida: "1 ano", sistema: "Valid"
  };

  it("tudo preenchido (menos o V.E opcional) -> não chama", () => {
    const r = situacaoParaIA(cheio);
    expect(r.vale).toBe(false);
    expect(r.jaPreenchidos).not.toContain("valorVE");
  });

  it("faltando só o CPF -> chama a IA (procura no RG/CNH)", () => {
    expect(situacaoParaIA({ ...cheio, cpf: "" }).vale).toBe(true);
  });

  it("faltando um campo -> chama e manda o que já tem", () => {
    const r = situacaoParaIA({ ...cheio, dataVencimento: "" });
    expect(r.vale).toBe(true);
    expect(r.jaPreenchidos).toContain("protocoloCertificado");
    expect(r.jaPreenchidos).not.toContain("dataVencimento");
  });
});

describe("CPF próprio na finalização (08/10)", () => {
  it("CPF preenchido precisa ser válido; vazio pode", () => {
    expect(validarFinalizacao({ cpf: "529.982.247-25" }).cpf).toBeUndefined();
    expect(validarFinalizacao({ cpf: "" }).cpf).toBeUndefined();
    expect(validarFinalizacao({ cpf: "123.456.789-00" }).cpf).toBe("CPF inválido.");
  });

  it("a IA também procura o CPF, e a sugestão entra no campo vazio", () => {
    expect(CAMPOS_DA_IA).toContain("cpf");
    const { form, fontes } = mesclarPrefill({ cpf: "", cpfCnpj: "33.891.390/0001-96" }, { cpf: { valor: "529.982.247-25", fonte: "foto" } });
    expect(form.cpf).toBe("529.982.247-25");
    expect(fontes.cpf.fonte).toBe("foto");
  });
});
