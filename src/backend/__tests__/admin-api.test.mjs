import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAdminRequest } from "../admin-api.mjs";
import { envSupabase, mockFetch, respostaJson, rotaAuth, SUPABASE_URL } from "./helpers.mjs";

/*
 * O que está em jogo aqui é escalada de privilégio: um operador virando admin,
 * um admin deixando o painel sem nenhum admin, alguém sem sessão passando.
 * O cargo vem da linha em `usuarios`, nunca do token — o Supabase falso abaixo
 * é quem diz quem é o quê.
 */

const USUARIOS = {
  "uid-admin": { id: "uid-admin", email: "ana@x.com", display_name: "Ana", cargo: "Administrador", status: "ativo" },
  "uid-operador": { id: "uid-operador", email: "otavio@x.com", display_name: "Otávio", cargo: "Operador", status: "ativo" }
};
const TOKENS = {
  "token-admin": { id: "uid-admin", email: "ana@x.com" },
  "token-operador": { id: "uid-operador", email: "otavio@x.com" },
  "token-fantasma": { id: "uid-fantasma", email: "fantasma@x.com" }
};

const env = envSupabase();
let fetchMock;
afterEach(() => fetchMock?.restaurar());

function comServicos() {
  fetchMock = mockFetch([
    rotaAuth(TOKENS),
    [
      (url, init) => url.startsWith(`${SUPABASE_URL}/rest/v1/usuarios`) && (init.method || "GET") === "GET",
      (url) => {
        const uid = decodeURIComponent((/id=eq\.([^&]+)/.exec(url) || [])[1] || "");
        return respostaJson(200, USUARIOS[uid] ? [USUARIOS[uid]] : []);
      }
    ]
  ]);
  return fetchMock;
}

async function chamar(caminho, { method = "GET", token, corpo } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const request = new Request(`https://painel.teste${caminho}`, {
    method,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const resposta = await handleAdminRequest(request, env, new URL(request.url));
  return resposta && { status: resposta.status, corpo: await resposta.json().catch(() => null) };
}

describe("API admin — roteamento", () => {
  it("não intercepta rotas que não são dela (o painel precisa continuar sendo servido)", async () => {
    const request = new Request("https://painel.teste/dashboard");
    assert.equal(await handleAdminRequest(request, env, new URL(request.url)), null);
  });

  it("responde o preflight de CORS sem exigir token", async () => {
    const request = new Request("https://painel.teste/api/admin/usuarios", { method: "OPTIONS" });
    const resposta = await handleAdminRequest(request, env, new URL(request.url));
    assert.equal(resposta.status, 204);
  });
});

describe("API admin — autenticação", () => {
  it("recusa chamada sem token", async () => {
    const r = await chamar("/api/admin/usuarios", { method: "POST" });
    assert.equal(r.status, 401);
  });

  it("recusa token inválido sem dizer por quê", async () => {
    // O motivo que o Supabase Auth deu ajudaria quem estiver tentando forjar
    // um token — fica só no log.
    comServicos();
    const aviso = console.warn;
    console.warn = () => {};
    try {
      const r = await chamar("/api/admin/usuarios", { method: "POST", token: "token-forjado" });
      assert.equal(r.status, 401);
      assert.equal(r.corpo.error, "Token inválido.");
      assert.doesNotMatch(JSON.stringify(r.corpo), /invalid JWT|401/);
    } finally {
      console.warn = aviso;
    }
  });
});

describe("API admin — permissões", () => {
  it("operador não cria usuário", async () => {
    const mock = comServicos();
    const r = await chamar("/api/admin/usuarios", {
      method: "POST",
      token: "token-operador",
      corpo: { email: "novo@x.com", password: "123456", cargo: "Administrador" }
    });
    assert.equal(r.status, 403);
    assert.ok(!mock.chamadas.some((c) => c.url.includes("/auth/v1/admin/users")), "não deveria ter criado conta");
  });

  it("operador não promove ninguém (nem a si mesmo)", async () => {
    comServicos();
    const r = await chamar("/api/admin/usuarios/uid-operador", {
      method: "PATCH",
      token: "token-operador",
      corpo: { cargo: "Administrador" }
    });
    assert.equal(r.status, 403);
  });

  it("usuário sem linha em `usuarios` é tratado como operador, não como admin", async () => {
    // Token válido, mas sem perfil: não pode herdar privilégio.
    comServicos();
    const r = await chamar("/api/admin/usuarios", { method: "POST", token: "token-fantasma", corpo: {} });
    assert.equal(r.status, 403);
  });

  it("admin não rebaixa o próprio cargo — o painel ficaria sem administrador", async () => {
    const mock = comServicos();
    const r = await chamar("/api/admin/usuarios/uid-admin", {
      method: "PATCH",
      token: "token-admin",
      corpo: { cargo: "Operador" }
    });

    assert.equal(r.status, 400);
    assert.ok(!mock.chamadas.some((c) => c.method === "PATCH"), "não deveria ter gravado nada");
  });

  it("admin não exclui a própria conta", async () => {
    const mock = comServicos();
    const r = await chamar("/api/admin/usuarios/uid-admin", { method: "DELETE", token: "token-admin" });
    assert.equal(r.status, 400);
    assert.ok(!mock.chamadas.some((c) => c.method === "DELETE"), "não deveria ter excluído nada");
  });
});
