function createError(status = 500, message = "Erro interno.", details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function jsonSuccess(res, payload = {}, status = 200) {
  return res.status(status).json({ ok: true, ...payload });
}

function jsonError(res, message = "Erro interno.", status = 500, details = null) {
  const payload = { ok: false, error: message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

module.exports = { createError, jsonSuccess, jsonError };