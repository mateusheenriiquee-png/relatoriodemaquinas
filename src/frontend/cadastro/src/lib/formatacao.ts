/**
 * Formatação dos campos do cadastro. Mesmas regras da versão em JS puro: quem
 * digita raramente formata, e o banco guarda o formato canônico para a busca
 * do painel principal achar o chamado (ela procura pelas variações formatadas).
 */

export const norm = (valor: unknown): string => String(valor ?? "").trim().replace(/\s+/g, " ");

/** "123456789" → "123-456-789". Qualquer outra coisa fica como veio. */
export function formatProtocolo(valor: string): string {
  const v = valor.trim();
  if (!v || /^\d{3}-\d{3}-\d{3}$/.test(v)) return v;
  const digitos = v.replace(/\D/g, "");
  return digitos.length === 9 ? digitos.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3") : v;
}

/** 11 dígitos viram CPF, 14 viram CNPJ. Já formatado ou fora disso, fica como veio. */
export function formatCpfCnpj(valor: string): string {
  const v = valor.trim();
  if (!v) return v;
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v)) return v;
  const digitos = v.replace(/\D/g, "");
  if (digitos.length === 11) return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digitos.length === 14) return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

/** Telefone com DDD: "(85) 99999-9999". Nome de grupo ou número curto fica como veio. */
export function formatContato(valor: string): string {
  const v = valor.trim();
  if (!v) return v;
  const digitos = v.replace(/\D/g, "");
  if (digitos.length < 10) return v;
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

/** Valor para `<input type="datetime-local">`, no fuso do navegador. */
export function paraDatetimeLocal(data: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(data.getMinutes())}`;
}
