function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

const TECNICOS_DISPONIVEIS = [
  "MATHEUS",
  "HENRIQUE",
  "VICTOR",
  "ISABELE",
  "MALU",
  "AGNY",
  "IANCA",
  "EMYLE",
  "VINICIUS",
  "JUNIOR"
];

function tecnicoKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeTecnico(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const key = tecnicoKey(text);
  const canonical = TECNICOS_DISPONIVEIS.find((nome) => tecnicoKey(nome) === key);
  if (canonical) return canonical;

  return text.toUpperCase();
}

module.exports = {
  TECNICOS_DISPONIVEIS,
  normalizeTecnico,
  tecnicoKey
};
