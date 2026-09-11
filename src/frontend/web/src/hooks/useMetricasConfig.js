import { useCallback, useEffect, useState } from "react";
import {
  CONFIG_METRICAS_PADRAO,
  adicionarDiaNaoTrabalhado,
  removerDiaNaoTrabalhado,
  salvarHorarioComercial,
  subscribeConfigMetricas
} from "../services/metricasConfigService";
import { useAuth } from "../contexts/AuthContext";

/**
 * Configuração de métricas em tempo real.
 *
 * Começa com o padrão em memória e só troca quando o Firestore responde: assim
 * o dashboard já calcula tempo útil no primeiro render, em vez de piscar "—"
 * enquanto a configuração viaja. Se a leitura falhar, o padrão continua valendo
 * — métrica aproximada é melhor do que tela vazia.
 */
export function useMetricasConfig() {
  const { displayName } = useAuth();
  const [config, setConfig] = useState(CONFIG_METRICAS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeConfigMetricas(
      (dados) => {
        setConfig(dados);
        setErro("");
        setCarregando(false);
      },
      (error) => {
        setErro(error?.message || "Não foi possível ler a configuração de métricas.");
        setCarregando(false);
      }
    );
    return unsubscribe;
  }, []);

  const salvarHorario = useCallback(
    (valores) => salvarHorarioComercial({ ...config, ...valores }),
    [config]
  );

  const adicionarDia = useCallback(
    (date, nota) => adicionarDiaNaoTrabalhado(date, nota, { por: displayName }),
    [displayName]
  );

  const removerDia = useCallback(
    (date) => removerDiaNaoTrabalhado(date, { por: displayName }),
    [displayName]
  );

  return { config, carregando, erro, salvarHorario, adicionarDia, removerDia };
}
