/**
 * suporte-row.mjs — a tradução entre o chamado "do jeito do código"
 * (camelCase, datas ISO, campos livres) e a linha da tabela `suportes`
 * (snake_case, timestamptz, `extras` para o que o esquema não conhece).
 *
 * É ESM puro e sem dependências, de propósito: o painel (Vite) e o Worker
 * importam o MESMO arquivo. Duas cópias desta tabela de nomes acabariam
 * divergindo, e um campo gravado com o nome errado some sem dar erro.
 */

/** camelCase do código -> coluna. Só o que existe como coluna própria. */
export const COLUNAS = {
  protocolo: "protocolo",
  nomeCliente: "nome_cliente",
  responsavelAbertura: "responsavel_abertura",
  cpfCnpj: "cpf_cnpj",
  contato: "contato",
  tipo: "tipo",
  ac: "ac",
  tecnico: "tecnico",
  turno: "turno",
  status: "status",
  statusAbertura: "status_abertura",
  descricao: "descricao",
  observacaoTecnico: "observacao_tecnico",
  anotacoes: "anotacoes",
  motivo: "motivo",
  motivoIndevido: "motivo_indevido",
  motivoCat: "motivo_cat",
  motivoDetalhe: "motivo_detalhe",
  usoCat: "uso_cat",
  usoPlat: "uso_plat",
  excluirDaMedia: "excluir_da_media",
  justificativaMedia: "justificativa_media",
  foraDaMedia: "fora_da_media",
  followupsImportados: "followups_importados",
  historico: "historico",
  followups: "followups",
  dataAbertura: "data_abertura",
  dataInicioAtendimento: "data_inicio_atendimento",
  dataFinalizacao: "data_finalizacao",
  dataReagendamento: "data_reagendamento",
  valorVenda: "valor_venda",
  vendaStatus: "venda_status",
  origemIntegracao: "origem_integracao",
  idempotencyKey: "idempotency_key",
  kommoLeadId: "kommo_lead_id",
  kommoPipelineId: "kommo_pipeline_id",
  kommoStatusId: "kommo_status_id",
  kommoResponsibleId: "kommo_responsible_id",
  // Dados pedidos ao finalizar o suporte (ConcluirSuporteModal).
  emailCliente: "email_cliente",
  comprouOutroProduto: "comprou_outro_produto",
  protocoloCertificado: "protocolo_certificado",
  dataEmissao: "data_emissao",
  dataVencimento: "data_vencimento",
  tipoCertificado: "tipo_certificado",
  validadeEstendida: "validade_estendida",
  sistema: "sistema"
};

/** Campos que o banco calcula: quem os enviar é ignorado (o front antigo os gravava à mão). */
const DERIVADOS = new Set(["id", "tecnicoKey", "nomeClienteKey", "createdAt", "updatedAt"]);

const COLUNA_DATA = new Set(["data_abertura", "data_inicio_atendimento", "data_finalizacao", "data_reagendamento"]);
const COLUNA_BOOL = new Set(["excluir_da_media", "fora_da_media"]);
// Sim/não em que "não perguntado" (chamado antigo) é diferente de "não".
const COLUNA_BOOL_NULAVEL = new Set(["comprou_outro_produto"]);
// Datas sem hora (colunas `date`): viajam como "AAAA-MM-DD", sem fuso — um
// certificado emitido dia 23 não pode virar dia 22 por causa do UTC-3.
const COLUNA_DIA = new Set(["data_emissao", "data_vencimento"]);
const COLUNA_JSON = new Set(["historico", "followups"]);
// Colunas que aceitam NULL de verdade; as demais de texto são NOT NULL DEFAULT ''.
const COLUNA_NULAVEL_TEXTO = new Set(["venda_status", "idempotency_key", "kommo_lead_id", "kommo_pipeline_id", "kommo_status_id", "kommo_responsible_id"]);

export const COLUNA_PARA_CAMPO = Object.fromEntries(Object.entries(COLUNAS).map(([campo, coluna]) => [coluna, campo]));

/** "AAAA-MM-DD" (ou "DD/MM/AAAA") -> "AAAA-MM-DD"; vazio ou inválido -> null. */
export function paraDia(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = String(valor).trim();
  let ano;
  let mes;
  let dia;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (iso) [, ano, mes, dia] = iso;
  else if (br) [ano, mes, dia] = [br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0")];
  else return null;
  const d = new Date(Date.UTC(+ano, +mes - 1, +dia));
  // 31/02 "rola" para março no Date — recusa em vez de gravar outra data.
  return d.getUTCMonth() === +mes - 1 && d.getUTCDate() === +dia ? `${ano}-${mes}-${dia}` : null;
}

/** Devolve ISO de qualquer coisa data-like, ou null quando vazio/ inválido. */
export function paraIso(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "string") {
    // "02/09/2026 14:30" é dia/mês/ano. O Date nativo leria como MM/DD (EUA) —
    // 02/09 virava 9 de fevereiro e 28/08 virava data inválida. Sem fuso na
    // string, vale o horário de Brasília (UTC-3; o Brasil não tem horário de
    // verão desde 2019), que é onde estas planilhas e webhooks nascem.
    const br = /^\s*(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/.exec(valor);
    if (br) {
      const [, dia, mes, ano, hora = "0", min = "0", seg = "0"] = br;
      const dia0 = new Date(Date.UTC(+ano, +mes - 1, +dia));
      // 31/02 "rola" para março no Date — recusa em vez de gravar outra data.
      if (dia0.getUTCDate() !== +dia || dia0.getUTCMonth() !== +mes - 1) return null;
      return new Date(Date.UTC(+ano, +mes - 1, +dia, +hora + 3, +min, +seg)).toISOString();
    }
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function valorDaColuna(coluna, valor) {
  if (COLUNA_DATA.has(coluna)) return paraIso(valor);
  if (COLUNA_DIA.has(coluna)) return paraDia(valor);
  if (COLUNA_BOOL.has(coluna)) return Boolean(valor);
  if (COLUNA_BOOL_NULAVEL.has(coluna)) return valor === null || valor === "" ? null : Boolean(valor);
  if (COLUNA_JSON.has(coluna)) return Array.isArray(valor) ? valor : [];
  if (coluna === "followups_importados") return Number(valor) || 0;
  if (coluna === "valor_venda") return Number(valor) || 0;
  if (COLUNA_NULAVEL_TEXTO.has(coluna)) {
    const t = valor === null || valor === undefined ? "" : String(valor).trim();
    return t === "" ? null : t;
  }
  return valor === null || valor === undefined ? "" : String(valor);
}

/**
 * Objeto camelCase -> { coluna: valor, extras? }.
 *
 * - `null` significa "apagar" (o que `deleteField()` era no Firestore): vira
 *   NULL nas datas e '' nos textos.
 * - Chave desconhecida não é descartada: vai para `extras` (jsonb), porque o
 *   webhook sempre aceitou campos arbitrários.
 * - `undefined` é ignorado, para que um patch parcial não zere o resto.
 */
export function paraLinha(objeto = {}) {
  const linha = {};
  const extras = {};
  for (const [campo, valor] of Object.entries(objeto)) {
    if (valor === undefined || DERIVADOS.has(campo)) continue;
    const coluna = COLUNAS[campo];
    if (coluna) linha[coluna] = valorDaColuna(coluna, valor);
    else extras[campo] = valor;
  }
  if (Object.keys(extras).length) linha.extras = extras;
  return linha;
}

/**
 * Linha da tabela -> objeto camelCase no formato que o painel sempre recebeu
 * do Firestore (datas como string ISO, `createdAt`/`updatedAt` presentes).
 *
 * Existe para que o resto do painel — mapeadores, dashboard, exportação — não
 * saiba que o banco mudou: eles continuam lendo `data.dataAbertura`, etc.
 * `extras` é espalhado primeiro, para que uma coluna real nunca perca para um
 * campo livre homônimo.
 */
export function linhaParaDados(linha = {}) {
  const dados = { ...(linha.extras && typeof linha.extras === "object" ? linha.extras : {}) };
  for (const [coluna, campo] of Object.entries(COLUNA_PARA_CAMPO)) {
    if (!(coluna in linha)) continue;
    const valor = linha[coluna];
    if (COLUNA_BOOL_NULAVEL.has(coluna)) dados[campo] = valor;
    else if (COLUNA_DATA.has(coluna)) dados[campo] = paraIso(valor) || "";
    else dados[campo] = valor === null ? "" : valor;
  }
  dados.createdAt = paraIso(linha.created_at) || "";
  dados.updatedAt = paraIso(linha.updated_at) || "";
  return dados;
}
