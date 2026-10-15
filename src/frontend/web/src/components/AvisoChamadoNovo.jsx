import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ToastProvider";
import { subscribeSuportesEmAberto } from "../services/suportesService";
import { avisoLigado, chamadosQueEntraram, notificar, textoDoAviso, tocarSom } from "../utils/avisoChamado";

/**
 * Escuta os chamados EM ABERTO em qualquer tela do painel (lista ou dashboard)
 * e avisa quando entra um: som, aviso na tela e, com a aba escondida,
 * notificação do navegador. A primeira leitura só registra o que já existia.
 */
export default function AvisoChamadoNovo() {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const conhecidos = useRef(null);
  const meuNome = useRef(displayName);
  meuNome.current = displayName;

  useEffect(() => {
    if (!user) return undefined;
    conhecidos.current = null;
    return subscribeSuportesEmAberto(
      (lista) => {
        const ids = new Set(lista.map((r) => r.id));
        if (conhecidos.current === null) {
          conhecidos.current = ids;
          return;
        }
        const novos = chamadosQueEntraram(conhecidos.current, lista, { meuNome: meuNome.current });
        conhecidos.current = ids;
        if (!novos.length || !avisoLigado()) return;
        const aviso = textoDoAviso(novos);
        tocarSom();
        toast.info(`${aviso.titulo}${aviso.corpo ? ` — ${aviso.corpo}` : ""}`, 8000);
        notificar(aviso);
      },
      (error) => console.warn("[Aviso] Falha ao escutar chamados em aberto:", error?.message || error)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}
