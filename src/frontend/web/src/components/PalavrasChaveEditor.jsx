import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ToastProvider";
import { salvarPalavrasChave, subscribePalavrasChave } from "../services/palavrasChaveService";
import { adicionarPalavras, normalizarPalavra, removerPalavra } from "../utils/palavrasChave";
import { formatDate } from "../utils/format";

/**
 * Editor das palavras-chave do chat (aba Admin, 13/10). Cada mudança grava na
 * hora: o n8n lê a lista a cada mensagem, então vale para a próxima que chegar.
 * `compacto`: só o campo de acrescentar (usado na lista de possíveis pedidos).
 */
export default function PalavrasChaveEditor({ compacto = false }) {
  const { displayName } = useAuth();
  const toast = useToast();
  const [dados, setDados] = useState({ lista: [], atualizadoPor: "", atualizadoEm: "" });
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState("");
  const [filtro, setFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(
    () =>
      subscribePalavrasChave(
        (d) => {
          setDados(d);
          setCarregando(false);
        },
        (err) => {
          setCarregando(false);
          toast.error(err?.message || "Não foi possível carregar as palavras-chave.");
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function gravar(lista, mensagem) {
    setSalvando(true);
    try {
      await salvarPalavrasChave(lista, { por: displayName });
      toast.success(mensagem);
      return true;
    } catch (err) {
      toast.error(err?.message || "Não foi possível salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function acrescentar(e) {
    e?.preventDefault();
    const r = adicionarPalavras(dados.lista, novo);
    if (!r.adicionadas.length) {
      toast.info(r.repetidas.length ? `Já está na lista: ${r.repetidas.join(", ")}` : "Escreva ao menos 2 letras.");
      return;
    }
    const partes = [`Acrescentada(s): ${r.adicionadas.join(", ")}`];
    if (r.repetidas.length) partes.push(`já existiam: ${r.repetidas.join(", ")}`);
    if (await gravar(r.lista, partes.join(" · "))) setNovo("");
  }

  const visiveis = useMemo(() => {
    const f = normalizarPalavra(filtro);
    const lista = f ? dados.lista.filter((p) => p.includes(f)) : dados.lista;
    return [...lista].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dados.lista, filtro]);

  const formulario = (
    <form className="palavras-form" onSubmit={acrescentar}>
      <input
        type="text"
        value={novo}
        onChange={(e) => setNovo(e.target.value)}
        placeholder="Nova palavra ou expressão (várias: separe por vírgula)"
        aria-label="Nova palavra-chave"
        disabled={salvando}
      />
      <button type="submit" className="btn btn-primary btn-small" disabled={salvando || !novo.trim()}>
        Acrescentar
      </button>
    </form>
  );

  if (compacto) {
    return (
      <div className="palavras-compacto">
        <span className="palavras-dica">Faltou uma palavra para o chat reconhecer esse pedido? Acrescente aqui:</span>
        {formulario}
      </div>
    );
  }

  return (
    <div className="palavras-editor">
      <p className="palavras-dica">
        A mensagem do cliente só vai para a IA se tiver alguma destas palavras ou expressões. Acentos e
        maiúsculas não importam, e a palavra vale inteira ("pin" não pega "spinner"). A mudança vale a partir
        da próxima mensagem — não precisa mexer no n8n.
      </p>
      {formulario}
      <div className="palavras-topo">
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Procurar na lista"
          aria-label="Procurar palavra-chave"
        />
        <span className="palavras-meta">
          {carregando ? "Carregando…" : `${dados.lista.length} palavra(s)`}
          {dados.atualizadoPor ? ` · última mudança: ${dados.atualizadoPor}` : ""}
          {dados.atualizadoEm ? `, ${formatDate(dados.atualizadoEm)}` : ""}
        </span>
      </div>
      <ul className="palavras-lista">
        {visiveis.map((p) => (
          <li key={p} className="palavras-chip">
            <span>{p}</span>
            <button
              type="button"
              title={`Tirar "${p}" da lista`}
              aria-label={`Tirar ${p} da lista`}
              disabled={salvando}
              onClick={() => gravar(removerPalavra(dados.lista, p), `"${p}" saiu da lista.`)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {!carregando && !visiveis.length ? <p className="palavras-dica">Nenhuma palavra encontrada.</p> : null}
    </div>
  );
}
