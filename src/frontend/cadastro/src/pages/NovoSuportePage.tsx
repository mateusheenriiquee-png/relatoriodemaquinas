import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import Brand from "../components/Brand";
import DuplicadoModal from "../components/DuplicadoModal";
import Notificacao, { type NotificacaoDados } from "../components/Notificacao";
import ThemeToggle from "../components/ThemeToggle";
import { bloqueia, type Duplicado } from "../lib/duplicidade";
import { paraDatetimeLocal } from "../lib/formatacao";
import {
  ACS,
  FORMULARIO_VAZIO,
  TIPOS,
  faltaIdentificacao,
  montarSuporte,
  type FormularioSuporte
} from "../lib/suporte";
import { buscarDuplicados, criarSuporte } from "../services/suportesService";

export default function NovoSuportePage() {
  const { nome, sair } = useAuth();
  const [form, setForm] = useState<FormularioSuporte>(FORMULARIO_VAZIO);
  const [erroIdentificacao, setErroIdentificacao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [notificacao, setNotificacao] = useState<NotificacaoDados | null>(null);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  // Só para exibição: o carimbo real é o instante do clique em salvar.
  const [agora, setAgora] = useState(() => new Date());
  const protocoloRef = useRef<HTMLInputElement>(null);

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
    if (campo === "protocolo" || campo === "cpfCnpj") setErroIdentificacao(false);
  }

  function limpar() {
    setForm(FORMULARIO_VAZIO);
    setErroIdentificacao(false);
    setAgora(new Date());
    protocoloRef.current?.focus();
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;

    if (faltaIdentificacao(form)) {
      setErroIdentificacao(true);
      setNotificacao({ mensagem: "Informe o Protocolo ou o CPF/CNPJ antes de salvar.", tipo: "error" });
      protocoloRef.current?.focus();
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

  const classeCampoIdentificacao = `field${erroIdentificacao ? " required-error" : ""}`;

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
          <div className={classeCampoIdentificacao}>
            <label htmlFor="protocolo">Protocolo</label>
            <input
              id="protocolo"
              ref={protocoloRef}
              maxLength={80}
              value={form.protocolo}
              aria-invalid={erroIdentificacao || undefined}
              aria-describedby={erroIdentificacao ? "erro-identificacao" : undefined}
              onChange={(e) => alterar("protocolo", e.target.value)}
            />
            <div className="error-note" id="erro-identificacao">
              Preencha Protocolo ou CPF/CNPJ
            </div>
          </div>

          <div className="field">
            <label htmlFor="responsavelAbertura">Responsável da abertura</label>
            <input id="responsavelAbertura" maxLength={120} value={nome} disabled />
          </div>

          <div className="form-grid-2">
            <div className={classeCampoIdentificacao}>
              <label htmlFor="cpfCnpj">CPF/CNPJ</label>
              <input
                id="cpfCnpj"
                maxLength={32}
                value={form.cpfCnpj}
                aria-invalid={erroIdentificacao || undefined}
                onChange={(e) => alterar("cpfCnpj", e.target.value)}
              />
              <div className="error-note">Preencha Protocolo ou CPF/CNPJ</div>
            </div>
            <div className="field">
              <label htmlFor="contato">Contato ou grupo</label>
              <input id="contato" value={form.contato} onChange={(e) => alterar("contato", e.target.value)} />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="tipo">Tipo</label>
              <select
                id="tipo"
                value={form.tipo}
                onChange={(e) => alterar("tipo", e.target.value as FormularioSuporte["tipo"])}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
