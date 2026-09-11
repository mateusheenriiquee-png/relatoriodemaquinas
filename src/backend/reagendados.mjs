import { runQuery, updateDocumentWithDeletes } from "./firestore-rest.mjs";

/**
 * reagendados.mjs — devolve para EM ABERTO os suportes cujo reagendamento venceu.
 *
 * Antes isso vivia no navegador (`setInterval` de 5 min na tela de suportes):
 * se ninguém estivesse com o painel aberto às 8h, o suporte reagendado para as
 * 8h só reaparecia quando alguém abrisse a tela. Agora quem roda é o Cron
 * Trigger do Worker (ver `scheduled()` em index.mjs e `[triggers]` no
 * wrangler.toml), que não depende de nenhuma aba.
 */

const MAX_POR_EXECUCAO = 300;

function getConfig(env) {
  const firebaseBase64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const firebaseRaw = env.FIREBASE_SERVICE_ACCOUNT;

  let serviceAccountRaw = firebaseBase64 || firebaseRaw;
  if (firebaseBase64 && serviceAccountRaw) {
    try {
      serviceAccountRaw = atob(serviceAccountRaw);
    } catch (error) {
      console.error("[Reagendados] Erro ao decodificar Base64:", error.message);
    }
  }

  return {
    collection: env.FIRESTORE_COLLECTION || "suportes_tecnicos",
    serviceAccountRaw
  };
}

/**
 * `dataReagendamento` não tem tipo único no banco: o painel novo grava Timestamp,
 * versões antigas e importações gravaram string ISO. Por isso a filtragem por
 * data é feita aqui, em memória, e não na query — a query pega só os
 * REAGENDADO, que são poucas dezenas.
 */
function toDate(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === "object" && typeof valor.toDate === "function") {
    const d = valor.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Varre os suportes REAGENDADO e reabre os vencidos.
 *
 * @returns {Promise<{ verificados: number, reabertos: string[], falhas: Array<{id: string, erro: string}> }>}
 */
export async function processarReagendadosVencidos(env, { agora = new Date() } = {}) {
  const { collection, serviceAccountRaw } = getConfig(env);

  if (!serviceAccountRaw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT nao configurada no Worker.");
  }

  const pendentes = await runQuery({
    serviceAccountRaw,
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "REAGENDADO" }
        }
      },
      limit: MAX_POR_EXECUCAO
    }
  });

  const reabertos = [];
  const falhas = [];

  for (const doc of pendentes) {
    const quando = toDate(doc.dataReagendamento || doc.dataReag || doc.reagendamento);
    if (!quando || quando > agora) continue;

    try {
      await updateDocumentWithDeletes({
        serviceAccountRaw,
        collection,
        docId: doc.id,
        fields: {
          status: "EM ABERTO",
          updatedAt: new Date().toISOString()
        },
        // Sem apagar a data, o registro voltaria para EM ABERTO carregando um
        // reagendamento vencido e seria reaberto de novo a cada execução.
        deleteFields: ["dataReagendamento", "dataReag", "reagendamento"]
      });
      reabertos.push(doc.protocolo || doc.id);
    } catch (error) {
      // Uma falha isolada não pode abortar a varredura inteira.
      console.error(`[Reagendados] Falha ao reabrir ${doc.id}:`, error?.message || error);
      falhas.push({ id: doc.id, erro: String(error?.message || error) });
    }
  }

  return { verificados: pendentes.length, reabertos, falhas };
}
