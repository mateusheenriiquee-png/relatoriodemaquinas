import { normalizeSearchText } from "./format";

const digitos = (t) => String(t ?? "").replace(/\D/g, "");

/**
 * O chamado combina com o que foi digitado na busca da lista?
 *
 * Texto: trecho do protocolo, Doc. Cliente, CPF, contato, nome ou número do
 * lead, como sempre. Número (desde 2026-10-09): com 4 dígitos ou mais, compara
 * só os DÍGITOS — "11 94433-4807", "(11) 944334807" e "+55 11 94433-4807"
 * acham o mesmo telefone, e "55914262" acha o lead do Kommo.
 */
export function combinaComBusca(item, termo) {
  const busca = normalizeSearchText(termo);
  if (!busca) return true;
  const textos = [item.protocolo, item.cpfCnpj, item.cpf, item.contato, item.nomeCliente, item.kommoLeadId];
  if (textos.some((t) => normalizeSearchText(t).includes(busca))) return true;

  const numero = digitos(termo);
  // Só quando o termo é basicamente um número (ignora pontuação e espaços).
  if (numero.length < 4 || numero.length < String(termo).replace(/[\s().+\-/#]/g, "").length) return false;
  return [item.protocolo, item.cpfCnpj, item.cpf, item.contato, item.kommoLeadId].some((t) => {
    const d = digitos(t);
    return d && (d.includes(numero) || (numero.length >= 10 && numero.startsWith("55") && d.includes(numero.slice(2))));
  });
}
