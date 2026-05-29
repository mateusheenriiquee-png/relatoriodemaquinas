const {
  normalizeSupport,
  normalizeText,
  hasAcceptableWebhookInput,
  collectUnmappedFields,
  stripTokenFromInput
} = require("./normalize");
const { getIdempotencyDocId, stripEmptyFields } = require("./support-id");

function prepareWebhookRecords(inputs, origemIntegracao = "webhook") {
  const records = [];

  for (const rawInput of inputs) {
    const input = stripTokenFromInput(rawInput);
    if (!hasAcceptableWebhookInput(input)) {
      continue;
    }

    const support = normalizeSupport(input, { partial: true });
    const extras = collectUnmappedFields(input);
    const merged = stripEmptyFields({ ...support, ...extras });

    if (!Object.keys(merged).length) {
      continue;
    }

    const docId = getIdempotencyDocId(merged, input);
    records.push({
      docId,
      fields: {
        ...merged,
        origemIntegracao,
        idempotencyKey: docId
      }
    });
  }

  return records;
}

module.exports = {
  prepareWebhookRecords
};
