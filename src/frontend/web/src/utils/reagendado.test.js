import { describe, expect, it } from "vitest";
import { msReagendadoEntre, periodosReagendado } from "./reagendado";

const H = 3600000;
const t = (h) => new Date(Date.UTC(2026, 9, 5) + h * H).toISOString();

describe("tempo em REAGENDADO", () => {
  it("soma só a parte de cada período que cai dentro do intervalo", () => {
    const r = { periodosReagendado: [{ de: t(10), ate: t(12) }, { de: t(14), ate: t(15) }] };
    expect(msReagendadoEntre(r, t(9), t(20))).toBe(3 * H);
    expect(msReagendadoEntre(r, t(11), t(14.5))).toBe(1.5 * H);
    expect(msReagendadoEntre(r, t(16), t(20))).toBe(0);
  });

  it("período ainda aberto vai até agora", () => {
    const agora = Date.parse(t(13));
    expect(periodosReagendado({ periodosReagendado: [{ de: t(10), ate: null }] }, agora)).toEqual([[Date.parse(t(10)), agora]]);
  });

  it("sem períodos, dados quebrados ou intervalo invertido: zero", () => {
    expect(msReagendadoEntre({}, t(9), t(20))).toBe(0);
    expect(msReagendadoEntre({ periodosReagendado: [{ de: "x", ate: t(12) }] }, t(9), t(20))).toBe(0);
    expect(msReagendadoEntre({ periodosReagendado: [{ de: t(10), ate: t(12) }] }, t(20), t(9))).toBe(0);
  });

  it("aceita outra forma de medir (ex.: só horas do expediente)", () => {
    const r = { periodosReagendado: [{ de: t(10), ate: t(12) }] };
    expect(msReagendadoEntre(r, t(9), t(20), (a, b) => (b - a) / 2)).toBe(H);
  });
});
