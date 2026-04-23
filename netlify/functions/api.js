const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLERRSfAPahteMekMH-fmJ9hr8XQAsuV1cTO8L0yTu7pjIkuUZu4w_uGEz2lEIcfktl1cy9dys6JAb/pub?output=csv";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUP7JuHLgRCvl0gG3o68K09sndNZYbJ-sPFHrW-s27oUiw9Oh9lQLeGT27rjTUFoL7/exec";

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };
}

function parseCsv(csvText) {
  return csvText
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split(",");
      return {
        maquina: (columns[0] || "").trim(),
        status: (columns[1] || "").trim()
      };
    })
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
