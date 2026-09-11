/**
 * webhook-shared.js — monta os registros do webhook prontos para o Firestore.
 *
 * Vivia em src/api (a API Express). O Worker é quem está publicado e importava
 * daqui, o que prendia o backend inteiro a uma pasta que já não é usada: por
 * isso o arquivo passou para src/shared, junto de normalize/support-id, de quem
 * ele depende.
 */

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
