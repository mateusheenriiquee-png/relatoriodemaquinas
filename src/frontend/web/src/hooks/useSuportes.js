import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buscarRegistrosNoServidor,
  contarPorStatus,
  subscribeRegistros,
  subscribeSuportesEmAberto
} from "../services/suportesService";
import { normKey, normalizeSearchText, toComparableDate } from "../utils/format";

export const FILTROS_INICIAIS = {
  status: "EM ABERTO",
  ac: "todos",
  tecnico: "todos",
  dataInicio: "",
  dataFim: "",
  protocolo: "",
  statusAbertura: "todos"
};

const CONTAGEM_INICIAL = {
  total: 0,
  abertos: 0,
  andamento: 0,
  finalizados: 0,
  semRetorno: 0,
  reagendado: 0
};

/**
 * Centraliza os listeners do Firestore, os filtros e as contagens da tela de suportes.
 * A busca por protocolo/CPF/contato e o filtro de status da abertura são aplicados
 * no cliente, como no projeto original.
 */
export function useSuportes(filtrosIniciais = null) {
  // `filtrosIniciais` vem do drill-down do dashboard (via query string).
  const [filtros, setFiltros] = useState(() => ({ ...FILTROS_INICIAIS, ...filtrosIniciais }));
  const [registros, setRegistros] = useState([]);
  const [emAberto, setEmAberto] = useState([]);
  const [contagens, setContagens] = useState(CONTAGEM_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [truncado, setTruncado] = useState(null);

  // Resultado da consulta direta ao Firestore, usada quando o filtro local
  // (que só enxerga o que o listener carregou) não encontra nada.
  const [buscaServidor, setBuscaServidor] = useState({
    termo: "",
    estado: "ocioso", // ocioso | buscando | concluida | erro
    resultados: []
  });

  const filtrosServidor = useMemo(
    () => ({
      status: filtros.status,
      ac: filtros.ac,
      tecnico: filtros.tecnico,
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim
    }),
    [filtros.status, filtros.ac, filtros.tecnico, filtros.dataInicio, filtros.dataFim]
  );

  const chaveFiltros = JSON.stringify(filtrosServidor);

  useEffect(() => {
    setCarregando(true);
    const unsubscribe = subscribeRegistros(
      filtrosServidor,
      (lista, info) => {
        setRegistros(lista);
        setTruncado(info?.truncado ? info.teto : null);
        setErro("");
        setCarregando(false);
      },
      (error) => {
        setErro(error?.message || "Erro ao sincronizar registros.");
        setCarregando(false);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveFiltros]);

  useEffect(() => {
    const unsubscribe = subscribeSuportesEmAberto(
      (lista) => setEmAberto(lista),
      (error) => setErro(error?.message || "Erro ao sincronizar suportes em aberto.")
    );
    return unsubscribe;
  }, []);

  const atualizarContagens = useCallback(async () => {
    try {
      setContagens(await contarPorStatus());
    } catch (error) {
      console.warn("[Suportes] Falha ao contar registros:", error);
    }
  }, []);

  // Recontagem quando as listas mudam, com debounce para evitar leituras excessivas.
  const timerRef = useRef(null);
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(atualizarContagens, 700);
    return () => clearTimeout(timerRef.current);
  }, [registros.length, emAberto.length, atualizarContagens]);

  const registrosLocais = useMemo(() => {
    const busca = filtros.protocolo ? normalizeSearchText(filtros.protocolo) : "";
    const combina = (item) =>
      normalizeSearchText(item.protocolo).includes(busca) ||
      normalizeSearchText(item.cpfCnpj).includes(busca) ||
      normalizeSearchText(item.contato).includes(busca) ||
      // Quem liga se apresenta pelo nome, não pelo protocolo. Aqui a busca é
      // por trecho (não por prefixo, como a do servidor), então "ramos" acha
      // "Bruno Ramos" também.
      normalizeSearchText(item.nomeCliente).includes(busca);

    // EM ABERTO tem lista própria e ignora os demais filtros (regra do projeto original).
    // A busca é a exceção: quem digita um protocolo quer achá-lo, e antes o
    // termo era simplesmente ignorado nesta aba.
    if (filtros.status === "EM ABERTO") {
      const abertos = busca ? emAberto.filter(combina) : emAberto;
      return [...abertos].sort(
        (a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura)
      );
    }

    let dados = registros.filter((item) => item.status !== "EM ABERTO");

    if (busca) {
      dados = dados.filter(combina);
    }

    if (filtros.statusAbertura !== "todos") {
      const alvo = filtros.statusAbertura.toUpperCase();
      dados = dados.filter((item) => (item.statusAbertura || "").toUpperCase() === alvo);
    }

    if (filtros.tecnico !== "todos") {
      const chave = normKey(filtros.tecnico);
      dados = dados.filter((item) => normKey(item.tecnico) === chave);
    }

    return dados.sort(
      (a, b) => toComparableDate(b.dataAbertura) - toComparableDate(a.dataAbertura)
    );
  }, [registros, emAberto, filtros]);

  /* ------------------------------------------- busca com fallback no servidor */

  /**
   * O filtro acima só enxerga o que o listener carregou (teto de 500 docs).
   * Quando ele não acha nada, vamos ao Firestore: é isso que faz um protocolo
   * de seis meses atrás aparecer. Sem isso a tela dizia "nenhum suporte
   * encontrado" sem ter olhado o banco.
   */
  const termoBusca = filtros.protocolo.trim();
  const semResultadoLocal = Boolean(termoBusca) && registrosLocais.length === 0;

  useEffect(() => {
    if (!semResultadoLocal) {
      // Sem termo, ou o filtro local já achou: nada a consultar.
      setBuscaServidor((atual) =>
        atual.estado === "ocioso" && !atual.termo
          ? atual
          : { termo: "", estado: "ocioso", resultados: [] }
      );
      return undefined;
    }

    let ativo = true;
    setBuscaServidor({ termo: termoBusca, estado: "buscando", resultados: [] });

    buscarRegistrosNoServidor(termoBusca)
      .then((encontrados) => {
        if (!ativo) return;
        setBuscaServidor({ termo: termoBusca, estado: "concluida", resultados: encontrados });
      })
      .catch((error) => {
        if (!ativo) return;
        console.error("[Suportes] Busca no servidor falhou:", error);
        setBuscaServidor({ termo: termoBusca, estado: "erro", resultados: [] });
      });

    return () => {
      ativo = false;
    };
  }, [termoBusca, semResultadoLocal]);

  const registrosFiltrados = useMemo(() => {
    if (semResultadoLocal && buscaServidor.termo === termoBusca) {
      return buscaServidor.resultados;
    }
    return registrosLocais;
  }, [registrosLocais, semResultadoLocal, buscaServidor, termoBusca]);

  /**
   * Estado da busca para a tela explicar o que aconteceu — em vez do
   * "nenhum suporte encontrado" genérico, que não distinguia "não existe" de
   * "não carreguei".
   */
  const statusBusca = useMemo(() => {
    if (!termoBusca) return { ativo: false, estado: "ocioso", termo: "", foraDoFiltro: false };
    if (!semResultadoLocal) {
      return { ativo: true, estado: "local", termo: termoBusca, foraDoFiltro: false };
    }
    return {
      ativo: true,
      estado: buscaServidor.termo === termoBusca ? buscaServidor.estado : "buscando",
      termo: termoBusca,
      // Os resultados do servidor ignoram os filtros da tela de propósito.
      foraDoFiltro: buscaServidor.resultados.length > 0
    };
  }, [termoBusca, semResultadoLocal, buscaServidor]);

  const opcoesAc = useMemo(() => {
    const todos = [...registros, ...emAberto].map((r) => r.ac).filter(Boolean);
    return [...new Set(todos)].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );
  }, [registros, emAberto]);

  /**
   * Técnicos que aparecem nos registros carregados.
   *
   * O filtro precisa disto além da lista de usuários: chamados antigos e
   * importados guardam nomes de gente que já saiu da equipe, e só com os
   * usuários atuais esses registros ficariam impossíveis de filtrar.
   */
  const opcoesTecnico = useMemo(() => {
    const todos = [...registros, ...emAberto].map((r) => r.tecnico).filter(Boolean);
    return [...new Set(todos)].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );
  }, [registros, emAberto]);

  const estatisticas = useMemo(
    () => ({ ...contagens, abertos: emAberto.length }),
    [contagens, emAberto.length]
  );

  const alterarFiltro = useCallback((campo, valor) => {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }, []);

  // O drawer também precisa achar registros que vieram só da busca no servidor —
  // senão abrir um resultado antigo mostraria o card e um drawer vazio.
  const buscarRegistro = useCallback(
    (id) =>
      registros.find((r) => r.id === id) ||
      emAberto.find((r) => r.id === id) ||
      buscaServidor.resultados.find((r) => r.id === id) ||
      null,
    [registros, emAberto, buscaServidor.resultados]
  );

  return {
    filtros,
    alterarFiltro,
    registros: registrosFiltrados,
    opcoesAc,
    opcoesTecnico,
    estatisticas,
    carregando,
    erro,
    truncado,
    statusBusca,
    buscarRegistro,
    atualizarContagens
  };
}
