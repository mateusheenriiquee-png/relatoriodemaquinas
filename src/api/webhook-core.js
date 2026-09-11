const { processWebhookPayload } = require("./services/webhook-service");

async function processWebhookPost(
  { httpMethod = "POST", body = "", headers = {}, queryStringParameters = {} },
  { origemIntegracao = "webhook", env = null } = {}
) {
  if (httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "Metodo nao permitido." })
    };
  }

  const result = await processWebhookPayload({
    body,
    headers,
    queryStringParameters,
    origemIntegracao,
    env: env || process.env
  });

  return result;
}

module.exports = { processWebhookPost };
