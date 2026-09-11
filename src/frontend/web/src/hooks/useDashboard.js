import { useEffect, useMemo, useState } from "react";
import { subscribeDashboard, listarTecnicosUnicos } from "../services/dashboardService";
import {
  intervaloAnterior,
  limiteInferior,
  resolverIntervalo
} from "../services/metricasService";
import { normKey } from "../utils/format";
import { useAuth } from "../contexts/AuthContext";

const PERIODO_INICIAL = { preset: "30d", de: "", ate: "" };

export function useDashboard() {
  const { isAdmin, displayName } = useAuth();

  // Período A é o da tela. B é opcional e existe só para a comparação.
  const [periodoA, setPeriodoA] = useState(PERIODO_INICIAL);
  const [periodoB, setPeriodoB] = useState({ preset: "", de: "", ate: "" });
  const [ac, setAc] = useState("todos");
  const [tecnico, setTecnico] = useState("todos");
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [truncado, setTruncado] = useState(null);

  const intervaloA = useMemo(
    () => resolverIntervalo(periodoA.preset, periodoA),
    [periodoA]
  );
  const intervaloB = useMemo(
    () => (periodoB.preset ? resolverIntervalo(periodoB.preset, periodoB) : null),
    [periodoB]
  );
  const intervaloAnteriorA = useMemo(() => intervaloAnterior(intervaloA), [intervaloA]);

  /**
   * Ponto mais antigo que a consulta precisa alcançar: o menor entre A, B e a
   * janela de comparação. `null` quando alguma delas é aberta — aí a consulta
   * vai sem recorte de data (limitada pelo teto de documentos do serviço).
   */
  const limiteConsulta = useMemo(
    () => limiteInferior(intervaloA, intervaloAnteriorA, ...(intervaloB ? [intervaloB] : [])),
    [intervaloA, intervaloAnteriorA, intervaloB]
  );

  useEffect(() => {
    setCarregando(true);
    const unsubscribe = subscribeDashboard(
      limiteConsulta,
      (lista, info) => {
        setRegistros(lista);
        setTruncado(info?.truncado ? info.teto : null);
        setErro("");
        setCarregando(false);
      },
      (error) => {
        setErro(error?.message || "Erro ao carregar o dashboard.");
        setCarregando(false);
      }
    );
    return unsubscribe;
  }, [limiteConsulta]);

  /** Operador só enxerga os próprios atendimentos. */
  const registrosVisiveis = useMemo(() => {
    if (isAdmin) return registros;
    const chave = normKey(displayName);
    return registros.filter((r) => normKey(r.tecnico) === chave);
  }, [registros, isAdmin, displayName]);

  const opcoesAc = useMemo(
    () =>
      [...new Set(registrosVisiveis.map((r) => r.ac).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
      ),
    [registrosVisiveis]
  );

  const opcoesTecnico = useMemo(() => {
    const tecnicos = listarTecnicosUnicos(registrosVisiveis);
    if (isAdmin) return tecnicos;
    const chave = normKey(displayName);
    return tecnicos.filter((nome) => normKey(nome) === chave);
  }, [registrosVisiveis, isAdmin, displayName]);

  // Se o filtro selecionado sumiu da lista de opções, volta para "todos".
  useEffect(() => {
    if (ac !== "todos" && !opcoesAc.includes(ac)) setAc("todos");
  }, [ac, opcoesAc]);

  useEffect(() => {
    if (tecnico !== "todos" && !opcoesTecnico.some((n) => normKey(n) === normKey(tecnico))) {
      setTecnico("todos");
    }
  }, [tecnico, opcoesTecnico]);

  /**
   * Tudo o que o listener trouxe, já filtrado por AC e técnico, SEM recorte de
   * data. As métricas de período precisam desta lista inteira: um chamado
   * aberto em julho e encerrado em agosto conta como "encerrado em agosto", e
   * ele não estaria aqui se a lista já viesse cortada pela data de abertura.
   */
  const filtrados = useMemo(() => {
    let lista = registrosVisiveis;
    if (ac !== "todos") lista = lista.filter((r) => r.ac === ac);
    if (tecnico !== "todos") {
      const chave = normKey(tecnico);
      lista = lista.filter((r) => normKey(r.tecnico) === chave);
    }
    return lista;
  }, [registrosVisiveis, ac, tecnico]);

  const dentroDe = (intervalo) => (r) => {
    if (!intervalo) return true;
    if (!r.dataAbertura) return false;
    const t = r.dataAbertura.getTime();
    return t >= intervalo[0] && t < intervalo[1];
  };

  const dados = useMemo(() => filtrados.filter(dentroDe(intervaloA)), [filtrados, intervaloA]);
  const dadosB = useMemo(
    () => (intervaloB ? filtrados.filter(dentroDe(intervaloB)) : []),
    [filtrados, intervaloB]
  );
  const dadosAnteriores = useMemo(
    () => (intervaloAnteriorA ? filtrados.filter(dentroDe(intervaloAnteriorA)) : []),
    [filtrados, intervaloAnteriorA]
  );

  return {
    periodoA,
    setPeriodoA,
    periodoB,
    setPeriodoB,
    intervaloA,
    intervaloB,
    ac,
    setAc,
    tecnico,
    setTecnico,
    opcoesAc,
    opcoesTecnico,
    todos: filtrados,
    dados,
    dadosB,
    dadosAnteriores,
    carregando,
    erro,
    truncado
  };
}
