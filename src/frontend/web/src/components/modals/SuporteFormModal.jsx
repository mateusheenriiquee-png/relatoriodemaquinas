import { useEffect, useState } from "react";
import Modal from "../Modal";
import { IconRetroativo } from "../Icons";
import { useUsuarios } from "../../hooks/useUsuarios";
import { STATUS_OPTIONS, toDatetimeLocal } from "../../utils/format";
import { MOTIVOS, USOS, usoPedePlataforma } from "../../utils/catalogos";

export const TIPOS = [
  "Suporte tecnico",
  "Instalação"
];

export const ACS = ["CONSULTI", "VALID"];

const VAZIO = {
  protocolo: "",
  responsavelAbertura: "",
  nomeCliente: "",
  cpfCnpj: "",
  tipo: TIPOS[0],
  ac: ACS[0],
  contato: "",
  tecnico: "",
  status: "EM ABERTO",
  statusAbertura: "DEVIDO",
  dataAbertura: "",
  // Classificação usada pelas métricas. Começa vazia de propósito: um valor
  // pré-selecionado viraria o motivo de metade dos chamados sem ninguém decidir.
  motivoCat: "",
  motivoDetalhe: "",
  usoCat: "",
  usoPlat: ""
};

/** Agrupamento visual dos campos — o formulário tem treze deles. */
function Secao({ titulo, children }) {
  return (
    <section className="form-secao">
      <h3 className="form-secao-titulo">{titulo}</h3>
      <div className="form-grid">{children}</div>
    </section>
  );
}

/**
 * Modal de criação/edição de suporte.
 * modo: "adicionar" | "editar" — na edição, os campos travados no projeto
 * original (responsável, data e status da abertura) ficam ocultos.
 */
export default function SuporteFormModal({
  open,
  modo = "adicionar",
  item,
  // Chamado cujo CLIENTE serve de base para um novo registro ("novo chamado
  // para este cliente"). Só os dados de quem está do outro lado da linha são
  // reaproveitados — protocolo, técnico, status e datas nascem limpos, porque
  // são deste atendimento, não do anterior.
  clienteBase = null,
  responsavelPadrao = "",
  isAdmin = false,
  onClose,
  onSubmit
}) {
  const [form, setForm] = useState(VAZIO);
  // Nomes vindos da coleção `usuarios`, no lugar da lista fixa que existia aqui.
  const { nomes: tecnicos } = useUsuarios();
  const [salvando, setSalvando] = useState(false);
  /*
   * Abertura retroativa: o campo de data nasce travado no agora e só destrava
   * quando um admin pede. O clique explícito é o ponto: chamado com data
   * escolhida à mão distorce tempo médio e fila, e o dashboard chega a alertar
   * sobre datas estranhas — ninguém deve conseguir fazer isso por engano ao
   * tabular pelo formulário.
   */
  const [retroativo, setRetroativo] = useState(false);
  const [erroData, setErroData] = useState("");

  useEffect(() => {
    if (!open) return;
    setRetroativo(false);
    setErroData("");
    if (modo === "editar" && item) {
      setForm({
        protocolo: item.protocolo || "",
        responsavelAbertura: item.responsavelAbertura || "",
        nomeCliente: item.nomeCliente || "",
        cpfCnpj: item.cpfCnpj || "",
        tipo: item.tipo || TIPOS[0],
        ac: item.ac || ACS[0],
        contato: item.contato || "",
        tecnico: item.tecnico || "",
        status: item.status || "EM ABERTO",
        statusAbertura: item.statusAbertura || "DEVIDO",
        dataAbertura: toDatetimeLocal(item.dataAbertura),
        motivoCat: item.motivoCat || "",
        motivoDetalhe: item.motivoDetalhe || "",
        usoCat: item.usoCat || "",
        usoPlat: item.usoPlat || ""
      });
    } else {
      setForm({
        ...VAZIO,
        responsavelAbertura: responsavelPadrao,
        dataAbertura: toDatetimeLocal(new Date().toISOString()),
        ...(clienteBase
          ? {
              nomeCliente: clienteBase.nomeCliente || "",
              cpfCnpj: clienteBase.cpfCnpj || "",
              contato: clienteBase.contato || ""
            }
          : {})
      });
    }
  }, [open, modo, item, responsavelPadrao, clienteBase]);

  const set = (campo) => (e) => setForm((atual) => ({ ...atual, [campo]: e.target.value }));

  function alternarRetroativo() {
    setErroData("");
    setRetroativo((ativo) => {
      // Ao desligar, o campo volta para o agora — sair do modo retroativo tem
      // que desfazer a data escolhida, não deixá-la valendo em silêncio.
      if (ativo) {
        setForm((atual) => ({ ...atual, dataAbertura: toDatetimeLocal(new Date().toISOString()) }));
      }
      return !ativo;
    });
  }

  function alterarData(e) {
    const valor = e.target.value;
    setForm((atual) => ({ ...atual, dataAbertura: valor }));
    const escolhida = new Date(valor);
    setErroData(
      valor && !Number.isNaN(escolhida.getTime()) && escolhida.getTime() > Date.now() + 60000
        ? "A abertura não pode ser no futuro."
        : ""
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (erroData) return;
    setSalvando(true);
    try {
      await onSubmit({ ...form, aberturaRetroativa: retroativo }, modo);
    } finally {
      setSalvando(false);
    }
  }

  const editando = modo === "editar";

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="wide"
      title={editando ? "Editar Suporte" : "Novo Suporte"}
    >
      <form className="modal-form modal-form-largo" onSubmit={handleSubmit}>
        {clienteBase && !editando ? (
          <p className="form-aviso">
            Novo chamado para <strong>{clienteBase.nomeCliente || "este cliente"}</strong> — os
            dados de contato vieram do chamado anterior. O chamado antigo não é alterado.
          </p>
        ) : null}

        <Secao titulo="Chamado">
          <div className="field">
            <label htmlFor="protocolo">Protocolo</label>
            <input
              id="protocolo"
              maxLength={80}
              placeholder="Opcional"
              value={form.protocolo}
              onChange={set("protocolo")}
            />
          </div>

          {!editando ? (
            <>
              <div className="field">
                <label htmlFor="responsavelAbertura">Responsável da abertura</label>
                <input id="responsavelAbertura" value={form.responsavelAbertura} disabled />
              </div>

              <div className="field field-span-2">
                <label htmlFor="dataAbertura">
                  Carimbo de data/hora
                  {retroativo ? <span className="tag-retroativo">retroativo</span> : null}
                </label>
                <div className="campo-com-acao">
                  <input
                    id="dataAbertura"
                    type="datetime-local"
                    value={form.dataAbertura}
                    disabled={!retroativo}
                    onChange={alterarData}
                  />
                  {isAdmin ? (
                    <button
                      type="button"
                      className={`btn btn-icon btn-icon-schedule ${retroativo ? "ativo" : ""}`}
                      title={
                        retroativo
                          ? "Voltar para a data e hora atuais"
                          : "Abrir com data retroativa"
                      }
                      aria-pressed={retroativo}
                      onClick={alternarRetroativo}
                    >
                      <IconRetroativo />
                    </button>
                  ) : null}
                </div>
                {erroData ? <span className="campo-erro">{erroData}</span> : null}
                {retroativo && !erroData ? (
                  <span className="campo-ajuda">
                    A data escolhida conta como a abertura do chamado nas métricas de tempo.
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </Secao>

        <Secao titulo="Cliente">
          <div className="field field-span-2">
            <label htmlFor="nomeCliente">Nome do cliente</label>
            <input
              id="nomeCliente"
              maxLength={120}
              placeholder="Como o cliente se identifica ao ligar"
              value={form.nomeCliente}
              onChange={set("nomeCliente")}
            />
          </div>

          <div className="field">
            <label htmlFor="cpfCnpj">CPF/CNPJ</label>
            <input id="cpfCnpj" maxLength={32} value={form.cpfCnpj} onChange={set("cpfCnpj")} />
          </div>

          <div className="field">
            <label htmlFor="contato">Contato ou grupo</label>
            <input id="contato" maxLength={120} value={form.contato} onChange={set("contato")} />
          </div>
        </Secao>

        <Secao titulo="Atendimento">
          <div className="field">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" value={form.tipo} onChange={set("tipo")}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="ac">AC</label>
            <select id="ac" value={form.ac} onChange={set("ac")}>
              {ACS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tecnico">Técnico responsável</label>
            <select id="tecnico" value={form.tecnico} onChange={set("tecnico")}>
              <option value="">Não atribuído</option>
              {/* O técnico já gravado entra primeiro mesmo que não esteja mais em
                  `usuarios` — sem isso, abrir um registro antigo para editar
                  apagaria silenciosamente o técnico dele. */}
              {[form.tecnico, ...tecnicos.filter((t) => t !== form.tecnico)]
                .filter(Boolean)
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="status">Situação do atendimento</label>
            <select id="status" value={form.status} onChange={set("status")}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {!editando ? (
            <div className="field">
              <label htmlFor="statusAbertura">Status da abertura</label>
              <select
                id="statusAbertura"
                value={form.statusAbertura}
                onChange={set("statusAbertura")}
              >
                <option value="DEVIDO">Devido</option>
                <option value="INDEVIDO">Indevido</option>
              </select>
            </div>
          ) : null}
        </Secao>

        <Secao titulo="Classificação">
          <div className="field">
            <label htmlFor="motivoCat">Motivo do chamado</label>
            <select id="motivoCat" value={form.motivoCat} onChange={set("motivoCat")}>
              <option value="">Não classificado</option>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="motivoDetalhe">Detalhe do motivo</label>
            <input
              id="motivoDetalhe"
              maxLength={160}
              placeholder="Como o cliente descreveu (opcional)"
              value={form.motivoDetalhe}
              onChange={set("motivoDetalhe")}
            />
          </div>

          <div className="field">
            <label htmlFor="usoCat">Motivo da utilização</label>
            <select id="usoCat" value={form.usoCat} onChange={set("usoCat")}>
              <option value="">Não informado</option>
              {USOS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* A plataforma só faz sentido em "emitir nota" e "acessar plataformas" —
              nos outros usos o campo ficaria sempre vazio poluindo o formulário. */}
          {usoPedePlataforma(form.usoCat) ? (
            <div className="field">
              <label htmlFor="usoPlat">Plataforma</label>
              <input
                id="usoPlat"
                maxLength={80}
                placeholder="e-CAC, Sebrae, Shopee…"
                value={form.usoPlat}
                onChange={set("usoPlat")}
              />
            </div>
          ) : null}
        </Secao>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvando || Boolean(erroData)}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
