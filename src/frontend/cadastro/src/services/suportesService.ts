import { supabase } from "../config/supabase";
import {
  classificarDuplicados,
  variantesCpfCnpj,
  variantesProtocolo,
  type Duplicado,
  type LinhaSuporte
} from "../lib/duplicidade";
import type { FormularioSuporte, NovoSuporte } from "../lib/suporte";

/** Valor entre aspas para o filtro `or` do PostgREST (vírgula e parêntese quebrariam a sintaxe). */
const citar = (v: string) => `"${v.replace(/["\\]/g, "")}"`;

/**
 * Procura, no banco inteiro, chamados que já correspondam ao que está sendo
 * cadastrado (regras em lib/duplicidade.ts).
 *
 * Em caso de falha LANÇA o erro em vez de devolver "nenhum duplicado": uma
 * verificação que falha calada deixaria passar justamente o que ela existe para
 * barrar. Quem chama decide o que mostrar.
 */
export async function buscarDuplicados(form: FormularioSuporte): Promise<Duplicado[]> {
  const filtros: string[] = [];
  const protocolos = variantesProtocolo(form.protocolo);
  const cpfs = variantesCpfCnpj(form.cpfCnpj);
  if (protocolos.length) filtros.push(`protocolo.in.(${protocolos.map(citar).join(",")})`);
  if (cpfs.length) filtros.push(`cpf_cnpj.in.(${cpfs.map(citar).join(",")})`);
  if (!filtros.length) return [];

  const { data, error } = await supabase
    .from("suportes")
    .select("id, protocolo, cpf_cnpj, status, data_abertura, responsavel_abertura")
    .or(filtros.join(","))
    .order("data_abertura", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return classificarDuplicados((data ?? []) as LinhaSuporte[], form);
}

/**
 * Grava o chamado direto no Supabase, como o painel principal faz. A RLS já
 * libera a criação para qualquer usuário autenticado. O `id` nasce aqui só
 * para o retorno; o banco também teria gerado um.
 */
export async function criarSuporte(suporte: NovoSuporte): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from("suportes").insert({
    id,
    status: suporte.status,
    status_abertura: suporte.statusAbertura,
    data_abertura: suporte.dataAbertura,
    responsavel_abertura: suporte.responsavelAbertura,
    tipo: suporte.tipo,
    ac: suporte.ac,
    // Campos vazios não são enviados: o banco usa o padrão ('').
    ...(suporte.protocolo ? { protocolo: suporte.protocolo } : {}),
    ...(suporte.cpfCnpj ? { cpf_cnpj: suporte.cpfCnpj } : {}),
    ...(suporte.contato ? { contato: suporte.contato } : {}),
    historico: suporte.historico,
    origem_integracao: "cadastro"
  });
  if (error) throw new Error(error.message);
  return id;
}
