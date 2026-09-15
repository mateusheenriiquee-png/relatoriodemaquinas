import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyFirebaseIdToken } from "../verify-id-token.mjs";
import { PROJECT_ID, assinarIdToken, gerarChaveJwks, mockFetch, rotasGoogle } from "./helpers.mjs";

/*
 * É esta função que decide quem entra na API administrativa. Os testes cobrem
 * o que um atacante tentaria: assinar com outra chave, reaproveitar token
 * vencido, trazer token de outro projeto Firebase.
 */

const ENV = { FIREBASE_PROJECT_ID: PROJECT_ID };

let chave;
let fetchMock;

before(async () => {
  chave = await gerarChaveJwks("kid-valido");
});

afterEach(() => fetchMock?.restaurar());

function comJwks(jwks) {
  fetchMock = mockFetch(rotasGoogle(jwks));
}

describe("verifyFirebaseIdToken", () => {
  it("aceita token assinado pela chave publicada, do projeto certo", async () => {
    comJwks([chave.jwk]);
    const token = await assinarIdToken({ privateKey: chave.privateKey, kid: "kid-valido", payload: { sub: "uid-1", email: "a@b.com" } });

    const r = await verifyFirebaseIdToken(token, ENV);

    assert.equal(r.valid, true);
    assert.equal(r.uid, "uid-1");
    assert.equal(r.email, "a@b.com");
  });

  it("recusa token assinado por outra chave com o mesmo kid", async () => {
    // O ataque clássico: o atacante gera a própria chave e copia o `kid` real.
    const impostora = await gerarChaveJwks("kid-valido");
    comJwks([chave.jwk]);
    const token = await assinarIdToken({ privateKey: impostora.privateKey, kid: "kid-valido" });

    const r = await verifyFirebaseIdToken(token, ENV);

    assert.equal(r.valid, false);
    assert.match(r.error, /assinatura/i);
  });

  it("recusa kid que não está entre as chaves publicadas", async () => {
    comJwks([chave.jwk]);
    const outra = await gerarChaveJwks("kid-desconhecido");
    const token = await assinarIdToken({ privateKey: outra.privateKey, kid: "kid-desconhecido" });

    assert.equal((await verifyFirebaseIdToken(token, ENV)).valid, false);
  });

  it("recusa token vencido, mesmo com assinatura válida", async () => {
    comJwks([chave.jwk]);
    const umaHoraAtras = Math.floor(Date.now() / 1000) - 3600;
    const token = await assinarIdToken({
      privateKey: chave.privateKey,
      kid: "kid-valido",
      payload: { iat: umaHoraAtras - 3600, exp: umaHoraAtras }
    });

    const r = await verifyFirebaseIdToken(token, ENV);

    assert.equal(r.valid, false);
    assert.match(r.error, /expirado/);
  });

  it("recusa token legítimo, mas emitido para outro projeto Firebase", async () => {
    // Qualquer um cria um projeto Firebase e emite tokens válidos para ele.
    // A chave é a mesma do Google; o que barra é o `aud`/`iss`.
    comJwks([chave.jwk]);
    const token = await assinarIdToken({
      privateKey: chave.privateKey,
      kid: "kid-valido",
      payload: { aud: "outro-projeto", iss: "https://securetoken.google.com/outro-projeto" }
    });

    assert.equal((await verifyFirebaseIdToken(token, ENV)).valid, false);
  });

  it("recusa lixo no lugar do token sem estourar exceção", async () => {
    comJwks([chave.jwk]);
    for (const lixo of ["", "abc", "a.b", "a.b.c", "x".repeat(5000)]) {
      const r = await verifyFirebaseIdToken(lixo, ENV);
      assert.equal(r.valid, false, `deveria recusar: ${lixo.slice(0, 20)}`);
    }
  });

  it("recusa token sem `sub` (sem usuário identificado)", async () => {
    comJwks([chave.jwk]);
    const token = await assinarIdToken({ privateKey: chave.privateKey, kid: "kid-valido", payload: { sub: "" } });

    assert.equal((await verifyFirebaseIdToken(token, ENV)).valid, false);
  });
});
