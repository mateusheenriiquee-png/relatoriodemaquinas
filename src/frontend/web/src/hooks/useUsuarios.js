import { useEffect, useMemo, useState } from "react";
import { nomesDeTecnicos, subscribeUsuarios } from "../services/usuariosService";

/**
 * Usuários cadastrados, em tempo real.
 *
 * Substitui as listas de nomes que estavam fixas no código (uma em
 * ChangeTecnicoModal, outra em SuporteFormModal, com grafias diferentes e
 * nenhuma das duas batendo com a coleção `usuarios`). Quem entra ou sai da
 * equipe agora aparece e some sozinho.
 */
export function useUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeUsuarios(
      (lista) => {
        setUsuarios(lista);
        setErro("");
        setCarregando(false);
      },
      (error) => {
        setErro(error?.message || "Não foi possível carregar os usuários.");
        setCarregando(false);
      }
    );
    return unsubscribe;
  }, []);

  const nomes = useMemo(() => nomesDeTecnicos(usuarios), [usuarios]);

  return { usuarios, nomes, carregando, erro };
}
