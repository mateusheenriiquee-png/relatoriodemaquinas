import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import SupportCard from "../components/SupportCard";
import SupportDrawer from "../components/SupportDrawer";
import ConfirmModal from "../components/modals/ConfirmModal";
import ConcluirVendaModal from "../components/modals/ConcluirVendaModal";
import ReagendarModal from "../components/modals/ReagendarModal";
import TextoModal from "../components/modals/TextoModal";
import ChangeTecnicoModal from "../components/modals/ChangeTecnicoModal";
import SuporteFormModal from "../components/modals/SuporteFormModal";
import ImportarModal from "../components/modals/ImportarModal";
import ExportarModal from "../components/modals/ExportarModal";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../contexts/AuthContext";
import { useSuportes } from "../hooks/useSuportes";
import { classificarMotivo, classificarUso, usoPedePlataforma } from "../utils/catalogos";
import { useUsuarios } from "../hooks/useUsuarios";
import {
  alterarTecnico,
  associarTecnico,
  atualizarSuporte,
  concluirSuporte,
  criarSuporte,
  definirDevido,
  definirForaDaMedia,
  definirIndevido,
  excluirSuporte,
  marcarSemRetorno,
  processarReagendadosVencidos,
  reagendarSuporte,
  registrarFollowup,
  salvarAnotacoes,
  voltarParaEmAberto
} from "../services/suportesService";
import {
  formatContato,
  formatCpfCnpj,
  formatDate,
  formatProtocolo,
  norm,
  normKey,
  normStatus,
  titleCaseName
} from "../utils/format";

const STAT_CARDS = [
  { status: "EM ABERTO", label: "Em aberto", chave: "abertos" },
  { status: "EM ANDAMENTO", label: "Em andamento", chave: "andamento" },
  { status: "FINALIZADO", label: "Finalizados", chave: "finalizados" },
  { status: "SEM RETORNO", label: "Sem Retorno", chave: "semRetorno" },
  { status: "REAGENDADO", label: "Reagendado", chave: "reagendado" },
  { status: "todos", label: "Total", chave: "total" }
];

const SEM_MODAL = { tipo: null, item: null };

export default function SuportesPage() {
  const toast = useToast();
  const { isAdmin, displayName, getIdToken } = useAuth();

  // Drill-down vindo do dashboard: /?status=FINALIZADO&tecnico=Matheus
  const [searchParams] = useSearchParams();
  const [filtrosIniciais] = useState(() => {
    const vindos = {};
    // `protocolo` entra aqui para os alertas do dashboard (data futura, duração
    // fora do padrão) abrirem direto no chamado apontado.
    ["status", "ac", "tecnico", "statusAbertura", "protocolo"].forEach((campo) => {
      const valor = searchParams.get(campo);
      if (valor) vindos[campo] = valor;
    });
    return vindos;
  });

  const {
    filtros,
    alterarFiltro,
    registros,
    opcoesAc,
    opcoesTecnico,
    estatisticas,
    carregando,
    erro,
    truncado,
    statusBusca,
    buscarRegistro,
    atualizarContagens
  } = useSuportes(filtrosIniciais);

  /**
   * Opções do filtro por técnico: os usuários cadastrados mais os nomes que já
   * aparecem nos registros. A união é o que permite continuar filtrando
   * chamados antigos de quem não está mais na equipe.
   */
  const { nomes: nomesUsuarios } = useUsuarios();
  const tecnicosDisponiveis = useMemo(
    () =>
      [...new Set([...nomesUsuarios, ...opcoesTecnico])].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
      ),
    [nomesUsuarios, opcoesTecnico]
  );

  const [drawerItem, setDrawerItem] = useState(null);
  // `?id=` vindo dos alertas do dashboard. Guardado numa ref para abrir o
  // painel UMA vez: sem isso, fechar o drawer o reabriria no próximo render,
  // já que o parâmetro continua na URL.
  const idParaAbrir = useRef(searchParams.get("id") || "");
  const [modal, setModal] = useState(SEM_MODAL);
  const [buscaLocal, setBuscaLocal] = useState("");
  const [erroReagendar, setErroReagendar] = useState("");
  const [pendentesIndevido, setPendentesIndevido] = useState({});
  const [importExport, setImportExport] = useState(null); // "importar" | "exportar" | null

  const fecharModal = () => {
    setModal(SEM_MODAL);
    setErroReagendar("");
  };

  /* -------------------------------------------------- busca com debounce */
  useEffect(() => {
    const timer = setTimeout(() => alterarFiltro("protocolo", buscaLocal.trim()), 400);
    return () => clearTimeout(timer);
  }, [buscaLocal, alterarFiltro]);

  /* -------------------------------- reagendados vencidos voltam p/ aberto */
  /*
   * Quem faz isso de verdade agora é o Cron Trigger do Worker, a cada 5 min
   * (src/backend/reagendados.mjs). Antes era um setInterval aqui — ou seja, um
   * suporte reagendado para as 8h só voltava para EM ABERTO quando alguém
   * abrisse esta tela.
   *
   * A chamada abaixo ficou como rede de segurança de UMA execução, na abertura
   * da tela: cobre a janela entre o reagendamento vencer e o próximo tick do
   * cron, e mantém o painel correto se o cron estiver fora do ar. Não há mais
   * intervalo — a corretude não depende de ninguém estar com a aba aberta.
   */
  useEffect(() => {
    let ativo = true;

    (async () => {
      try {
        const reabertos = await processarReagendadosVencidos();
        if (ativo && reabertos.length) {
          toast.success(`${reabertos.length} suporte(s) retornaram para Em Aberto.`, 4000);
        }
      } catch (err) {
        console.error("[Suportes] Erro ao verificar reagendados:", err);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [toast]);

  useEffect(() => {
    if (erro) toast.error(erro);
  }, [erro, toast]);

  /*
   * Chamado apontado por um alerta do dashboard. Ele pode não estar entre os
   * carregados (a lista tem teto de 500 e filtros próprios) — nesse caso a tela
   * simplesmente fica na lista, sem erro: o alerta já cumpriu o papel de dizer
   * qual chamado conferir.
   */
  useEffect(() => {
    if (!idParaAbrir.current) return;
    const alvo = buscarRegistro(idParaAbrir.current);
    if (alvo) {
      setDrawerItem(alvo);
      idParaAbrir.current = "";
    }
  }, [buscarRegistro]);

  /* ------------------------------------------- drawer sempre com dado novo */
  const drawerAtual = useMemo(
    () => (drawerItem ? buscarRegistro(drawerItem.id) || drawerItem : null),
    [drawerItem, buscarRegistro]
  );

  /**
   * Dispara a ação e devolve o controle na hora, sem esperar o servidor.
   *
   * O Firestore já grava no cache local antes de falar com a rede, e o
   * `onSnapshot` da tela dispara com essa escrita pendente — ou seja, a lista e
   * o painel JÁ mostram o resultado imediatamente. O que fazia a tela parecer
   * travada em conexão ruim era só o `await`: o modal ficava aberto e o botão
   * girando até o servidor responder, muito depois de o dado estar na tela.
   *
   * O sucesso continua sendo avisado só depois da confirmação — dizer "salvo"
   * antes de estar salvo seria mentira. Se a escrita falhar, o Firestore desfaz
   * a alteração local sozinho (a lista volta ao que era) e o toast de erro
   * explica o que houve.
   *
   * Devolve `true` de imediato porque quem chama usa o retorno só para fechar
   * modal/painel — decisão de interface, não confirmação de gravação.
   */
  const executar = useCallback(
    (acao, mensagemSucesso) => {
      Promise.resolve()
        .then(acao)
        .then(() => {
          if (mensagemSucesso) toast.success(mensagemSucesso);
          return atualizarContagens();
        })
        .catch((err) => {
          toast.error(err?.message || "Não foi possível concluir a operação.");
        });
      return true;
    },
    [atualizarContagens, toast]
  );

  /* ------------------------------------------------------------- ações */

  async function handleSalvarSuporte(form, modo) {
    const payload = {};
    const put = (chave, valor) => {
      const texto = norm(valor);
      if (texto) payload[chave] = texto;
    };

    put("tipo", form.tipo);
    put("ac", form.ac);
    put("status", normStatus(form.status));
    if (form.protocolo) put("protocolo", formatProtocolo(form.protocolo));
    if (form.cpfCnpj) put("cpfCnpj", formatCpfCnpj(form.cpfCnpj));
    if (form.contato) put("contato", formatContato(form.contato));
    // Gravado mesmo vazio (e não pelo `put`): na edição, apagar o nome precisa
    // apagá-lo de fato — junto com a chave de busca, que o serviço deriva daqui.
    payload.nomeCliente = norm(form.nomeCliente);
    if (form.tecnico) {
      payload.tecnico = titleCaseName(form.tecnico);
      payload.tecnicoKey = normKey(payload.tecnico);
    }

    // Classificação das métricas. Gravada mesmo vazia (e não pelo `put`, que
    // descarta vazios): na edição, limpar um campo precisa apagá-lo de fato,
    // senão o chamado ficaria preso à categoria errada para sempre.
    payload.motivoCat = classificarMotivo(form.motivoCat);
    payload.motivoDetalhe = norm(form.motivoDetalhe);
    payload.usoCat = classificarUso(form.usoCat);
    payload.usoPlat = usoPedePlataforma(payload.usoCat) ? norm(form.usoPlat) : "";

    if (modo === "adicionar") {
      put("responsavelAbertura", form.responsavelAbertura);
      put("statusAbertura", form.statusAbertura);

      /*
       * Abertura retroativa (só admin). A checagem é refeita aqui, e não só no
       * formulário: uma data no futuro entraria como chamado "aberto amanhã",
       * que é exatamente o defeito que o dashboard aponta em vermelho. Sem
       * permissão, data inválida ou data futura, cai no agora.
       */
      const escolhida = form.aberturaRetroativa && isAdmin ? new Date(form.dataAbertura) : null;
      const retroativa =
        escolhida && !Number.isNaN(escolhida.getTime()) && escolhida.getTime() <= Date.now()
          ? escolhida
          : null;

      const abertura = retroativa || new Date();
      payload.dataAbertura = abertura.toISOString();
      if (payload.status === "EM ANDAMENTO") {
        // Numa abertura retroativa, o atendimento não pode começar antes dela:
        // o tempo de fila ficaria negativo.
        payload.dataInicioAtendimento = abertura.toISOString();
      }

      const ok = await executar(
        () =>
          criarSuporte(payload, {
            por: displayName,
            nota: retroativa
              ? `abertura retroativa para ${retroativa.toLocaleString("pt-BR")}`
              : ""
          }),
        "Suporte adicionado com sucesso."
      );
      if (ok) fecharModal();
      return;
    }

    const atual = modal.item || {};
    if (payload.status === "EM ANDAMENTO" && atual.status !== "EM ANDAMENTO" && !atual.dataInicioAtendimento) {
      payload.dataInicioAtendimento = new Date().toISOString();
    }
    // Encerrar pela edição também fecha a medição de tempo.
    const ENCERRADOS = ["FINALIZADO", "SEM RETORNO"];
    if (
      ENCERRADOS.includes(payload.status) &&
      !ENCERRADOS.includes(atual.status) &&
      !atual.dataFinalizacao
    ) {
      payload.dataFinalizacao = new Date().toISOString();
    }
    // Edição pelo formulário também entra no histórico. Quando o status mudou,
    // a frase registra a transição; senão, fica só "dados editados".
    const mudouStatus = payload.status && payload.status !== atual.status;
    const ok = await executar(
      () =>
        atualizarSuporte(atual.id, payload, {
          texto: mudouStatus
            ? `Status: ${atual.status} → ${payload.status} (edição)`
            : "Dados do chamado editados",
          por: displayName
        }),
      "Suporte atualizado com sucesso."
    );
    if (ok) fecharModal();
  }

  async function handleAssociar(item) {
    const ok = await executar(
      () => associarTecnico(item, { getIdToken, displayName }),
      "Técnico associado com sucesso."
    );
    if (ok) setDrawerItem(null);
  }

  async function handleConcluir(item, vendaExtras = {}) {
    const extras = { ...vendaExtras };
    const motivo = pendentesIndevido[item.id];
    if (motivo) {
      extras.statusAbertura = "INDEVIDO";
      extras.motivoIndevido = motivo;
    }
    const ok = await executar(
      () => concluirSuporte(item.id, extras, { por: displayName, statusAnterior: item.status }),
      "Suporte marcado como finalizado."
    );
    if (ok) {
      setPendentesIndevido((atual) => {
        const copia = { ...atual };
        delete copia[item.id];
        return copia;
      });
      setDrawerItem(null);
      fecharModal();
    }
  }

  async function handleReagendar(data, hora) {
    setErroReagendar("");
    const quando = new Date(`${data}T${hora}`);
    if (Number.isNaN(quando.getTime()) || quando <= new Date()) {
      setErroReagendar("A data/hora deve ser no futuro.");
      return;
    }
    const ok = await executar(
      () =>
        reagendarSuporte(modal.item.id, quando, {
          por: displayName,
          statusAnterior: modal.item.status
        }),
      "Suporte reagendado com sucesso."
    );
    if (ok) {
      fecharModal();
      setDrawerItem(null);
    }
  }

  /**
   * Registra uma tentativa de contato por ligação. A janela mínima entre as
   * etapas é validada no FollowupBox; aqui só gravamos e devolvemos o
   * resultado para o bloco limpar o campo de observação.
   */
  async function handleFollowup(item, ordem, observacao) {
    return executar(
      () => registrarFollowup(item.id, { ordem, observacao, por: displayName }),
      `${ordem}º follow-up registrado.`
    );
  }

  const acoesDrawer = {
    onFollowup: handleFollowup,
    onEditar: (item) => setModal({ tipo: "form-editar", item }),
    // Cliente que volta é comum (é o que a taxa de reincidência mede): reabrir
    // um chamado para ele não deveria exigir redigitar nome, CPF e contato.
    onNovoParaCliente: (item) => {
      setDrawerItem(null);
      setModal({ tipo: "form-cliente", item });
    },
    onNotas: (item) => setModal({ tipo: "notas", item }),
    onAssociar: handleAssociar,
    onConcluir: (item) => setModal({ tipo: "concluir-venda", item }),
    onReagendar: (item) => {
      if (item.status === "REAGENDADO" && item.dataReagendamento) {
        toast.info(`Reagendado para ${formatDate(item.dataReagendamento)}`, 5000);
        return;
      }
      setModal({ tipo: "reagendar", item });
    },
    onSemRetorno: (item) => setModal({ tipo: "sem-retorno", item }),
    onVoltarEmAberto: async (item) => {
      const ok = await executar(
        () => voltarParaEmAberto(item.id, { por: displayName, statusAnterior: item.status }),
        "Suporte retornado para em aberto."
      );
      if (ok) setDrawerItem(null);
    },
    onExcluir: (item) => setModal({ tipo: "excluir", item }),
    onAlterarTecnico: (item) => setModal({ tipo: "change-tecnico", item }),
    /* Devolver à média é reversível e não precisa de texto nenhum; excluir
       exige justificativa, e por isso só esse caminho abre modal. */
    onForaDaMedia: (item) => {
      if (item.excluirDaMedia) {
        executar(
          () => definirForaDaMedia(item.id, { excluir: false }, { por: displayName }),
          "Chamado devolvido à média."
        );
        return;
      }
      setModal({ tipo: "fora-media", item });
    },
    onIndevido: (item) => {
      if (item.statusAbertura === "INDEVIDO" && item.motivoIndevido) {
        setModal({ tipo: "indevido-view", item });
        return;
      }
      setModal({ tipo: "indevido", item });
    }
  };

  /* ------------------------------------------------------------ render */

  return (
    <div className="container">
      <AppHeader
        onNovoSuporte={() => setModal({ tipo: "form-adicionar", item: null })}
        onAtualizar={() => {
          atualizarContagens();
          toast.info("Lista sincronizada.", 1500);
        }}
        onImportar={() => setImportExport("importar")}
        onExportar={() => setImportExport("exportar")}
      />

      <section className="toolbar">
        <div className="field">
          <label htmlFor="filtroAc">AC</label>
          <select
            id="filtroAc"
            value={filtros.ac}
            onChange={(e) => alterarFiltro("ac", e.target.value)}
          >
            <option value="todos">Todos</option>
            {opcoesAc.map((ac) => (
              <option key={ac} value={ac}>
                {ac}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="filtroTecnico">Técnico Responsável</label>
          <select
            id="filtroTecnico"
            value={filtros.tecnico}
            onChange={(e) => alterarFiltro("tecnico", e.target.value)}
          >
            <option value="todos">Todos</option>
            {tecnicosDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="filtroDataInicio">Data início</label>
          <input
            id="filtroDataInicio"
            type="date"
            value={filtros.dataInicio}
            onChange={(e) => alterarFiltro("dataInicio", e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="filtroDataFim">Data limite</label>
          <input
            id="filtroDataFim"
            type="date"
            value={filtros.dataFim}
            onChange={(e) => alterarFiltro("dataFim", e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="filtroProtocolo">Protocolo / CPF / Contato / Nome</label>
          <input
            id="filtroProtocolo"
            type="text"
            placeholder="Protocolo, CPF/CNPJ, contato ou nome do cliente"
            value={buscaLocal}
            onChange={(e) => setBuscaLocal(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="filtroStatusAbertura">Status da abertura</label>
          <select
            id="filtroStatusAbertura"
            value={filtros.statusAbertura}
            onChange={(e) => alterarFiltro("statusAbertura", e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="DEVIDO">Devido</option>
            <option value="INDEVIDO">Indevido</option>
          </select>
        </div>
      </section>

      <section className="stats" role="group" aria-label="Filtrar por situação do atendimento">
        {STAT_CARDS.map((card) => (
          <button
            key={card.status}
            type="button"
            className={`stat-card ${filtros.status === card.status ? "active" : ""}`}
            onClick={() => alterarFiltro("status", card.status)}
          >
            <span>{card.label}</span>
            <strong>{estatisticas[card.chave] ?? 0}</strong>
          </button>
        ))}
      </section>

      {truncado && !statusBusca.foraDoFiltro ? (
        <p className="aviso-truncado">
          Mostrando os {truncado} atendimentos mais recentes deste filtro — existem mais no
          banco. Use os filtros de data ou a busca para chegar aos demais.
        </p>
      ) : null}

      {/* A busca no servidor ignora os filtros da tela de propósito; sem este
          aviso o resultado pareceria contradizer o filtro selecionado. */}
      {statusBusca.foraDoFiltro ? (
        <p className="aviso-busca-servidor">
          Nada encontrado na lista carregada — estes {registros.length} resultado(s) vieram de
          uma consulta direta ao banco por <strong>{statusBusca.termo}</strong>, ignorando os
          filtros de status, AC, técnico e período.
        </p>
      ) : null}

      <div className="cards-wrapper">
        {carregando ? (
          <div className="infinite-loader">Carregando...</div>
        ) : statusBusca.estado === "buscando" ? (
          <div className="infinite-loader">
            Nada na lista carregada. Procurando “{statusBusca.termo}” no banco...
          </div>
        ) : registros.length === 0 ? (
          <div className="empty">
            {statusBusca.estado === "concluida" ? (
              <>
                Nenhum suporte com <strong>{statusBusca.termo}</strong> em protocolo, CPF/CNPJ,
                contato ou nome do cliente — a busca foi até o banco, não é limite de carregamento.
              </>
            ) : statusBusca.estado === "erro" ? (
              <>
                A consulta ao banco por <strong>{statusBusca.termo}</strong> falhou, então só os
                atendimentos já carregados foram verificados. Tente de novo.
              </>
            ) : (
              "Nenhum suporte encontrado para os filtros selecionados."
            )}
          </div>
        ) : (
          <div className="cards-grid" aria-live="polite">
            {registros.map((item) => (
              <SupportCard key={item.id} item={item} onClick={setDrawerItem} />
            ))}
          </div>
        )}
      </div>

      <SupportDrawer
        item={drawerAtual}
        open={Boolean(drawerAtual)}
        onClose={() => setDrawerItem(null)}
        actions={acoesDrawer}
      />

      <SuporteFormModal
        open={
          modal.tipo === "form-adicionar" ||
          modal.tipo === "form-editar" ||
          modal.tipo === "form-cliente"
        }
        modo={modal.tipo === "form-editar" ? "editar" : "adicionar"}
        item={modal.tipo === "form-editar" ? modal.item : null}
        clienteBase={modal.tipo === "form-cliente" ? modal.item : null}
        responsavelPadrao={displayName}
        onClose={fecharModal}
        isAdmin={isAdmin}
        onSubmit={handleSalvarSuporte}
      />

      <ConfirmModal
        open={modal.tipo === "excluir"}
        title="Excluir suporte?"
        text="Esta ação não pode ser desfeita. O registro será removido permanentemente."
        details={
          modal.item
            ? `Protocolo ${modal.item.protocolo || "—"} — ${modal.item.responsavelAbertura || "—"}`
            : ""
        }
        confirmLabel="Excluir"
        onClose={fecharModal}
        onConfirm={async () => {
          if (!isAdmin) {
            toast.error("Apenas administradores podem excluir suportes.");
            return;
          }
          const ok = await executar(() => excluirSuporte(modal.item.id), "Suporte excluído.");
          if (ok) {
            fecharModal();
            setDrawerItem(null);
          }
        }}
      />

      <TextoModal
        open={modal.tipo === "sem-retorno"}
        title="Motivo - Sem Retorno"
        text="Informe um breve motivo para marcar este suporte como Sem Retorno."
        onClose={fecharModal}
        onConfirm={async (motivo) => {
          const ok = await executar(
            () =>
              marcarSemRetorno(modal.item.id, motivo, {
                por: displayName,
                statusAnterior: modal.item.status
              }),
            "Suporte marcado como sem retorno."
          );
          if (ok) {
            fecharModal();
            setDrawerItem(null);
          }
        }}
      />

      <ConcluirVendaModal
        open={modal.tipo === "concluir-venda"}
        item={modal.item}
        onClose={fecharModal}
        onConfirm={(vendaStatus, valorVenda) =>
          handleConcluir(modal.item, {
            ...(vendaStatus ? { vendaStatus } : {}),
            ...(valorVenda ? { valorVenda } : {})
          })
        }
      />

      <TextoModal
        open={modal.tipo === "fora-media"}
        title="Excluir da média"
        text="Por que este chamado não deve entrar na média de tempo? A justificativa fica registrada no histórico."
        confirmLabel="Excluir da média"
        onClose={fecharModal}
        onConfirm={async (justificativa) => {
          const ok = await executar(
            () =>
              definirForaDaMedia(
                modal.item.id,
                { excluir: true, justificativa },
                { por: displayName }
              ),
            "Chamado excluído da média."
          );
          if (ok) fecharModal();
        }}
      />

      <TextoModal
        open={modal.tipo === "indevido"}
        title="Motivo - Indevido"
        text="Informe um breve motivo para marcar este suporte como Indevido."
        icon="i"
        confirmLabel="Salvar motivo"
        initialValue={modal.item ? pendentesIndevido[modal.item.id] || "" : ""}
        onClose={fecharModal}
        onConfirm={async (motivo) => {
          const ok = await executar(
            () => definirIndevido(modal.item.id, motivo, { por: displayName }),
            "Motivo indevido salvo."
          );
          if (ok) fecharModal();
        }}
      />

      <TextoModal
        open={modal.tipo === "indevido-view"}
        title="Suporte Indevido"
        text="Este suporte foi marcado como Indevido. Motivo:"
        icon="i"
        readOnly
        required={false}
        initialValue={modal.item?.motivoIndevido || ""}
        onClose={fecharModal}
        onConfirm={() => {}}
        extraAction={
          <button
            type="button"
            className="btn btn-tonal"
            onClick={async () => {
              const ok = await executar(
                () => definirDevido(modal.item.id, { por: displayName }),
                "Status alterado para Devido."
              );
              if (ok) fecharModal();
            }}
          >
            Mudar para Devido
          </button>
        }
      />

      <TextoModal
        open={modal.tipo === "notas"}
        title="Anotações do Suporte"
        label="Anotações"
        placeholder="Digite suas anotações para este suporte..."
        icon="✎"
        rows={8}
        maxLength={2000}
        required={false}
        confirmLabel="Salvar notas"
        initialValue={modal.item?.anotacoes || ""}
        onClose={fecharModal}
        onConfirm={async (texto) => {
          const ok = await executar(
            () => salvarAnotacoes(modal.item.id, texto, { por: displayName }),
            "Anotações salvas."
          );
          if (ok) fecharModal();
        }}
      />

      <ReagendarModal
        open={modal.tipo === "reagendar"}
        erro={erroReagendar}
        onClose={fecharModal}
        onConfirm={handleReagendar}
      />

      <ImportarModal
        open={importExport === "importar"}
        onClose={() => setImportExport(null)}
        onConcluido={({ gravados, removidos, modo }) => {
          atualizarContagens();
          toast.success(
            modo === "substituir"
              ? `Base substituída: ${removidos} removido(s), ${gravados} importado(s).`
              : `${gravados} registro(s) importado(s).`,
            5000
          );
        }}
      />

      <ExportarModal
        open={importExport === "exportar"}
        onClose={() => setImportExport(null)}
        onConcluido={(total) => toast.success(`${total} registro(s) exportado(s).`, 4000)}
      />

      <ChangeTecnicoModal
        open={modal.tipo === "change-tecnico"}
        onClose={fecharModal}
        onSelect={async (nome) => {
          if (!isAdmin) {
            toast.error("Apenas administradores podem alterar o técnico.");
            return;
          }
          const ok = await executar(
            () => alterarTecnico(modal.item.id, nome, { por: displayName }),
            `Técnico alterado para: ${nome}`
          );
          if (ok) fecharModal();
        }}
      />
    </div>
  );
}
