const { jsonError } = require("../utils/http");

function notFoundHandler(_req, res) {
  return jsonError(res, "Recurso nao encontrado.", 404);
}

function errorHandler(err, _req, res, _next) {
  const status = Number(err.status) || 500;
  if (status >= 500) {
    console.error("[ErrorHandler]", err.stack || err.message || err);
  }
  return jsonError(res, err.message || "Erro interno.", status, err.details);
}

module.exports = { notFoundHandler, errorHandler };