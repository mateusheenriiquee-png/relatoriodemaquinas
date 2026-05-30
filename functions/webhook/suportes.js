const { processWebhookPost } = require("../../api/src/webhook-edge");

function headersToObject(requestHeaders) {
  const headers = {};
  for (const [key, value] of requestHeaders.entries()) {
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function queryToObject(url) {
  const params = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

async function handleRequest(context) {
  const result = await processWebhookPost(
    {
      httpMethod: context.request.method,
      body: await context.request.text(),
      headers: headersToObject(context.request.headers),
      queryStringParameters: queryToObject(new URL(context.request.url))
    },
    {
      origemIntegracao: "webhook-cloudflare",
      env: context.env
    }
  );

  return new Response(result.body, {
    status: result.statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestPost(context) {
  return handleRequest(context);
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return handleRequest(context);
  }
  return new Response(JSON.stringify({ ok: false, error: "Metodo nao permitido." }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
