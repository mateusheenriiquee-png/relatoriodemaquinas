import { formatCpfCnpj, formatProtocolo, norm } from "./formatacao";
import type { FormularioSuporte } from "./suporte";

/**
 * Regras para decidir se um chamado que está sendo aberto já existe.
 *
 *  - Mesmo PROTOCOLO, em qualquer status → duplicado: o protocolo identifica
 *    UM atendimento, então repetir é sempre erro. Bloqueia.
 *  - Mesmo CPF/CNPJ com chamado ainda ABERTO (em aberto, em andamento,
 *    reagendado) → provável duplicidade: o cliente já está na fila. Avisa e
 *    deixa a pessoa decidir, porque existem casos legítimos (dois problemas
 *    diferentes do mesmo cliente).
 *  - Mesmo CPF/CNPJ com chamado já encerrado NÃO conta: reabrir suporte para
 *    quem já foi atendido é o dia a dia, e alertar sempre ensinaria a ignorar.
 */

export type MotivoDuplicidade = "protocolo" | "cpf";

/** As colunas de `suportes` que a verificação lê. */
export interface LinhaSuporte {
  id: string;
  protocolo: string;
  cpf_cnpj: string;
  status: string;
  data_abertura: string | null;
  responsavel_abertura: string;
}

export interface Duplicado {
  id: string;
  protocolo: string;
  cpfCnpj: string;
  status: string;
  dataAbertura: string | null;
  responsavelAbertura: string;
  motivo: MotivoDuplicidade;
}

const STATUS_ENCERRADOS = new Set(["FINALIZADO", "SEM RETORNO"]);

/** O que foi digitado e a forma canônica: o banco pode ter guardado qualquer das duas. */
function variantes(valor: string, formatar: (v: string) => string): string[] {
  const bruto = norm(valor);
  if (!bruto) return [];
  return [...new Set([bruto, norm(formatar(bruto))])];
}

export const variantesProtocolo = (v: string) => variantes(v, formatProtocolo);
export const variantesCpfCnpj = (v: string) => variantes(v, formatCpfCnpj);

const comparavel = (v: string) => norm(v).replace(/[^0-9a-z]/gi, "").toLowerCase();

/**
 * Do que o banco devolveu, separa o que realmente conta como duplicado. A
 * consulta traz candidatos amplos (as variantes de escrita); a regra de status
 * e a comparação sem pontuação são feitas aqui, onde dá para testar.
 */
export function classificarDuplicados(linhas: LinhaSuporte[], form: FormularioSuporte): Duplicado[] {
  const protocolo = comparavel(form.protocolo);
  const cpf = comparavel(form.cpfCnpj);
  const achados: Duplicado[] = [];

  for (const linha of linhas) {
    const mesmoProtocolo = protocolo !== "" && comparavel(linha.protocolo) === protocolo;
    const mesmoCpfAberto =
      cpf !== "" && comparavel(linha.cpf_cnpj) === cpf && !STATUS_ENCERRADOS.has(linha.status);
    if (!mesmoProtocolo && !mesmoCpfAberto) continue;

    achados.push({
      id: linha.id,
      protocolo: linha.protocolo,
      cpfCnpj: linha.cpf_cnpj,
      status: linha.status,
      dataAbertura: linha.data_abertura,
      responsavelAbertura: linha.responsavel_abertura,
      motivo: mesmoProtocolo ? "protocolo" : "cpf"
    });
  }

  // Bloqueantes primeiro; dentro de cada grupo, o mais recente no topo.
  return achados.sort(
    (a, b) =>
      Number(b.motivo === "protocolo") - Number(a.motivo === "protocolo") ||
      new Date(b.dataAbertura ?? 0).getTime() - new Date(a.dataAbertura ?? 0).getTime()
  );
}

/** Só o protocolo repetido impede o cadastro; o resto é aviso. */
export const bloqueia = (duplicados: Duplicado[]) => duplicados.some((d) => d.motivo === "protocolo");
