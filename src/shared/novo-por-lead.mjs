/**
 * novo-por-lead.mjs — "Novo suporte" a partir de um lead do Kommo.
 *
 * Pedido do usuário (2026-10-01): o botão "Novo suporte" pede só o lead; o
 * sistema lê o Kommo e a conversa (com a IA do n8n) e abre o formulário de
 * sempre já preenchido, para o técnico conferir e salvar.
 *
 * Aqui ficam as partes puras (testáveis sem rede): ler o id do lead do que o
 * técnico colou, achar a conversa nos eventos do lead e montar os campos do
 * formulário a partir do Kommo + conversa + resposta da IA.
 *
 * ESM puro, sem dependências: o Worker e os testes importam o mesmo arquivo.
 */

import { chaveNome } from "./kommo-campos.mjs";
import { montarPrefill, sistemaDoProtocolo } from "./prefill-finalizacao.mjs";

// As mesmas opções do formulário (SuporteFormModal.jsx / utils/catalogos.js).
export const TIPOS = ["Suporte tecnico", "Instalação"];
export const MOTIVOS = ["Instalação A1", "Instalação A3", "Exportar certificado", "Alteração de senha", "Outros"];
export const USOS = ["Emitir nota fiscal", "Assinar documentos", "Enviar para contabilidade", "Acessar plataformas", "Outros"];

/**
 * O que o técnico colou -> id do lead. Aceita o número puro ("55312356") ou
 * qualquer link do Kommo com /leads/detail/{id} (inclusive o da aba de chat:
 * .../chats/35228/leads/detail/55312356?t=...). Nada reconhecível -> "".
 */
export function extrairLeadId(texto) {
  const t = String(texto ?? "").trim();
  const doLink = /\/leads\/detail\/(\d{5,12})/.exec(t);
  if (doLink) return doLink[1];
  const soNumero = /^#?\s*(\d{5,12})$/.exec(t);
  return soNumero ? soNumero[1] : "";
}

/**
 * Eventos do lead (GET /api/v4/events, tipos de mensagem do chat) -> id da
 * conversa mais recente. O formato exato de `value_after` não é documentado
 * com precisão; procura `talk_id` em qualquer lugar do evento.
 */
export function talkIdDosEventos(eventos) {
  const lista = [...(eventos || [])].sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));
  for (const ev of lista) {
    const m = /"talk_id"\s*:\s*"?(\d+)"?/.exec(JSON.stringify(ev || {}));
    if (m) return m[1];
  }
  return "";
}

const escolher = (valor, opcoes) => opcoes.find((o) => chaveNome(o) === chaveNome(valor)) || "";

/** Sistema do Kommo ("Consulti", "Valid", "Soluti") -> AC do formulário (só CONSULTI/VALID existem lá). */
function acDoSistema(sistema) {
  const k = chaveNome(sistema);
  if (k.includes("consulti")) return "CONSULTI";
  if (k.includes("valid")) return "VALID";
  return "";
}

/** Telefone do contato (campo de sistema PHONE). */
function telefoneDoContato(contato) {
  const campo = (contato?.custom_fields_values || []).find((c) => c.field_code === "PHONE");
  return String(campo?.values?.[0]?.value || "").trim();
}

/**
 * Kommo + conversa + IA -> o que o formulário recebe.
 *
 * - `campos`: chaves do SuporteFormModal (só as que vierem preenchidas).
 * - `dados`: colunas do chamado que o formulário não mostra, mas que vale
 *   gravar já (email, tipo do certificado) — a tela de finalizar usa.
 * - `fontes`: de onde veio cada campo, para o formulário avisar "IA — confira".
 *
 * Ordem: dado escrito no Kommo/conversa > IA. A IA só completa o que faltar e
 * é a única fonte de motivo, tipo, uso e descrição.
 */
export function montarFormularioNovo({ lead = null, contato = null, mensagens = [], ia = null } = {}) {
  const { campos: pre } = montarPrefill({ lead, contato, mensagens });
  const v = (chave) => (pre[chave] && !pre[chave].sugerido ? pre[chave].valor : "");
  const respostaIA = ia && typeof ia === "object" ? ia : {};
  const textoIA = (chave, limite) => String(respostaIA[chave] ?? "").trim().slice(0, limite);

  const campos = {};
  const fontes = {};
  const por = (chave, valor, fonte) => {
    if (valor === "" || valor === null || valor === undefined || campos[chave]) return;
    campos[chave] = valor;
    fontes[chave] = fonte;
  };

  por("nomeCliente", String(contato?.name || lead?.name || "").replace(/^autolead:\s*/i, "").trim(), "kommo");
  por("contato", telefoneDoContato(contato), "kommo");
  por("cpfCnpj", v("cpfCnpj"), pre.cpfCnpj?.fonte || "kommo");
  por("protocolo", v("protocoloCertificado"), pre.protocoloCertificado?.fonte || "kommo");
  por("ac", acDoSistema(v("sistema")), "kommo");

  // IA: completa documento/protocolo e é a fonte da classificação.
  por("cpfCnpj", textoIA("cpf_cnpj", 32), "ia");
  por("protocolo", textoIA("protocolo", 80), "ia");
  // Sistema (14/10): o formato do protocolo e o Sistema do contato (mesmo de
  // compra incerta) valem mais que o palpite da IA.
  por("ac", acDoSistema(sistemaDoProtocolo(campos.protocolo)), "dedução");
  por("ac", acDoSistema(pre.sistema?.valor), "kommo");
  por("ac", acDoSistema(textoIA("sistema", 40)), "ia");
  por("tipo", escolher(textoIA("tipo", 40), TIPOS), "ia");
  por("motivoCat", escolher(textoIA("motivo_cat", 60), MOTIVOS), "ia");
  por("motivoDetalhe", textoIA("resumo", 160), "ia"); // mesmo limite do campo no formulário
  por("descricao", textoIA("descricao", 1000), "ia");
  const uso = escolher(textoIA("uso_cat", 60), USOS);
  por("usoCat", uso, "ia");
  if (uso === "Emitir nota fiscal" || uso === "Acessar plataformas") por("usoPlat", textoIA("uso_plat", 60), "ia");

  const dados = {};
  const email = v("emailCliente");
  if (email) dados.emailCliente = email;
  const tipoCert = v("tipoCertificado") || textoIA("tipo_certificado", 40);
  if (tipoCert) dados.tipoCertificado = tipoCert;

  return { campos, dados, fontes };
}
