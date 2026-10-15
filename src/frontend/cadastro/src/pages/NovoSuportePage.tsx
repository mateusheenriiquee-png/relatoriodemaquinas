import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import Brand from "../components/Brand";
import DuplicadoModal from "../components/DuplicadoModal";
import Notificacao, { type NotificacaoDados } from "../components/Notificacao";
import ThemeToggle from "../components/ThemeToggle";
import { bloqueia, type Duplicado } from "../lib/duplicidade";
import { paraDatetimeLocal } from "../lib/formatacao";
import { ACS, FORMULARIO_VAZIO, faltaContato, montarSuporte, type FormularioSuporte } from "../lib/suporte";
import { buscarDuplicados, criarSuporte } from "../services/suportesService";

export default function NovoSuportePage() {
  const { nome, sair } = useAuth();
  const [form, setForm] = useState<FormularioSuporte>(FORMULARIO_VAZIO);
  const [erroContato, setErroContato] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [notificacao, setNotificacao] = useState<NotificacaoDados | null>(null);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  // Só para exibição: o carimbo real é o instante do clique em salvar.
  const [agora, setAgora] = useState(() => new Date());
  const protocoloRef = useRef<HTMLInputElement>(null);
  const contatoRef = useRef<HTMLInputElement>(null);

  const fecharNotificacao = useCallback(() => setNotificacao(null), []);

  useEffect(() => {
    protocoloRef.current?.focus();
  }, []);

  // Mantém o carimbo exibido atual num formulário que fica aberto o dia todo.
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  function alterar<K extends keyof FormularioSuporte>(campo: K, valor: FormularioSuporte[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    if (campo === "contato") setErroContato(false);
  }

  function limpar() {
    setForm(FORMULARIO_VAZIO);
    setErroContato(false);
    setAgora(new Date());
    protocoloRef.current?.focus();
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;

    if (faltaContato(form)) {
      setErroContato(true);
      setNotificacao({ mensagem: "Informe o contato antes de salvar.", tipo: "error" });
      contatoRef.current?.focus();
      return;
    }

    setSalvando(true);
    // Verifica ANTES de gravar se o suporte já existe no banco. Se a própria
    // verificação falhar, não grava: seguir sem checar deixaria passar
    // exatamente o que ela existe para barrar.
    try {
      const achados = await buscarDuplicados(form);
      if (achados.length) {
        setDuplicados(achados);
        setSalvando(false);
        return;
      }
    } catch (erro) {
      console.error("[Cadastro] Falha ao verificar duplicidade:", erro);
      setNotificacao({
        mensagem: "Não foi possível verificar se este suporte já existe. Nada foi salvo — tente novamente.",
        tipo: "error"
      });
      setSalvando(false);
      return;
    }

    await gravar();
  }

  /** Grava de fato. Chamado direto quando não há duplicado, ou após "cadastrar mesmo assim". */
  async function gravar() {
    setSalvando(true);
    try {
      await criarSuporte(montarSuporte(form, nome));
      setNotificacao({ mensagem: "Suporte adicionado com sucesso.", tipo: "success", duracao: 2200 });
      limpar();
    } catch (erro) {
      console.error("[Cadastro] Falha ao salvar suporte:", erro);
      setNotificacao({
        mensagem:
          erro instanceof Error && /permission|row-level security|JWT/i.test(erro.message)
            ? "Sem permissão para salvar. Faça login novamente."
            : "Não foi possível salvar o suporte. Tente novamente.",
        tipo: "error"
      });
    } finally {
      setSalvando(false);
    }
  }

  const classeCampoContato = `field${erroContato ? " required-error" : ""}`;

  return (
    <div className="container novo-suporte-page">
      <header className="header">
        <Brand subtitulo="Novo suporte" />
        <div className="actions">
          <ThemeToggle />
          <span className="user-info">
            <span>{nome}</span>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => void sair()}>
              Sair
            </button>
          </span>
        </div>
      </header>

      <p className="novo-suporte-intro">
        Preencha os dados abaixo para registrar um novo suporte. Antes de salvar, verificamos se ele já existe
        no banco de dados do painel principal.
      </p>

      <section className="novo-suporte-card">
        <form className="novo-suporte-form" onSubmit={aoEnviar} noValidate>
          <div className="field">
            <label htmlFor="protocolo">Protocolo (opcional)</label>
            <input
              id="protocolo"
              ref={protocoloRef}
              maxLength={80}
              value={form.protocolo}
              onChange={(e) => alterar("protocolo", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="responsavelAbertura">Responsável da abertura</label>
            <input id="responsavelAbertura" maxLength={120} value={nome} disabled />
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="cpfCnpj">CPF/CNPJ (opcional)</label>
              <input
                id="cpfCnpj"
                maxLength={32}
                value={form.cpfCnpj}
                onChange={(e) => alterar("cpfCnpj", e.target.value)}
              />
            </div>
            <div className={classeCampoContato}>
              <label htmlFor="contato">Contato ou grupo</label>
              <input
                id="contato"
                ref={contatoRef}
                value={form.contato}
                aria-invalid={erroContato || undefined}
                aria-describedby={erroContato ? "erro-contato" : undefined}
                onChange={(e) => alterar("contato", e.target.value)}
              />
              <div className="error-note" id="erro-contato">
                Informe o contato
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="ac">AC</label>
            <select id="ac" value={form.ac} onChange={(e) => alterar("ac", e.target.value as FormularioSuporte["ac"])}>
              {ACS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="dataAbertura">Carimbo de data/hora</label>
              <input id="dataAbertura" type="datetime-local" value={paraDatetimeLocal(agora)} disabled />
            </div>
          </div>

          <div className="novo-suporte-actions">
            <button className="btn btn-primary" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar suporte"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={limpar} disabled={salvando}>
              Limpar formulário
            </button>
          </div>
        </form>
      </section>

      {duplicados.length ? (
        <DuplicadoModal
          duplicados={duplicados}
          onFechar={() => setDuplicados([])}
          onCadastrarMesmoAssim={() => {
            // Só chega aqui sem bloqueio (o botão nem existe quando o protocolo repete).
            if (bloqueia(duplicados)) return;
            setDuplicados([]);
            void gravar();
          }}
        />
      ) : null}

      <Notificacao notificacao={notificacao} onFechar={fecharNotificacao} />
    </div>
  );
}
