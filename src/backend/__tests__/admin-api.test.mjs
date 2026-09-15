import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAdminRequest } from "../admin-api.mjs";
import { assinarIdToken, gerarChaveJwks, gerarServiceAccount, mockFetch, respostaJson, rotasGoogle } from "./helpers.mjs";

/*
 * O que está em jogo aqui é escalada de privilégio: um operador virando admin,
 * um admin deixando o painel sem nenhum admin, alguém sem sessão passando.
 * O cargo vem do documento em `usuarios`, nunca do token — o Firestore falso
 * abaixo é quem diz quem é o quê.
 */

const USUARIOS = {
  "uid-admin": { cargo: "Administrador", displayName: "Ana" },
  "uid-operador": { cargo: "operador", displayName: "Otávio" }
};

let chave;
let env;
let fetchMock;

before(async () => {
  chave = await gerarChaveJwks("kid-admin");
  env = { FIREBASE_SERVICE_ACCOUNT: await gerarServiceAccount() };
});

afterEach(() => fetchMock?.restaurar());

function documentoFirestore(dados) {
  const fields = {};
  for (const [k, v] of Object.entries(dados)) fields[k] = { stringValue: v };
  return { fields };
}

function comServicos() {
  fetchMock = mockFetch([
    ...rotasGoogle([chave.jwk]),
    [
      (url) => url.includes("/documents/usuarios/"),
      (url) => {
        const uid = decodeURIComponent(url.split("/documents/usuarios/")[1]);
        return USUARIOS[uid] ? respostaJson(200, documentoFirestore(USUARIOS[uid])) : respostaJson(404, {});
      }
    ]
  ]);
  return fetchMock;
}

async function tokenDe(uid) {
  return assinarIdToken({ privateKey: chave.privateKey, kid: "kid-admin", payload: { sub: uid } });
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
    // O motivo ("assinatura inválida", "kid não encontrado") ajudaria quem
    // estiver tentando forjar um token — fica só no log.
    comServicos();
    const outra = await gerarChaveJwks("kid-admin");
    const forjado = await assinarIdToken({ privateKey: outra.privateKey, kid: "kid-admin", payload: { sub: "uid-admin" } });
    const aviso = console.warn;
    console.warn = () => {};
    try {
      const r = await chamar("/api/admin/usuarios", { method: "POST", token: forjado });

      assert.equal(r.status, 401);
      assert.equal(r.corpo.error, "Token inválido.");
    } finally {
      console.warn = aviso;
    }
  });
});

describe("API admin — permissões", () => {
  it("operador não cria usuário", async () => {
    comServicos();
    const r = await chamar("/api/admin/usuarios", {
      method: "POST",
      token: await tokenDe("uid-operador"),
      corpo: { email: "novo@x.com", password: "123456", cargo: "Administrador" }
    });
    assert.equal(r.status, 403);
  });

  it("operador não promove ninguém (nem a si mesmo)", async () => {
    comServicos();
    const r = await chamar("/api/admin/usuarios/uid-operador", {
      method: "PATCH",
      token: await tokenDe("uid-operador"),
      corpo: { cargo: "Administrador" }
    });
    assert.equal(r.status, 403);
  });

  it("usuário sem documento em `usuarios` é tratado como operador, não como admin", async () => {
    // Token válido do projeto, mas sem perfil: não pode herdar privilégio.
    comServicos();
    const r = await chamar("/api/admin/usuarios", { method: "POST", token: await tokenDe("uid-fantasma"), corpo: {} });
    assert.equal(r.status, 403);
  });

  it("admin não rebaixa o próprio cargo — o painel ficaria sem administrador", async () => {
    const mock = comServicos();
    const r = await chamar("/api/admin/usuarios/uid-admin", {
      method: "PATCH",
      token: await tokenDe("uid-admin"),
      corpo: { cargo: "Operador" }
    });

    assert.equal(r.status, 400);
    assert.ok(!mock.chamadas.some((c) => c.method === "PATCH"), "não deveria ter gravado nada");
  });

  it("admin não exclui a própria conta", async () => {
    comServicos();
    const r = await chamar("/api/admin/usuarios/uid-admin", { method: "DELETE", token: await tokenDe("uid-admin") });
    assert.equal(r.status, 400);
  });
});
