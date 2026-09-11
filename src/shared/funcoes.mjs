/**
 * funcoes.mjs — Cargos/Funções de usuário padronizadas
 */

export const CARGOS = [
  "Operador",
  "Atendente",
  "Supervisor",
  "Administrador"
];

/**
 * Valores antigos no Firestore → função atual
 * Para garantir compatibilidade com dados legados
 */
const CARGO_LEGADO_MAP = {
  "operador": "Operador",
  "atendente": "Atendente",
  "agente": "Atendente",
  "supervisor": "Supervisor",
  "admin": "Administrador",
  "administrador": "Administrador"
};

/**
 * Normalizar cargo para valor padrão
 * @param {string} cargo - Cargo para normalizar
 * @returns {string} - Cargo normalizado ou "Operador" se inválido
 */
export function normalizarCargo(cargo = "") {
  if (!cargo) return "Operador";

  const lower = String(cargo).toLowerCase().trim();
  return CARGO_LEGADO_MAP[lower] || CARGOS[0]; // Padrão: Operador
}

/**
 * Validar se cargo é válido
 * @param {string} cargo - Cargo para validar
 * @returns {boolean}
 */
export function isCargoValido(cargo) {
  if (!cargo) return false;
  const normalized = normalizarCargo(cargo);
  return CARGOS.includes(normalized);
}

/**
 * Gerar opções HTML para select de cargos
 * @param {string} cargoSelecionado - Cargo já selecionado
 * @returns {string} - HTML das opções
 */
export function opcoesCargos(cargoSelecionado = "") {
  const normalizado = normalizarCargo(cargoSelecionado);
  
  return CARGOS.map((cargo) => {
    const selected = cargo === normalizado ? " selected" : "";
    return `<option value="${cargo}"${selected}>${cargo}</option>`;
  }).join("");
}

/**
 * Obter permissões do cargo
 * @param {string} cargo - Cargo do usuário
 * @returns {object} - Objeto com permissões booleanas
 */
export function getPermissoes(cargo) {
  const normalizado = normalizarCargo(cargo);

  const permissoes = {
    "Operador": {
      visualizar: true,
      criar: false,
      editar: false,
      deletar: false,
      gerenciar_usuarios: false,
      gerenciar_configuracoes: false
    },
    "Atendente": {
      visualizar: true,
      criar: true,
      editar: true,
      deletar: false,
      gerenciar_usuarios: false,
      gerenciar_configuracoes: false
    },
    "Supervisor": {
      visualizar: true,
      criar: true,
      editar: true,
      deletar: true,
      gerenciar_usuarios: false,
      gerenciar_configuracoes: false
    },
    "Administrador": {
      visualizar: true,
      criar: true,
      editar: true,
      deletar: true,
      gerenciar_usuarios: true,
      gerenciar_configuracoes: true
    }
  };

  return permissoes[normalizado] || permissoes["Operador"];
}

/**
 * Verificar se cargo tem permissão para ação
 * @param {string} cargo - Cargo do usuário
 * @param {string} permissao - Permissão a verificar
 * @returns {boolean}
 */
export function temPermissao(cargo, permissao) {
  const perms = getPermissoes(cargo);
  return perms[permissao] === true;
}
