import { useState } from "react";
import { IconBell, IconBellOff } from "./Icons";
import { avisoLigado, gravarAviso, pedirPermissao, permissaoNotificacao, tocarSom } from "../utils/avisoChamado";

/**
 * Sino ao lado do tema: liga/desliga o aviso de chamado novo. Ligado e sem
 * permissão de notificação ainda, o clique pede a permissão (o navegador só
 * deixa pedir num clique) em vez de desligar.
 */
export default function AvisoToggle() {
  const [ligado, setLigado] = useState(avisoLigado);
  const [permissao, setPermissao] = useState(permissaoNotificacao);
  const falta = ligado && permissao === "default";

  async function clicar() {
    if (falta) {
      setPermissao(await pedirPermissao());
      tocarSom();
      return;
    }
    const novo = !ligado;
    gravarAviso(novo);
    setLigado(novo);
    if (novo) {
      tocarSom();
      setPermissao(await pedirPermissao());
    }
  }

  const titulo = !ligado
    ? "Aviso de chamado novo desligado — clique para ligar"
    : falta
      ? "Clique para permitir a notificação do navegador (o som já está ligado)"
      : permissao === "denied"
        ? "Aviso de chamado novo ligado (só som e aviso na tela: o navegador bloqueou a notificação) — clique para desligar"
        : "Aviso de chamado novo ligado (som e notificação) — clique para desligar";

  return (
    <button
      type="button"
      className={`theme-toggle aviso-toggle${falta ? " aviso-pendente" : ""}${ligado ? "" : " aviso-desligado"}`}
      onClick={clicar}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ligado}
    >
      {ligado ? <IconBell /> : <IconBellOff />}
    </button>
  );
}
