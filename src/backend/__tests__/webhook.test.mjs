import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { processWebhookPost } from "../webhook.mjs";
import { MAX_RECORDS_POR_REQUISICAO } from "../../shared/webhook-shared.js";
import { gerarServiceAccount, mockFetch, respostaJson, rotasGoogle } from "./helpers.mjs";

const TOKEN = "segredo-do-webhook";
let serviceAccount;
let fetchMock;

before(async () => {
  serviceAccount = await gerarServiceAccount();
});

afterEach(() => fetchMock?.restaurar());

function env(extra = {}) {
  return { WEBHOOK_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: serviceAccount, ...extra };
}

/** Firestore que aceita qualquer gravação e guarda o que recebeu. */
function comFirestore() {
  fetchMock = mockFetch([
    ...rotasGoogle(),
    [(url, init) => url.includes("firestore.googleapis.com") && init.method === "PATCH", () => respostaJson(200, {})]
  ]);
  return fetchMock;
}

function chamar({ corpo, headers = {}, query = {}, ambiente = env() }) {
  return processWebhookPost(
    {
      httpMethod: "POST",
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      headers,
      queryStringParameters: query
    },
    { env: ambiente }
  );
}

const REGISTRO = { protocolo: "102-005-389", status: "aberto" };

describe("webhook /webhook/suportes — autenticação", () => {
  it("recusa chamada sem token", async () => {
    const r = await chamar({ corpo: REGISTRO });
    assert.equal(r.statusCode, 401);
  });

  it("recusa token errado", async () => {
    const r = await chamar({ corpo: REGISTRO, headers: { "x-webhook-token": "chute" } });
    assert.equal(r.statusCode, 401);
  });

  it("aceita o token no header", async () => {
    comFirestore();
    const r = await chamar({ corpo: REGISTRO, headers: { "x-webhook-token": TOKEN } });
    assert.equal(r.statusCode, 201);
  });

  it("aceita o token na query string (integrações que não mandam header)", async () => {
    comFirestore();
    const r = await chamar({ corpo: REGISTRO, query: { token: TOKEN } });
    assert.equal(r.statusCode, 201);
  });

  it("não grava o token no Firestore quando ele vem no corpo", async () => {
    // O token no corpo é aceito para autenticar, mas não pode virar um campo
    // do chamado — senão o segredo fica legível para qualquer técnico logado.
    const mock = comFirestore();
    const r = await chamar({ corpo: { ...REGISTRO, token: TOKEN } });

    assert.equal(r.statusCode, 201);
    const gravacoes = mock.chamadas.filter((c) => c.method === "PATCH");
    assert.equal(gravacoes.length, 1);
    assert.ok(!gravacoes[0].body.includes(TOKEN), "o segredo apareceu no documento gravado");
  });
});

describe("webhook /webhook/suportes — entrada inválida", () => {
  it("JSON quebrado vira 400, sem a mensagem do parser e sem precisar de token", async () => {
    // Esta resposta é alcançável por qualquer um: o corpo é lido antes da
    // checagem do token. Antes caía no 500 com o texto do SyntaxError.
    const r = await chamar({ corpo: "{isto não é json" });

    assert.equal(r.statusCode, 400);
    assert.doesNotMatch(r.body, /Unexpected|position|SyntaxError|token/i);
  });

  it(`recusa lote acima de ${MAX_RECORDS_POR_REQUISICAO} registros antes de gravar qualquer coisa`, async () => {
    const mock = comFirestore();
    const lote = Array.from({ length: MAX_RECORDS_POR_REQUISICAO + 1 }, (_, i) => ({ protocolo: `P${i}` }));

    const r = await chamar({ corpo: lote, headers: { "x-webhook-token": TOKEN } });

    assert.equal(r.statusCode, 413);
    assert.equal(mock.chamadas.length, 0, "não deveria ter falado com o Firestore");
  });

  it(`aceita lote de exatamente ${MAX_RECORDS_POR_REQUISICAO}`, async () => {
    const mock = comFirestore();
    const lote = Array.from({ length: MAX_RECORDS_POR_REQUISICAO }, (_, i) => ({ protocolo: `102-000-${String(i).padStart(3, "0")}` }));

    const r = await chamar({ corpo: lote, headers: { "x-webhook-token": TOKEN } });

    assert.equal(r.statusCode, 201);
    assert.equal(mock.chamadas.filter((c) => c.method === "PATCH").length, MAX_RECORDS_POR_REQUISICAO);
  });

  it("recusa lote vazio", async () => {
    const r = await chamar({ corpo: [], headers: { "x-webhook-token": TOKEN } });
    assert.equal(r.statusCode, 400);
  });
});

describe("webhook /webhook/suportes — erro interno", () => {
  it("não expõe a causa na resposta, só um código de referência", async () => {
    // Sem credencial do Firestore o handler quebra por dentro. A mensagem
    // original ("FIREBASE_SERVICE_ACCOUNT nao configurada") vai para o log.
    const silencio = console.error;
    console.error = () => {};
    try {
      const r = await chamar({
        corpo: REGISTRO,
        headers: { "x-webhook-token": TOKEN },
        ambiente: env({ FIREBASE_SERVICE_ACCOUNT: undefined })
      });

      assert.equal(r.statusCode, 500);
      const corpo = JSON.parse(r.body);
      assert.match(corpo.ref, /^[0-9a-f]{8}$/);
      assert.equal(corpo.details, undefined);
      assert.doesNotMatch(r.body, /FIREBASE|SERVICE_ACCOUNT|configurad/i);
    } finally {
      console.error = silencio;
    }
  });
});
