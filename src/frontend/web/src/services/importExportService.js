import { supabase } from "../config/supabase";
import { paraLinha, linhaParaDados } from "../../../../shared/suporte-row.mjs";
import { COLLECTION, chaveNomeCliente } from "./suportesService";
import { classificarMotivo, classificarUso } from "../utils/catalogos";

/**
 * importExportService.js — importação de planilha e exportação CSV.
 *
 * Porte de src/frontend/public/js/services/import-export.js. As regras de
 * leitura (apelidos de coluna, datas em serial do Excel, ID determinístico)
 * foram mantidas como estavam: elas existem por causa das planilhas reais que
 * a equipe usa, e mudá-las quebraria importações que hoje funcionam. O que saiu
 * foi só o acoplamento ao DOM — aqui não há getElementById nem alert.
 */

const BATCH_SIZE = 400;
const XLSX_CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

// No CSV vindo do Forms, "OBSERVAÇÃO" é a descrição do atendimento.
const IGNORED_FIELDS = new Set(["observacao do tecnico", "observacao do técnico"]);

const FIELD_ALIASES = {
  protocolo: ["protocolo", "id", "id suporte", "numero chamado", "n chamado", "ticket"],
  responsavelAbertura: [
    "responsavel da abertura", "responsavel", "abertura por", "cliente", "nome cliente",
    "razao social", "nome", "nome completo", "parceiro"
  ],
  cpfCnpj: ["cpf/cnpj", "cpf cnpj", "cpfcnpj", "cpf", "cnpj", "documento"],
  contato: [
    "contato", "contato ou grupo", "telefone", "celular", "whatsapp", "email",
    "telefone comercial"
  ],
  tipo: ["tipo", "tipo de suporte"],
  ac: ["ac"],
  tecnico: ["tecnico", "tecnico responsavel", "responsavel tecnico", "analista"],
  status: [
    "status", "sit. atendimento", "situacao atendimento", "situacao", "situação", "coluna 8",
    "etapa do lead"
  ],
  statusAbertura: ["status da abertura", "status abertura"],
  dataAbertura: [
    "data abertura", "data de abertura", "abertura", "aberto em", "created at", "data",
    "carimbo de data/hora", "carimbo de data hora", "criado em"
  ],
  descricao: [
    "descricao", "descrição", "description", "descricao do problema",
    "descrição do problema", "observacao", "observação", "resumo"
  ],
  observacaoTecnico: ["observacao do tecnico", "observacao do técnico"],

  /* Colunas do painel "Central de Chamados". Os nomes chegam com e sem acento
     dependendo de quem exportou, e `normalizeKey` já remove os acentos — as
     duas grafias aqui embaixo existiriam duplicadas à toa. */
  dataFinalizacao: [
    "encerrado em", "data encerramento", "data de encerramento", "fechado em", "fechado as"
  ],
  /* Export do Kommo: "Fechado às" só é preenchido quando o LEAD (não o
     chamado de suporte) é marcado como ganho/perdido, o que não acontece
     nesse funil — quase toda linha finalizada chega com "não fechado" ali.
     "modificada em" é o melhor proxy real do encerramento nesses casos. */
  dataModificacao: ["modificada em", "modificado em", "atualizado em", "updated at"],
  motivoChamado: ["motivo", "motivo do chamado"],
  usoCat: ["motivo da utilizacao", "motivo de utilizacao", "utilizacao"],
  usoPlat: ["plataforma"],
  followupsCount: ["follow-ups", "follow ups", "followups"],
  foraDaMedia: ["fora da media?", "fora da media", "excluido da media"],
  justificativaMedia: ["justificativa", "justificativa da media"],
  tecnicoCentral: ["responsavel"],
  // Valor do lead/negócio ligado ao chamado — alimenta a métrica de venda
  // ganha/perdida do dashboard (ver ConcluirSuporteModal/metricasService).
  valorVenda: ["lead venda r$", "valor da venda", "venda r$"],

  /* Colunas exclusivas do export de leads do Kommo (ver ehLayoutKommo). Ficam
     em chaves próprias, fora dos grupos genéricos acima, porque o valor de
     "Pessoa de contato" e "Usuário responsável" no Kommo é quem ABRIU/está
     tratando o lead (Suporte/Iris/Diane/Certify/Atendimento) — não o nome do
     cliente nem um técnico do sistema (nenhum bate com TECNICOS_DISPONIVEIS
     em src/shared/tecnico.js). */
  leadTitulo: ["lead titulo"],
  nomeCompletoKommo: ["nome completo"],
  // Chave própria (não entra no grupo de responsavelAbertura) para não afetar
  // a prioridade por ordem de coluna que decide aquele campo — só dá um
  // segundo destino pro mesmo dado, fora do Kommo.
  clienteGenerico: ["cliente"],
  pessoaDeContatoKommo: ["pessoa de contato"],
  usuarioResponsavelKommo: ["usuario responsavel"],
  protocoloCertificado: ["protocolo do certificado"],
  sistemaKommo: ["sistema"]
};

/** "Autolead: Fulano" -> "Fulano" — o prefixo é gerado pelo Kommo, não faz parte do nome. */
function semPrefixoAutolead(texto) {
  return norm(texto).replace(/^autolead:\s*/i, "");
}

export const COLUNAS_EXPORT = [
  "dataAbertura", "dataFinalizacao", "responsavelAbertura", "protocolo", "tipo", "ac", "contato",
  "descricao", "status", "tecnico", "statusAbertura", "cpfCnpj",
  "motivoCat", "motivoDetalhe", "usoCat", "usoPlat", "excluirDaMedia", "justificativaMedia"
];

/* ------------------------------------------------------------- utilitários */

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function norm(value) {
  return String(value || "")
    .trim()
    // Excel força um campo a ser lido como texto prefixando com um apóstrofo
    // (ex.: telefone "'+5511999999999") — sem isso o "'" vira parte do dado.
    .replace(/^'(?=\S)/, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Excel guarda data como número de dias desde 30/12/1899. */
function excelSerialToIsoDateTime(serial) {
  const base = new Date(Date.UTC(1899, 11, 30));
  const ms = Math.round(Number(serial) * 24 * 60 * 60 * 1000);
  const date = new Date(base.getTime() + ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Data brasileira com ponto OU barra: "02.09.2026", "02/09/2026 14:30".
 *
 * O `Date` nativo lê as duas como MM/DD/YYYY (formato dos EUA) — sem este
 * parser, "02/09/2026" (2 de setembro) virava silenciosamente 9 de fevereiro,
 * e "28/08/2026" viraria data inválida. Datas ISO não passam por aqui: o ano
 * de quatro dígitos no início não casa com `\d{1,2}`.
 */
const DATA_PONTUADA_RE =
  /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function parseDataPontuada(texto) {
  const m = DATA_PONTUADA_RE.exec(texto);
  if (!m) return null;
  const [, dia, mes, ano, hora = "0", min = "0", seg = "0"] = m;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;
  const data = new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(min),
    Number(seg)
  );
  return Number.isNaN(data.getTime()) ? null : data;
}

function normalizeDateTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialToIsoDateTime(value);
  const text = norm(value);
  if (!text) return "";
  const pontuada = parseDataPontuada(text);
  if (pontuada) return pontuada.toISOString();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function mapStatus(value) {
  const v = norm(value).toUpperCase();
  // Sem acento, para bater com "EM ATENDIMENTO" / "EM FINALIZAÇÃO" do funil de
  // CRM independente de como o export escreveu os acentos.
  const semAcento = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (v === "EM ABERTO" || v === "ABERTO") return "EM ABERTO";
  if (v === "FINALIZADO" || v === "CONCLUIDO" || v === "CONCLUÍDO") return "FINALIZADO";
  if (
    v === "EM ANDAMENTO" ||
    v === "EM_ATENDIMENTO" ||
    semAcento === "EM ATENDIMENTO" ||
    semAcento === "EM FINALIZACAO" ||
    v.includes("TRATATIV")
  ) {
    return "EM ANDAMENTO";
  }
  if (v === "SEM RETORNO") return "SEM RETORNO";
  // Vocabulário do painel "Central de Chamados".
  if (semAcento.includes("ENCERRADO COM SUCESSO")) return "FINALIZADO";
  if (semAcento.includes("ENCERRADO SEM SUCESSO")) return "SEM RETORNO";
  // "Aguardando suporte" (funil do Kommo) é o oposto de "aguardando cliente":
  // ninguém pegou o chamado ainda — a checagem específica precisa vir antes
  // da genérica "AGUARDANDO" logo abaixo, que é para chamado já em andamento.
  if (semAcento === "AGUARDANDO SUPORTE") return "EM ABERTO";
  // "Aguardando cliente" é chamado vivo, com o técnico já envolvido.
  if (semAcento.includes("AGUARDANDO")) return "EM ANDAMENTO";
  if (v === "REAGENDADO" || v.includes("REAGEND")) return "REAGENDADO";
  return "EM ABERTO";
}

function findField(row, key) {
  const aliases = FIELD_ALIASES[key];
  for (const [header, value] of Object.entries(row)) {
    const normalizedHeader = normalizeKey(header);
    if (IGNORED_FIELDS.has(normalizedHeader)) continue;
    if (aliases.includes(normalizedHeader)) return value;
  }
  return "";
}

/**
 * A planilha da "Central de Chamados" usa "Cliente" para o cliente e
 * "Responsável" para quem atendeu — invertido em relação às planilhas antigas,
 * onde "Responsável" era quem abriu o chamado. Sem reconhecer o layout, o
 * técnico viria vazio em todas as linhas e o ranking do dashboard ficaria com
 * 300 chamados "Não atribuído".
 *
 * A marca do layout é a coluna "Motivo da utilização", que só existe lá.
 */
function ehLayoutCentral(row) {
  const headers = Object.keys(row).map(normalizeKey);
  return headers.includes("motivo da utilizacao") || headers.includes("motivo de utilizacao");
}

/**
 * Export de leads do Kommo (ex.: funil "07 - Funil de Suporte"): a combinação
 * "Etapa do lead" + "Funil de vendas" só existe nesse layout. Reconhecê-lo
 * importa porque o ID do lead vira a chave do documento (`kommo_lead_<id>`),
 * a mesma usada pelo webhook do Kommo — sem isso, importar o CSV e depois
 * ligar o webhook duplicaria cada chamado.
 */
function ehLayoutKommo(row) {
  const headers = Object.keys(row).map(normalizeKey);
  return headers.includes("etapa do lead") && headers.includes("funil de vendas");
}

/** "não fechado" (Kommo) não é uma data — é a ausência dela. */
function ehDataVazia(valor) {
  const t = normalizeKey(valor);
  return !t || t === "nao fechado";
}

/** "Sim (excluído)" / "Sim (3 follow-ups)" / "" — só o primeiro é manual. */
function lerForaDaMedia(valor) {
  const texto = normalizeKey(valor);
  if (!texto || texto.startsWith("nao")) return { excluirDaMedia: false, automatico: false };
  if (texto.includes("follow")) return { excluirDaMedia: false, automatico: true };
  return { excluirDaMedia: true, automatico: false };
}

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

function looksLikeCpfCnpj(value) {
  const d = digitsOnly(value);
  return d.length === 11 || d.length === 14;
}

/*
 * Textos que ocupam o lugar do dado sem serem dado. Vinham direto para o campo
 * e viravam 56 "protocolos" diferentes na tela — inclusive um protocolo
 * literalmente chamado "Não informado", que a busca encontrava.
 */
const PLACEHOLDERS = new Set([
  "nao informado", "não informado", "nao identificado", "não identificado",
  "sem protocolo", "n/a", "na", "-", "--", "sem numero", "sem número", "0"
]);

function ehPlaceholder(valor) {
  return PLACEHOLDERS.has(normalizeKey(valor));
}

/**
 * Separa o que veio na coluna de protocolo.
 *
 * Na planilha do painel, esse campo é digitado à mão e recebe de tudo: o
 * protocolo de 9 dígitos, o pedido de 10 dígitos de outro sistema, o CPF do
 * cliente e o texto "Não identificado". Um CPF ali não é lixo — é o documento
 * do cliente no campo errado, e movê-lo para `cpfCnpj` faz a busca por CPF
 * encontrar o chamado.
 */
function separarProtocolo(valor) {
  const bruto = norm(valor);
  if (!bruto || ehPlaceholder(bruto)) return { protocolo: "", cpfCnpj: "" };

  const digitos = digitsOnly(bruto);
  if (digitos.length === 11 || digitos.length === 14) {
    return { protocolo: "", cpfCnpj: formatarCpfCnpj(digitos) };
  }
  if (digitos.length === 9 && digitos === bruto.replace(/\D/g, "") && !/[a-z]/i.test(bruto)) {
    return { protocolo: digitos.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3"), cpfCnpj: "" };
  }
  return { protocolo: bruto, cpfCnpj: "" };
}

function formatarCpfCnpj(digitos) {
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function sanitizeDocId(value, fallbackKey) {
  const id = String(value || "")
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);
  return id || `import_${fallbackKey}_${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeIdPart(value) {
  return norm(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * ID determinístico por protocolo+CPF+data: reimportar a mesma planilha
 * atualiza as linhas em vez de duplicá-las.
 *
 * Quando a linha veio de um export do Kommo, a chave é o ID do lead
 * (`kommo_lead_<id>`) — o mesmo esquema que `src/shared/support-id.js` usa no
 * webhook do Kommo (ver getIdempotencyDocId), para que o registro importado
 * do CSV e a atualização futura via webhook caiam no mesmo documento em vez
 * de duplicar o chamado.
 */
function buildDocId(record, rowIndex) {
  if (record.kommoLeadId) {
    return sanitizeDocId(`kommo_lead_${record.kommoLeadId}`, `row${rowIndex}`);
  }
  const keyParts = [record.protocolo, record.cpfCnpj, record.dataAbertura]
    .map(normalizeIdPart)
    .filter(Boolean);
  if (keyParts.length) return sanitizeDocId(`support_${keyParts.join("_")}`, `row${rowIndex}`);
  return sanitizeDocId("", `row${rowIndex}`);
}

/* ---------------------------------------------------------------- leitura */

let xlsxLib = null;

/** Carrega o SheetJS sob demanda — não entra no bundle de quem nunca importa. */
async function carregarXLSX() {
  if (xlsxLib) return xlsxLib;
  if (window.XLSX) {
    xlsxLib = window.XLSX;
    return xlsxLib;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = XLSX_CDN;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Falha ao carregar a biblioteca de planilhas (XLSX)."));
    document.head.appendChild(script);
  });

  if (!window.XLSX) throw new Error("Biblioteca de planilhas não disponível após o carregamento.");
  xlsxLib = window.XLSX;
  return xlsxLib;
}

function parseRows(rows) {
  const parsed = rows
    .filter((row) => Object.values(row).some((v) => norm(v)))
    .map((row, rowIndex) => {
      const central = ehLayoutCentral(row);
      const kommo = ehLayoutKommo(row);
      const motivoBruto = norm(findField(row, "motivoChamado"));
      const usoCat = classificarUso(findField(row, "usoCat"));
      const fora = lerForaDaMedia(findField(row, "foraDaMedia"));
      const followups = Number(norm(findField(row, "followupsCount"))) || 0;

      const doProtocolo = separarProtocolo(findField(row, "protocolo"));
      const cpfDaColuna = norm(findField(row, "cpfCnpj"));
      const statusResolvido = mapStatus(findField(row, "status"));

      // "Fechado às" do Kommo raramente reflete o encerramento deste funil de
      // suporte (ver ehDataVazia); "modificada em" é o melhor proxy real que
      // temos para quando o chamado terminou.
      const fechadoBruto = findField(row, "dataFinalizacao");
      const dataFinalizacao = !ehDataVazia(fechadoBruto)
        ? normalizeDateTime(fechadoBruto)
        : ["FINALIZADO", "SEM RETORNO"].includes(statusResolvido) &&
            norm(findField(row, "dataModificacao"))
          ? normalizeDateTime(findField(row, "dataModificacao"))
          : "";

      // No Kommo, "Pessoa de contato" (e, na falta dela, "Usuário
      // responsável") é quem está tratando o lead (Suporte/Iris/Diane/
      // Certify/Atendimento) — o mesmo papel que "responsável pela abertura"
      // tem nos outros layouts, então entra ali, não em "tecnico" (nenhum
      // desses nomes é um técnico real do sistema — ver TECNICOS_DISPONIVEIS
      // em src/shared/tecnico.js).
      const responsavelKommo = kommo
        ? norm(findField(row, "pessoaDeContatoKommo")) || norm(findField(row, "usuarioResponsavelKommo"))
        : "";

      // Nome do cliente: "Nome completo" manda; "Lead título" (sem o prefixo
      // "Autolead:") é só o fallback para quando aquela coluna vem vazia.
      const nomeCliente = kommo
        ? norm(findField(row, "nomeCompletoKommo")) || semPrefixoAutolead(findField(row, "leadTitulo"))
        : norm(findField(row, "clienteGenerico"));

      const protocoloCertificado = kommo ? norm(findField(row, "protocoloCertificado")) : "";
      const sistemaKommo = kommo ? norm(findField(row, "sistemaKommo")) : "";
      const valorVendaNum = Number(norm(findField(row, "valorVenda")).replace(",", ".")) || 0;

      const record = {
        // "Protocolo do Certificado" preenche o protocolo quando existe; sem
        // ela, mantém o comportamento de sempre (nº do protocolo da planilha,
        // ou o ID do lead nas linhas do Kommo).
        protocolo: protocoloCertificado
          ? separarProtocolo(protocoloCertificado).protocolo || protocoloCertificado
          : doProtocolo.protocolo,
        responsavelAbertura:
          responsavelKommo || norm(findField(row, "responsavelAbertura")) || "Não informado",
        // Omitido (em vez de "") quando vazio, para não apagar um nome já
        // gravado por um import anterior no modo mesclar.
        // A chave normalizada acompanha o nome para a busca por cliente
        // funcionar também no que veio de planilha (ver chaveNomeCliente).
        ...(nomeCliente ? { nomeCliente, nomeClienteKey: chaveNomeCliente(nomeCliente) } : {}),
        // A coluna própria manda; o CPF resgatado do campo de protocolo entra
        // só quando não existe coluna de documento na planilha.
        cpfCnpj: cpfDaColuna && !ehPlaceholder(cpfDaColuna) ? cpfDaColuna : doProtocolo.cpfCnpj,
        tipo: norm(findField(row, "tipo")) || "Não informado",
        ac: sistemaKommo || norm(findField(row, "ac")) || "Não informado",
        contato: norm(findField(row, "contato")),
        descricao: norm(findField(row, "descricao")),
        observacaoTecnico: norm(findField(row, "observacaoTecnico")),
        // No Kommo não há técnico do sistema na planilha (ver responsavelKommo
        // acima) — fica "Não atribuído" até alguém assumir o chamado no app.
        tecnico:
          norm(central ? findField(row, "tecnicoCentral") : kommo ? "" : findField(row, "tecnico")) ||
          "Não atribuído",
        status: statusResolvido,
        statusAbertura: norm(findField(row, "statusAbertura")),
        dataAbertura: normalizeDateTime(findField(row, "dataAbertura")),
        dataFinalizacao,
        // Categoria fechada para o gráfico, texto original preservado ao lado.
        motivoCat: classificarMotivo(motivoBruto),
        motivoDetalhe: motivoBruto,
        usoCat,
        usoPlat: norm(findField(row, "usoPlat")),
        excluirDaMedia: fora.excluirDaMedia,
        justificativaMedia: norm(findField(row, "justificativaMedia")),
        // O painel de origem já contava os follow-ups; a marcação automática é
        // recalculada a partir do número, não copiada do rótulo.
        foraDaMedia: fora.automatico || followups >= 3,
        /*
         * Só a contagem. A planilha não traz o horário de cada tentativa, e
         * inventar carimbos para preencher o array `followups` seria fabricar
         * histórico — a tela mostra este número como "importado" e não finge
         * que sabe quando cada ligação aconteceu.
         */
        followupsImportados: followups,
        // Valor do lead/negócio ligado ao chamado (ex.: "Lead venda R$" do
        // Kommo) — alimenta o card "Venda ganha/perdida" do dashboard.
        valorVenda: valorVendaNum,
        // Todo chamado com valor de venda importado conta como venda ganha —
        // só entra quando há valor: setar "" aqui apagaria, no modo mesclar,
        // um "PERDIDO" já definido manualmente para quem não trouxe valor
        // nesta reimportação.
        ...(valorVendaNum > 0 ? { vendaStatus: "GANHO" } : {}),
        ...(kommo
          ? {
              // Mesma chave usada pelo webhook do Kommo (kommo_lead_<id>) —
              // ver buildDocId — para o CSV e o webhook caírem no mesmo
              // documento em vez de duplicar o chamado.
              kommoLeadId: norm(findField(row, "protocolo")),
              origemIntegracao: "kommo"
            }
          : {})
      };

      // Algumas planilhas trazem o CPF/CNPJ dentro da coluna de observação.
      if (!record.cpfCnpj && looksLikeCpfCnpj(record.descricao)) {
        record.cpfCnpj = digitsOnly(record.descricao);
        record.descricao = "";
      }

      return { ...record, docId: buildDocId(record, rowIndex) };
    });

  // Linhas idênticas aparecem com frequência em export de CSV. `kommoLeadId`
  // entra na assinatura para que dois leads distintos do Kommo que coincidam
  // em todo o resto (mesmo técnico, status, tipo...) não sejam descartados
  // como se fossem a mesma linha duplicada.
  const vistos = new Set();
  const unicas = parsed.filter((r) => {
    const assinatura = [norm(r.kommoLeadId)]
      .concat(COLUNAS_EXPORT.concat("observacaoTecnico").map((campo) => norm(r[campo])))
      .join("|");
    if (vistos.has(assinatura)) return false;
    vistos.add(assinatura);
    return true;
  });

  /*
   * Duas linhas DIFERENTES podem gerar o mesmo docId: o mesmo cliente abriu
   * dois chamados no mesmo minuto com o mesmo protocolo, e a chave é
   * protocolo+CPF+data. As idênticas já saíram no filtro acima; estas são
   * chamados de verdade, e sem um sufixo o segundo sobrescreveria o primeiro —
   * a importação diria "322 gravados" e o banco ficaria com 321.
   *
   * O sufixo segue a ordem da planilha, que é estável entre exportações do
   * mesmo sistema; reimportar o mesmo arquivo continua atualizando em vez de
   * duplicar.
   */
  const contagem = new Map();
  return unicas.map((r) => {
    const quantas = (contagem.get(r.docId) || 0) + 1;
    contagem.set(r.docId, quantas);
    return quantas === 1 ? r : { ...r, docId: `${r.docId}_${quantas}` };
  });
}

/* --------------------------------------------------------- CSV nativo */

/**
 * Leitor de CSV próprio, sem passar pelo SheetJS.
 *
 * Esta função existe por causa de um bug real: o SheetJS tenta reconhecer datas
 * enquanto lê o CSV e o faz no formato dos EUA. "12/08/2026 13:24" (12 de
 * agosto) virava 8 de dezembro, com a hora descartada, e o texto original nunca
 * chegava ao nosso parser — que sabe ler data brasileira mas só recebia o
 * estrago pronto. Datas com dia acima de 12 nem chegavam a ser datas: viravam
 * texto solto e o registro perdia a abertura.
 *
 * Aqui o CSV é lido como texto puro, célula por célula, e QUEM decide o que é
 * data é o `normalizeDateTime` logo adiante. O SheetJS continua cuidando de
 * .xlsx, onde a data é um número de série sem ambiguidade nenhuma.
 */
function detectarDelimitador(primeiraLinha) {
  const candidatos = [";", ",", "\t"];
  // Fora das aspas: um cabeçalho "Motivo da utilização; Plataforma" tem vírgula
  // nenhuma, mas "Nome, Sobrenome";"x" tem — contar só o que está fora resolve.
  const contar = (delim) => {
    let dentro = false;
    let total = 0;
    for (let i = 0; i < primeiraLinha.length; i += 1) {
      const c = primeiraLinha[i];
      if (c === '"') dentro = !dentro;
      else if (c === delim && !dentro) total += 1;
    }
    return total;
  };
  return candidatos.map((d) => [d, contar(d)]).sort((a, b) => b[1] - a[1])[0][0];
}

export function lerCsv(texto) {
  const limpo = texto.replace(/^\uFEFF/, "");
  const delim = detectarDelimitador(limpo.split(/\r?\n/, 1)[0] || "");

  const linhas = [];
  let campo = "";
  let linha = [];
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];

    if (dentroDeAspas) {
      // "" dentro de campo entre aspas é uma aspa literal.
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') {
        dentroDeAspas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') dentroDeAspas = true;
    else if (c === delim) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }

  if (!linhas.length) return [];

  const cabecalho = linhas[0].map((h) => norm(h));
  return linhas
    .slice(1)
    .filter((celulas) => celulas.some((c) => norm(c)))
    .map((celulas) => {
      // Kommo exporta alguns campos personalizados (ex.: "Protocolo do
      // Certificado") duas vezes — a segunda ocorrência vem sempre vazia.
      // Object.fromEntries ficaria com a ÚLTIMA, que é a vazia; aqui a
      // primeira coluna com valor real é a que vence.
      const linha = {};
      cabecalho.forEach((titulo, i) => {
        const chave = titulo || `coluna_${i}`;
        const valor = celulas[i] ?? "";
        if (!(chave in linha) || (!norm(linha[chave]) && norm(valor))) linha[chave] = valor;
      });
      return linha;
    });
}

/**
 * Lê .xlsx ou .csv e devolve os registros prontos para conferência.
 * Nada é gravado aqui — a escrita é um passo separado, depois do preview.
 */
export async function lerArquivo(file) {
  if (/\.csv$/i.test(file.name)) {
    const texto = await file.text();
    const rows = lerCsv(texto);
    if (!rows.length) throw new Error("O arquivo está vazio ou não tem linhas além do cabeçalho.");
    return parseRows(rows);
  }

  const XLSX = await carregarXLSX();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia ou não pôde ser lida.");

  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", blankrows: false });
  return parseRows(rows);
}

/**
 * Radiografia do que foi lido, antes de qualquer escrita.
 *
 * A amostra de dez linhas mostra que a leitura funcionou; ela não mostra que
 * 153 chamados vieram sem protocolo nem que três têm o encerramento anterior à
 * abertura. São exatamente esses buracos que depois aparecem como barra vazia
 * no dashboard, e é muito mais barato descobri-los aqui do que no gráfico.
 *
 * Cada item traz `nivel`: "aviso" é dado que falta e o dashboard vai mostrar
 * como vazio; "erro" é dado que se contradiz e sai das médias.
 */
export function diagnosticarRegistros(registros = []) {
  const total = registros.length;
  if (!total) return { total: 0, itens: [] };

  const semDataAbertura = registros.filter((r) => !r.dataAbertura).length;
  const invertidas = registros.filter(
    (r) => r.dataAbertura && r.dataFinalizacao && new Date(r.dataFinalizacao) < new Date(r.dataAbertura)
  ).length;
  const futuras = registros.filter(
    (r) => r.dataAbertura && new Date(r.dataAbertura).getTime() > Date.now() + 60000
  ).length;
  const semProtocolo = registros.filter((r) => !r.protocolo).length;
  const semTipo = registros.filter((r) => !r.tipo || r.tipo === "Não informado").length;
  const semAc = registros.filter((r) => !r.ac || r.ac === "Não informado").length;
  const semTecnico = registros.filter((r) => !r.tecnico || r.tecnico === "Não atribuído").length;
  const semMotivo = registros.filter((r) => !r.motivoCat).length;
  const cpfResgatado = registros.filter((r) => r.cpfCnpj).length;

  const itens = [
    ["erro", invertidas, "com encerramento anterior à abertura — ficam fora das médias de tempo"],
    ["erro", futuras, "com abertura no futuro — o dashboard vai apontá-los em vermelho"],
    ["aviso", semDataAbertura, "sem data de abertura — não entram em nenhum período"],
    ["aviso", semProtocolo, "sem protocolo"],
    ["aviso", semTipo, "sem tipo — o gráfico \"Por tipo\" fica com uma barra só"],
    ["aviso", semAc, "sem AC — o gráfico \"Por AC\" fica com uma barra só"],
    ["aviso", semTecnico, "sem técnico — não entram no ranking por técnico"],
    ["aviso", semMotivo, "sem motivo classificado"],
    ["ok", cpfResgatado, "com CPF/CNPJ reconhecido"]
  ]
    .filter(([, quantidade]) => quantidade > 0)
    .map(([nivel, quantidade, texto]) => ({ nivel, quantidade, texto }));

  return { total, itens };
}

/* ----------------------------------------------------------------- escrita */

async function apagarTudo(onProgresso) {
  // O PostgREST exige um filtro em DELETE; `neq` com um id impossível é o
  // "todos". Um único comando, atômico: ou some tudo ou nada (no Firestore eram
  // lotes de 500, e uma queda no meio deixava a coleção pela metade).
  const { count, error } = await supabase
    .from(COLLECTION)
    .delete({ count: "exact" })
    .neq("id", "__nenhum__");
  if (error) throw new Error(error.message);
  onProgresso?.(`Removendo registros existentes... (${count || 0})`);
  return count || 0;
}

/**
 * O upsert em lote do PostgREST grava TODAS as colunas do lote em cada linha e,
 * onde a linha não trouxe a coluna, usa o valor padrão — o que apagaria campos
 * que a planilha não tem (o "mesclar"). Por isso as linhas são agrupadas pelo
 * conjunto exato de colunas que trazem: dentro de cada grupo todas as linhas
 * gravam as mesmas colunas e o resto do registro fica intacto.
 */
function agruparPorColunas(linhas) {
  const grupos = new Map();
  for (const linha of linhas) {
    const chave = Object.keys(linha).sort().join("|");
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(linha);
  }
  return [...grupos.values()];
}

/**
 * Grava os registros lidos.
 *
 * modo "mesclar": faz merge por docId, preservando campos que a planilha não traz.
 * modo "substituir": APAGA a tabela inteira antes. É irreversível.
 */
export async function importarRegistros(registros, modo = "mesclar", onProgresso) {
  if (!registros.length) return { gravados: 0, removidos: 0 };

  let removidos = 0;
  if (modo === "substituir") {
    removidos = await apagarTudo(onProgresso);
  }

  let gravados = 0;
  for (let i = 0; i < registros.length; i += BATCH_SIZE) {
    const lote = registros.slice(i, i + BATCH_SIZE);
    const linhas = [];

    lote.forEach((registro, indice) => {
      const { docId: bruto, ...campos } = registro;
      const docId = sanitizeDocId(bruto, `b${i + indice}`);
      if (!docId) return;
      linhas.push({
        id: docId,
        ...paraLinha({
          ...campos,
          // Linhas de um export do Kommo já chegam com origemIntegracao:
          // "kommo" (ver ehLayoutKommo em parseRows); as demais continuam
          // marcadas como importação de planilha comum.
          origemIntegracao: campos.origemIntegracao || "import-csv"
        })
      });
    });

    for (const grupo of agruparPorColunas(linhas)) {
      const { error } = await supabase
        .from(COLLECTION)
        .upsert(grupo, { onConflict: "id", defaultToNull: false });
      if (error) throw new Error(error.message);
    }

    gravados += lote.length;
    onProgresso?.(`Gravando... ${gravados} de ${registros.length}`);
  }

  return { gravados, removidos };
}

/* --------------------------------------------------------------- exportação */

function resolverDataExport(data = {}) {
  const bruto = norm(data.dataAbertura || data.carimboDataHora || "");
  if (bruto) {
    const parsed = new Date(bruto);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (data.createdAt) {
    const parsed = new Date(data.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseFiltroData(dateStr, fimDoDia = false) {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T${fimDoDia ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatarDataCsv(value) {
  if (!value) return "";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString("pt-BR");
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("pt-BR");
}

/**
 * Segunda passada do filtro de período, agora no cliente.
 *
 * A consulta ao banco corta por `data_abertura` em UTC; aqui a data é
 * resolvida de novo no horário do navegador (e cai para `createdAt` quando o
 * registro não tem data de abertura), que é o que a pessoa quis dizer ao
 * escolher "de hoje até hoje".
 */
function filtrarPorPeriodo(docs, dataInicio, dataFim) {
  const inicio = parseFiltroData(dataInicio, false);
  const fim = parseFiltroData(dataFim, true);
  if (!inicio && !fim) return docs;

  return docs.filter((dados) => {
    const data = resolverDataExport(dados);
    if (!data) return false;
    if (inicio && data < inicio) return false;
    if (fim && data > fim) return false;
    return true;
  });
}

/**
 * Exporta CSV do período e dispara o download.
 * Devolve a quantidade exportada — 0 significa "nada no período".
 */
export async function exportarCSV({ dataInicio = "", dataFim = "" } = {}) {
  // O PostgREST devolve no máximo 1000 linhas por resposta: sem paginar, uma
  // exportação de 1500 chamados sairia com 1000 e ninguém notaria.
  const PAGINA = 1000;
  // Folga de um dia nas pontas: o corte exato é feito depois, no horário local.
  const DIA_MS = 24 * 60 * 60 * 1000;
  const linhasDoBanco = [];
  for (let de = 0; ; de += PAGINA) {
    let q = supabase.from(COLLECTION).select("*");
    if (dataInicio) q = q.gte("data_abertura", new Date(Date.parse(`${dataInicio}T00:00:00Z`) - DIA_MS).toISOString());
    if (dataFim) q = q.lte("data_abertura", new Date(Date.parse(`${dataFim}T23:59:59Z`) + DIA_MS).toISOString());
    // Ordem estável (id desempata) — sem ela a paginação pode repetir ou pular linhas.
    const { data, error } = await q
      .order("data_abertura", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    linhasDoBanco.push(...data);
    if (data.length < PAGINA) break;
  }

  const filtrados = filtrarPorPeriodo(linhasDoBanco.map(linhaParaDados), dataInicio, dataFim);
  if (!filtrados.length) return 0;

  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    COLUNAS_EXPORT.join(","),
    ...filtrados.map((r) => {
      const linha = {
        ...r,
        dataAbertura: formatarDataCsv(r.dataAbertura || r.carimboDataHora || r.createdAt),
        dataFinalizacao: formatarDataCsv(r.dataFinalizacao),
        excluirDaMedia: r.excluirDaMedia ? "Sim" : ""
      };
      return COLUNAS_EXPORT.map((h) => escapar(linha[h])).join(",");
    })
  ].join("\n");

  // O BOM faz o Excel abrir os acentos corretamente.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `suportes_tecnicos_${dataInicio || "inicio"}_a_${dataFim || "fim"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return filtrados.length;
}
