import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { processWebhookPost } from "../webhook.mjs";
import { MAX_RECORDS_POR_REQUISICAO } from "../../shared/webhook-shared.js";
import { envSupabase, mockFetch, respostaJson, SUPABASE_URL } from "./helpers.mjs";

const TOKEN = "segredo-do-webhook";
let fetchMock;

afterEach(() => fetchMock?.restaurar());

function env(extra = {}) {
  return envSupabase({ WEBHOOK_TOKEN: TOKEN, ...extra });
}

/** Supabase que aceita qualquer gravação em `suportes` e guarda o que recebeu. */
function comSupabase() {
  fetchMock = mockFetch([
    [(url, init) => url.startsWith(`${SUPABASE_URL}/rest/v1/suportes`) && init.method === "POST", () => new Response(null, { status: 201 })],
    [(url) => url.startsWith(`${SUPABASE_URL}/rest/v1/suportes?select=id,extras`), () => respostaJson(200, [])]
  ]);
  return fetchMock;
}

const gravacoes = (mock) => mock.chamadas.filter((c) => c.method === "POST" && c.url.includes("/rest/v1/suportes"));
const linhasGravadas = (mock) => gravacoes(mock).flatMap((c) => JSON.parse(c.body));

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
    comSupabase();
    const r = await chamar({ corpo: REGISTRO, headers: { "x-webhook-token": TOKEN } });
    assert.equal(r.statusCode, 201);
  });

  it("aceita o token na query string (integrações que não mandam header)", async () => {
    comSupabase();
    const r = await chamar({ corpo: REGISTRO, query: { token: TOKEN } });
    assert.equal(r.statusCode, 201);
  });

  it("não grava o token no banco quando ele vem no corpo", async () => {
    // O token no corpo é aceito para autenticar, mas não pode virar um campo
    // do chamado — senão o segredo fica legível para qualquer técnico logado.
    const mock = comSupabase();
    const r = await chamar({ corpo: { ...REGISTRO, token: TOKEN } });

    assert.equal(r.statusCode, 201);
    assert.equal(gravacoes(mock).length, 1);
    assert.ok(!gravacoes(mock)[0].body.includes(TOKEN), "o segredo apareceu na linha gravada");
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
    const mock = comSupabase();
    const lote = Array.from({ length: MAX_RECORDS_POR_REQUISICAO + 1 }, (_, i) => ({ protocolo: `P${i}` }));

    const r = await chamar({ corpo: lote, headers: { "x-webhook-token": TOKEN } });

    assert.equal(r.statusCode, 413);
    assert.equal(mock.chamadas.length, 0, "não deveria ter falado com o banco");
  });

  it(`aceita lote de exatamente ${MAX_RECORDS_POR_REQUISICAO}`, async () => {
    const mock = comSupabase();
    const lote = Array.from({ length: MAX_RECORDS_POR_REQUISICAO }, (_, i) => ({ protocolo: `102-000-${String(i).padStart(3, "0")}` }));

    const r = await chamar({ corpo: lote, headers: { "x-webhook-token": TOKEN } });

    assert.equal(r.statusCode, 201);
    assert.equal(linhasGravadas(mock).length, MAX_RECORDS_POR_REQUISICAO);
  });

  it("recusa lote vazio", async () => {
    const r = await chamar({ corpo: [], headers: { "x-webhook-token": TOKEN } });
    assert.equal(r.statusCode, 400);
  });
});

describe("webhook /webhook/suportes — erro interno", () => {
  it("não expõe a causa na resposta, só um código de referência", async () => {
    // Sem as variáveis do Supabase o handler quebra por dentro. A mensagem
    // original ("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao configurados")
    // vai para o log.
    const silencio = console.error;
    console.error = () => {};
    try {
      const r = await chamar({
        corpo: REGISTRO,
        headers: { "x-webhook-token": TOKEN },
        ambiente: { WEBHOOK_TOKEN: TOKEN }
      });

      assert.equal(r.statusCode, 500);
      const corpo = JSON.parse(r.body);
      assert.match(corpo.ref, /^[0-9a-f]{8}$/);
      assert.equal(corpo.details, undefined);
      assert.doesNotMatch(r.body, /SUPABASE|SERVICE_ROLE|configurad/i);
    } finally {
      console.error = silencio;
    }
  });
});
