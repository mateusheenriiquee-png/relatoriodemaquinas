import { formatContato, formatCpfCnpj, formatProtocolo, norm } from "./formatacao";

export const TIPOS = ["Suporte tecnico", "Instalação", "Configuração de Maquina", "Treinamento"] as const;
export const ACS = ["CONSULTI", "VALID"] as const;

export type Tipo = (typeof TIPOS)[number];
export type Ac = (typeof ACS)[number];

export interface FormularioSuporte {
  protocolo: string;
  cpfCnpj: string;
  contato: string;
  tipo: Tipo;
  ac: Ac;
}

export const FORMULARIO_VAZIO: FormularioSuporte = {
  protocolo: "",
  cpfCnpj: "",
  contato: "",
  tipo: "Suporte tecnico",
  ac: "CONSULTI"
};

export interface EntradaHistorico {
  em: string;
  texto: string;
  por: string;
}

/** O documento como ele vai para `suportes_tecnicos` (sem os carimbos do servidor). */
export interface NovoSuporte {
  status: "EM ABERTO";
  statusAbertura: "DEVIDO";
  dataAbertura: string;
  responsavelAbertura: string;
  tipo: Tipo;
  ac: Ac;
  protocolo?: string;
  cpfCnpj?: string;
  contato?: string;
  historico: EntradaHistorico[];
}

/**
 * Sem protocolo e sem CPF/CNPJ o chamado não tem por onde ser achado depois —
 * a busca do painel procura exatamente por esses campos.
 */
export function faltaIdentificacao(form: FormularioSuporte): boolean {
  return !norm(form.protocolo) && !norm(form.cpfCnpj);
}

/**
 * Monta o documento do chamado. Campos vazios não entram (em vez de gravar "").
 *
 * O histórico segue o formato do painel principal (`entradaHistorico` em
 * src/frontend/web/src/services/suportesService.js): sem ele, o chamado aberto
 * por aqui apareceria no painel com a linha do tempo vazia.
 */
export function montarSuporte(form: FormularioSuporte, responsavel: string, agora = new Date()): NovoSuporte {
  const doc: NovoSuporte = {
    status: "EM ABERTO",
    statusAbertura: "DEVIDO",
    dataAbertura: agora.toISOString(),
    responsavelAbertura: norm(responsavel) || "Responsavel",
    tipo: form.tipo,
    ac: form.ac,
    historico: [
      {
        em: agora.toISOString(),
        texto: `Chamado aberto · ${form.tipo} · ${form.ac} · pelo cadastro rápido`,
        por: norm(responsavel)
      }
    ]
  };

  const protocolo = norm(formatProtocolo(form.protocolo));
  const cpfCnpj = norm(formatCpfCnpj(form.cpfCnpj));
  const contato = norm(formatContato(form.contato));
  if (protocolo) doc.protocolo = protocolo;
  if (cpfCnpj) doc.cpfCnpj = cpfCnpj;
  if (contato) doc.contato = contato;

  return doc;
}
