import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { processKommoWebhookPost } from "../webhook-kommo.mjs";
import { MAX_RECORDS_POR_REQUISICAO } from "../../shared/webhook-shared.js";
import { gerarServiceAccount, mockFetch, respostaJson, rotasGoogle } from "./helpers.mjs";

const TOKEN = "segredo-do-webhook";
const KOMMO_URL = "https://conta-teste.kommo.com";
let serviceAccount;
let fetchMock;

before(async () => {
  serviceAccount = await gerarServiceAccount();
});

afterEach(() => fetchMock?.restaurar());

const ENV = () => ({
  WEBHOOK_TOKEN: TOKEN,
  FIREBASE_SERVICE_ACCOUNT: serviceAccount,
  KOMMO_BASE_URL: KOMMO_URL,
  KOMMO_ACCESS_TOKEN: "token-kommo"
});

/** Kommo e Firestore falsos. `lead` responde o GET do lead; null faz o Kommo falhar. */
function comServicos({ lead = null, erroKommo = "" } = {}) {
  fetchMock = mockFetch([
    ...rotasGoogle(),
    // config/kommo ausente: o mapper roda com config vazia.
    [(url, init) => url.includes("/documents/config/kommo") && !init.method, () => respostaJson(404, {})],
    [(url, init) => url.includes("firestore.googleapis.com") && init.method === "PATCH", () => respostaJson(200, {})],
    [
      KOMMO_URL,
      () => (lead ? respostaJson(200, lead) : new Response(erroKommo || "erro", { status: 500 }))
    ]
  ]);
  return fetchMock;
}

function chamar({ corpo, contentType = "application/json", query = { token: TOKEN } }) {
  return processKommoWebhookPost(
    {
      httpMethod: "POST",
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      headers: {},
      queryStringParameters: query,
      contentType
    },
    { env: ENV() }
  );
}

const MUDANCA = { leads: { status: [{ id: 555, status_id: 142, pipeline_id: 7 }] } };

describe("webhook /webhook/kommo", () => {
  it("recusa chamada sem token", async () => {
    const r = await chamar({ corpo: MUDANCA, query: {} });
    assert.equal(r.statusCode, 401);
  });

  it("recusa payload sem mudança de lead reconhecível", async () => {
    const r = await chamar({ corpo: { leads: {} } });
    assert.equal(r.statusCode, 400);
  });

  it(`recusa mais de ${MAX_RECORDS_POR_REQUISICAO} mudanças antes de chamar o Kommo`, async () => {
    // Cada mudança vira uma chamada à API do Kommo: sem o teto, um payload só
    // dispararia milhares de requisições externas.
    const mock = comServicos({ lead: { id: 1 } });
    const muitas = Array.from({ length: MAX_RECORDS_POR_REQUISICAO + 1 }, (_, i) => ({ id: i + 1 }));

    const r = await chamar({ corpo: { leads: { status: muitas } } });

    assert.equal(r.statusCode, 413);
    assert.equal(mock.chamadas.length, 0);
  });

  it("busca o lead completo no Kommo e grava no documento kommo_lead_<id>", async () => {
    const mock = comServicos({ lead: { id: 555, name: "Gilmar", price: 85, status_id: 142 } });

    const r = await chamar({ corpo: MUDANCA });

    assert.equal(r.statusCode, 201);
    const gravacao = mock.chamadas.find((c) => c.method === "PATCH");
    assert.ok(gravacao.url.includes("/suportes_tecnicos/kommo_lead_555"));
  });

  it("entende o formato form-urlencoded clássico do amoCRM", async () => {
    const mock = comServicos({ lead: { id: 777, name: "Délia" } });

    const r = await chamar({
      corpo: "leads%5Bstatus%5D%5B0%5D%5Bid%5D=777&leads%5Bstatus%5D%5B0%5D%5Bstatus_id%5D=55",
      contentType: "application/x-www-form-urlencoded"
    });

    assert.equal(r.statusCode, 201);
    assert.ok(mock.chamadas.some((c) => c.url.includes("/api/v4/leads/777")));
  });

  it("quando o Kommo falha, devolve os IDs mas não a mensagem da API dele", async () => {
    // O texto de erro do Kommo pode trazer detalhes da conta; vai só para o log.
    comServicos({ erroKommo: "detalhe interno da conta kommo" });
    const silencio = console.error;
    console.error = () => {};
    try {
      const r = await chamar({ corpo: MUDANCA });

      assert.equal(r.statusCode, 502);
      const corpo = JSON.parse(r.body);
      assert.deepEqual(corpo.leadsComFalha, [555]);
      assert.match(corpo.ref, /^[0-9a-f]{8}$/);
      assert.doesNotMatch(r.body, /detalhe interno|Kommo API 500/);
    } finally {
      console.error = silencio;
    }
  });
});
