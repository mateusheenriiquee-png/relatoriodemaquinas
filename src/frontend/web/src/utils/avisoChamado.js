/**
 * Aviso de chamado novo (pedido do usuário, 2026-10-05): som, aviso na tela e
 * notificação do navegador quando um chamado entra em EM ABERTO, para o
 * técnico não depender de ficar olhando a lista.
 *
 * A preferência (ligado/desligado) é de cada navegador: fica no localStorage.
 */

const CHAVE = "aviso-chamado-novo";
/** Aberto há menos que isso: "novo". Mais antigo voltando para EM ABERTO: "voltou". */
export const RECENTE_MS = 30 * 60 * 1000;

export function avisoLigado() {
  try {
    return localStorage.getItem(CHAVE) !== "desligado";
  } catch {
    return true;
  }
}

export function gravarAviso(ligado) {
  try {
    localStorage.setItem(CHAVE, ligado ? "ligado" : "desligado");
  } catch {
    /* navegador sem armazenamento: vale o padrão (ligado) */
  }
}

const igual = (a, b) =>
  String(a || "").trim().toLowerCase() !== "" &&
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Chamados da lista EM ABERTO que não estavam na anterior. Fica de fora o que
 * a própria pessoa fez (abriu, ou devolveu para EM ABERTO): o último registro
 * do histórico é dela.
 */
export function chamadosQueEntraram(conhecidos, lista, { meuNome = "", agora = Date.now() } = {}) {
  return (lista || [])
    .filter((r) => r?.id && !conhecidos.has(r.id))
    .filter((r) => {
      const ultimo = Array.isArray(r.historico) ? r.historico[r.historico.length - 1] : null;
      return !igual(ultimo?.por, meuNome) && !(r.historico?.length <= 1 && igual(r.responsavelAbertura, meuNome));
    })
    .map((r) => {
      const aberto = r.dataAbertura ? new Date(r.dataAbertura).getTime() : NaN;
      return { ...r, voltou: Number.isFinite(aberto) && agora - aberto > RECENTE_MS };
    });
}

/** Título e texto do aviso, para um ou vários chamados de uma vez. */
export function textoDoAviso(novos) {
  if (!novos.length) return null;
  const nome = (r) => r.nomeCliente || r.protocolo || "cliente sem nome";
  if (novos.length === 1) {
    const [r] = novos;
    return {
      titulo: r.voltou ? "Chamado voltou para Em aberto" : "Novo chamado em aberto",
      corpo: [nome(r), r.motivoCat && r.motivoCat !== "Outros" ? r.motivoCat : ""].filter(Boolean).join(" · ")
    };
  }
  return {
    titulo: `${novos.length} chamados em aberto chegaram`,
    corpo: novos.slice(0, 3).map(nome).join(", ") + (novos.length > 3 ? "…" : "")
  };
}

let audio = null;

// Volume do aviso (0 a 1). Era 0,18 — pouco para quem está com outra aba ou
// música aberta (pedido do usuário, 07/10). Acima de ~0,85 o som começa a
// distorcer; o compressor abaixo segura os picos.
const VOLUME = 0.85;

/**
 * Três notas subindo, tocadas duas vezes (~1,7 s no total), em onda
 * triangular: soa mais alto que a senoidal no mesmo volume e não é estridente
 * como a quadrada. Gerado na hora, sem arquivo de som.
 */
export function tocarSom() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    audio = audio || new Contexto();
    if (audio.state === "suspended") audio.resume();
    const saida = audio.createDynamicsCompressor();
    saida.threshold.value = -6;
    saida.ratio.value = 4;
    saida.connect(audio.destination);

    const inicio = audio.currentTime + 0.02;
    const NOTAS = [784, 988, 1319];
    [0, 0.9].forEach((repeticao) => {
      NOTAS.forEach((freq, i) => {
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        const t = inicio + repeticao + i * 0.24;
        osc.type = "triangle";
        osc.frequency.value = freq;
        vol.gain.setValueAtTime(0.0001, t);
        vol.gain.exponentialRampToValueAtTime(VOLUME, t + 0.02);
        vol.gain.setValueAtTime(VOLUME, t + 0.14);
        vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(vol).connect(saida);
        osc.start(t);
        osc.stop(t + 0.23);
      });
    });
  } catch {
    /* som bloqueado pelo navegador: o aviso na tela continua */
  }
}

export function permissaoNotificacao() {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "indisponivel";
}

export async function pedirPermissao() {
  if (permissaoNotificacao() !== "default") return permissaoNotificacao();
  try {
    return await Notification.requestPermission();
  } catch {
    return permissaoNotificacao();
  }
}

/** Notificação do sistema — só com a aba escondida (com ela à vista, basta o aviso na tela). */
export function notificar({ titulo, corpo }) {
  if (permissaoNotificacao() !== "granted" || !document.hidden) return;
  try {
    const n = new Notification(titulo, { body: corpo, tag: "chamado-novo", renotify: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* alguns navegadores só notificam via service worker: fica o som */
  }
}
