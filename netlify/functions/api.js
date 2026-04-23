const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLERRSfAPahteMekMH-fmJ9hr8XQAsuV1cTO8L0yTu7pjIkuUZu4w_uGEz2lEIcfktl1cy9dys6JAb/pub?output=csv";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw0LcctEgB5o9xKZv5VQpQ7L3strG88hIMJfrfHG41nUXAr1HNOJOGXCO4AJ16umSpn/exec";

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(csvText) {
  const lines = csvText
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0);

  const parsed = lines.map(parseCsvLine);
  const headerIndex = parsed.findIndex((row) =>
    row.some((cell) => cell.toUpperCase() === "MAQUINA")
  );

  if (headerIndex < 0) return [];

  const header = parsed[headerIndex].map((cell) => cell.toUpperCase());
  const maquinaIdx = header.findIndex((cell) => cell === "MAQUINA");
  const situacaoIdx = header.findIndex((cell) => cell === "SITUAÇÃO" || cell === "SITUACAO");

  if (maquinaIdx < 0 || situacaoIdx < 0) return [];

  return parsed
    .slice(headerIndex + 1)
    .map((row) => ({
      maquina: (row[maquinaIdx] || "").trim(),
      status: (row[situacaoIdx] || "").trim() || "PENDENTE"
    }))
    .filter((item) => item.maquina);
}

exports.handler = async (event) => {
  try {
    const acao = event.queryStringParameters?.acao;

    if (event.httpMethod === "GET" && acao === "listar") {
      const response = await fetch(SHEET_URL);
      if (!response.ok) {
        return json(502, { ok: false, message: "Falha ao ler planilha pública." });
      }
      const csvText = await response.text();
      const data = parseCsv(csvText);
      return json(200, { ok: true, data });
    }

    if (event.httpMethod === "POST") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return json(502, { ok: false, message: "Falha ao comunicar com Apps Script." });
      }

      const rawText = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (_err) {
        parsed = { ok: false, message: "Resposta inválida do Apps Script." };
      }

      return json(200, parsed);
    }

    return json(405, { ok: false, message: "Método não permitido." });
  } catch (error) {
    return json(500, {
      ok: false,
      message: error.message || "Erro interno na function."
    });
  }
};
