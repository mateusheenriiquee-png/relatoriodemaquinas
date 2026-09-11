import { describe, expect, it, vi } from "vitest";
import {
  calcularReincidencia,
  duracaoCorrida,
  duracaoUtil,
  foraDaMedia,
  metricasDoPeriodo,
  msUteisEntre,
  resolverIntervalo,
  temDatasInconsistentes
} from "../metricasService";

// metricasConfigService fala com o Firestore no import; aqui só interessa a
// constante do expediente padrão.
vi.mock("../../config/firebase", () => ({ db: {}, getApiBaseUrl: () => "" }));
const { CONFIG_METRICAS_PADRAO } = await import("../metricasConfigService");

const HORA = 3600000;

/** Config de expediente igual à padrão do projeto: 07:00–22:00, seg a sáb. */
const CONFIG = { bhStart: "07:00", bhEnd: "22:00", workDays: [1, 2, 3, 4, 5, 6], diasNaoTrab: [] };

function chamado({ abertura, fim, status = "FINALIZADO", ...resto }) {
  return {
    dataAbertura: abertura,
    dataFinalizacao: fim,
    status,
    ...resto
  };
}

describe("resolverIntervalo", () => {
  const agora = new Date("2026-03-10T15:30:00");

  it("devolve null para 'tudo' — ausência de intervalo é o que significa sem filtro", () => {
    expect(resolverIntervalo("tudo", {}, agora)).toBeNull();
  });

  it("'hoje' cobre exatamente o dia corrente, com fim exclusivo na virada", () => {
    const [inicio, fim] = resolverIntervalo("hoje", {}, agora);
    expect(new Date(inicio).toISOString()).toBe(new Date("2026-03-10T00:00:00").toISOString());
    expect(fim - inicio).toBe(24 * HORA);
  });

  it("'7d' cobre 7 dias incluindo hoje", () => {
    const [inicio, fim] = resolverIntervalo("7d", {}, agora);
    expect(fim - inicio).toBe(7 * 24 * HORA);
  });

  it("'custom' com só a data inicial deixa o fim aberto", () => {
    const [inicio, fim] = resolverIntervalo("custom", { de: "2026-02-01" }, agora);
    expect(inicio).toBe(new Date("2026-02-01T00:00:00").getTime());
    expect(fim).toBe(Infinity);
  });
});

describe("temDatasInconsistentes", () => {
  it("aponta encerramento anterior à abertura (o typo de ano das planilhas)", () => {
    const r = chamado({ abertura: "2027-08-12T13:24:00", fim: "2026-08-12T13:53:00" });
    expect(temDatasInconsistentes(r)).toBe(true);
  });

  it("não aponta nada quando as datas estão na ordem certa", () => {
    expect(temDatasInconsistentes(chamado({ abertura: "2026-08-12T10:00:00", fim: "2026-08-12T11:00:00" }))).toBe(false);
  });

  it("chamado ainda aberto não é inconsistente — só não tem fim", () => {
    expect(temDatasInconsistentes(chamado({ abertura: "2026-08-12T10:00:00", fim: null, status: "EM ABERTO" }))).toBe(false);
  });
});

describe("duracaoCorrida", () => {
  it("mede o relógio de parede entre abertura e encerramento", () => {
    const r = chamado({ abertura: "2026-01-05T09:00:00", fim: "2026-01-05T12:30:00" });
    expect(duracaoCorrida(r)).toBe(3.5 * HORA);
  });

  it("devolve null enquanto o chamado não encerrou", () => {
    expect(duracaoCorrida(chamado({ abertura: "2026-01-05T09:00:00", fim: null, status: "EM ANDAMENTO" }))).toBeNull();
  });
});

describe("msUteisEntre / duracaoUtil", () => {
  it("corta o que ficou fora do expediente no mesmo dia", () => {
    // Segunda 06:00 → 12:00, expediente começa 07:00: contam 5h, não 6h.
    const ms = msUteisEntre("2026-01-05T06:00:00", "2026-01-05T12:00:00", CONFIG);
    expect(ms).toBe(5 * HORA);
  });

  it("assume o expediente de 7h às 22h quando não recebe config", () => {
    expect(msUteisEntre("2026-01-05T06:00:00", "2026-01-05T12:00:00", undefined)).toBe(5 * HORA);
  });

  it("o fallback do cálculo bate com o expediente padrão da configuração", () => {
    /*
     * O expediente padrão está escrito em dois lugares: CONFIG_METRICAS_PADRAO
     * (usado quando não há doc em config/metricas) e o fallback dentro de
     * msUteisEntre. Se um mudar sem o outro, o tempo útil passa a divergir só
     * para quem ainda não salvou configuração — bug silencioso e chato de achar.
     */
    const [horaPadrao] = CONFIG_METRICAS_PADRAO.bhStart.split(":").map(Number);
    const inicioDoExpediente = `2026-01-05T${String(horaPadrao).padStart(2, "0")}:00:00`;

    // Da abertura do expediente até uma hora depois: 1h cheia, sem corte.
    expect(msUteisEntre(inicioDoExpediente, "2026-01-05T" + String(horaPadrao + 1).padStart(2, "0") + ":00:00", undefined)).toBe(HORA);
    // Uma hora ANTES da abertura não conta nada.
    expect(msUteisEntre(`2026-01-05T${String(horaPadrao - 1).padStart(2, "0")}:00:00`, inicioDoExpediente, undefined)).toBe(0);
  });

  it("respeita um expediente diferente do padrão", () => {
    const config = { ...CONFIG, bhStart: "09:00" };
    expect(msUteisEntre("2026-01-05T06:00:00", "2026-01-05T12:00:00", config)).toBe(3 * HORA);
  });

  it("pula o domingo, que está fora da escala padrão", () => {
    // Sábado 20:00 → segunda 09:00: 2h de sábado + 0 no domingo + 2h na segunda.
    const ms = msUteisEntre("2026-01-10T20:00:00", "2026-01-12T09:00:00", CONFIG);
    expect(ms).toBe(4 * HORA);
  });

  it("zera os dias marcados como não trabalhados", () => {
    const config = { ...CONFIG, diasNaoTrab: [{ date: "2026-01-05" }] };
    expect(msUteisEntre("2026-01-05T09:00:00", "2026-01-05T17:00:00", config)).toBe(0);
  });

  it("duracaoUtil usa o mesmo cálculo a partir do registro", () => {
    const r = chamado({ abertura: "2026-01-05T06:00:00", fim: "2026-01-05T12:00:00" });
    expect(duracaoUtil(r, CONFIG)).toBe(5 * HORA);
  });
});

describe("foraDaMedia", () => {
  it("respeita a exclusão manual", () => {
    expect(foraDaMedia({ excluirDaMedia: true })).toBe(true);
  });

  it("marca automaticamente a partir do 3º follow-up sem resposta", () => {
    expect(foraDaMedia({ followups: [1, 2] })).toBe(false);
    expect(foraDaMedia({ followups: [1, 2, 3] })).toBe(true);
  });
});

describe("calcularReincidencia", () => {
  const base = [
    // Cliente 111: fechou dia 1, voltou dia 4 — dentro da janela de 7 dias.
    chamado({ cpfCnpj: "111", abertura: "2026-01-01T09:00:00", fim: "2026-01-01T10:00:00" }),
    chamado({ cpfCnpj: "111", abertura: "2026-01-04T09:00:00", fim: null, status: "EM ABERTO" }),
    // Cliente 222: voltou só no dia 20 — fora da janela.
    chamado({ cpfCnpj: "222", abertura: "2026-01-01T09:00:00", fim: "2026-01-01T10:00:00" }),
    chamado({ cpfCnpj: "222", abertura: "2026-01-20T09:00:00", fim: null, status: "EM ABERTO" }),
    // Cliente 333: nunca voltou.
    chamado({ cpfCnpj: "333", abertura: "2026-01-01T09:00:00", fim: "2026-01-01T10:00:00" }),
    // Sem CPF: não dá para saber se é o mesmo cliente, fica fora da base.
    chamado({ cpfCnpj: "", abertura: "2026-01-01T09:00:00", fim: "2026-01-01T10:00:00" })
  ];

  const finalizados = base.filter((r) => r.status === "FINALIZADO");

  it("conta como reincidente só quem voltou dentro da janela", () => {
    expect(calcularReincidencia(finalizados, base)).toEqual({ total: 3, reincidentes: 1, taxa: 33 });
  });

  it("ignora chamados sem CPF/CNPJ na base elegível", () => {
    const { total } = calcularReincidencia(finalizados, base);
    expect(total).toBe(3); // 4 finalizados, mas um está sem documento
  });

  it("aceita janela customizada — 30 dias pega o cliente 222 também", () => {
    const trintaDias = 30 * 24 * HORA;
    expect(calcularReincidencia(finalizados, base, trintaDias).reincidentes).toBe(2);
  });

  it("não conta o próprio chamado como reabertura de si mesmo", () => {
    const unico = [chamado({ cpfCnpj: "999", abertura: "2026-01-01T09:00:00", fim: "2026-01-01T10:00:00" })];
    expect(calcularReincidencia(unico, unico).reincidentes).toBe(0);
  });

  it("devolve zero quando não há nada elegível", () => {
    expect(calcularReincidencia([], [])).toEqual({ total: 0, reincidentes: 0, taxa: 0 });
  });
});

describe("metricasDoPeriodo", () => {
  /*
   * O caso que o comentário do módulo chama de "erro clássico": contagens de
   * volume olham a ABERTURA, encerrados/taxa olham o ENCERRAMENTO. Um chamado
   * aberto antes do período e fechado dentro dele conta como encerrado sem
   * contar como aberto — misturar os dois estoura a taxa de sucesso.
   */
  const intervalo = [new Date("2026-02-01T00:00:00").getTime(), new Date("2026-03-01T00:00:00").getTime()];

  const lista = [
    chamado({ abertura: "2026-01-20T09:00:00", fim: "2026-02-03T10:00:00" }), // aberto antes, fechado dentro
    chamado({ abertura: "2026-02-05T09:00:00", fim: "2026-02-05T11:00:00" }), // aberto e fechado dentro
    chamado({ abertura: "2026-02-10T09:00:00", fim: null, status: "EM ABERTO" }), // aberto dentro, sem fechar
    chamado({ abertura: "2026-02-12T09:00:00", fim: "2026-02-13T09:00:00", status: "SEM RETORNO" })
  ];

  const m = metricasDoPeriodo(lista, intervalo, CONFIG);

  it("conta abertos pela data de abertura", () => {
    expect(m.abertos).toBe(3); // os três de fevereiro; o de janeiro não entra
  });

  it("conta encerrados pela data de encerramento, mesmo os abertos antes", () => {
    expect(m.encerrados).toBe(3); // dois finalizados + um sem retorno
  });

  it("taxa de sucesso é finalizados ÷ encerrados, nunca passa de 100%", () => {
    expect(m.sucesso).toBe(2);
    expect(m.taxa).toBe(67);
    expect(m.taxa).toBeLessThanOrEqual(100);
  });

  it("expõe a reincidência junto com o resto do período", () => {
    expect(m.reincidencia).toEqual({ total: 0, reincidentes: 0, taxa: 0 }); // nenhum tem CPF
  });
});
