import { assinarTabela } from "./suportesStore";
import { normalizarCargo } from "../contexts/AuthContext";
import { norm, titleCaseName } from "../utils/format";

export const USUARIOS_COLLECTION = "usuarios";
const comparaNomes = (a, b) =>
  (a.displayName || a.email).localeCompare(b.displayName || b.email, "pt-BR", { sensitivity: "base" });

/**
 * usuariosService.js — leitura da tabela `usuarios`.
 *
 * Fica fora do adminService de propósito: quem escolhe um técnico não é
 * necessariamente administrador, e a RLS do banco já libera leitura desta
 * tabela para qualquer usuário autenticado.
 */

/**
 * Lista de usuários em tempo real. Retorna unsubscribe.
 *
 * `status` só existe nos documentos criados pelo painel novo; nos antigos o
 * campo não está lá. Ausente é tratado como ativo — o contrário esconderia
 * todo mundo que foi cadastrado antes.
 */
export function subscribeUsuarios(onData, onError) {
  return assinarTabela({
    tabela: USUARIOS_COLLECTION,
    consulta: (qb) => qb.limit(1000),
    mapear: (linha) => ({
      id: linha.id,
      uid: linha.id,
      email: norm(linha.email),
      displayName: norm(linha.display_name),
      cargo: normalizarCargo(linha.cargo),
      status: norm(linha.status) || "ativo",
      criadoEm: linha.created_at || ""
    }),
    ordenar: comparaNomes,
    teto: 1000,
    onData: (usuarios) => onData(usuarios),
    onError: (error) => {
      console.error("[Usuários] Erro ao carregar:", error);
      onError?.(error);
    }
  });
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
