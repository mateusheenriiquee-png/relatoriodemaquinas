import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { normalizarCargo } from "../contexts/AuthContext";
import { norm, titleCaseName } from "../utils/format";

export const USUARIOS_COLLECTION = "usuarios";

/**
 * usuariosService.js — leitura da coleção `usuarios`.
 *
 * Fica fora do adminService de propósito: quem escolhe um técnico não é
 * necessariamente administrador, e as Firestore Rules já liberam leitura desta
 * coleção para qualquer usuário autenticado.
 */

/**
 * Lista de usuários em tempo real. Retorna unsubscribe.
 *
 * `status` só existe nos documentos criados pelo painel novo; nos antigos o
 * campo não está lá. Ausente é tratado como ativo — o contrário esconderia
 * todo mundo que foi cadastrado antes.
 */
export function subscribeUsuarios(onData, onError) {
  return onSnapshot(
    collection(db, USUARIOS_COLLECTION),
    (snap) => {
      const usuarios = snap.docs
        .map((d) => {
          const dados = d.data() || {};
          return {
            id: d.id,
            uid: dados.uid || d.id,
            email: norm(dados.email),
            displayName: norm(dados.displayName),
            cargo: normalizarCargo(dados.cargo),
            status: norm(dados.status) || "ativo",
            criadoEm: dados.createdAt || dados.criadoEm || ""
          };
        })
        .sort((a, b) =>
          (a.displayName || a.email).localeCompare(b.displayName || b.email, "pt-BR", {
            sensitivity: "base"
          })
        );
      onData(usuarios);
    },
    (error) => {
      console.error("[Usuários] Erro ao carregar:", error);
      onError?.(error);
    }
  );
}

/**
 * Nomes utilizáveis como técnico responsável.
 *
 * Sai em Title Case porque é assim que o campo `tecnico` é gravado e filtrado
 * no restante do painel (`titleCaseName`); devolver o displayName cru faria o
 * registro sumir do filtro por técnico. Sem displayName, cai para a parte do
 * email antes do @, que é melhor do que uma linha em branco na lista.
 */
export function nomesDeTecnicos(usuarios = []) {
  const nomes = usuarios
    .filter((u) => u.status !== "inativo")
    .map((u) => titleCaseName(u.displayName || (u.email ? u.email.split("@")[0] : "")))
    .filter(Boolean);

  return [...new Set(nomes)].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
}
