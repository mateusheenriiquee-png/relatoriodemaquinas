const { processWebhookPost } = require("../../api/src/webhook-core");

exports.handler = async (event) =>
  processWebhookPost(
    {
      httpMethod: event.httpMethod,
      body: event.body,
      headers: event.headers,
      queryStringParameters: event.queryStringParameters
    },
    { origemIntegracao: "webhook-netlify" }
  );
