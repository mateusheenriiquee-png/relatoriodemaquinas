const express = require("express");
const { processWebhookPayload } = require("../services/webhook-service");
const router = express.Router();

router.post("/suportes", async (req, res, next) => {
  try {
    const result = await processWebhookPayload({
      body: req.body,
      headers: req.headers,
      queryStringParameters: req.query,
      origemIntegracao: "webhook-express",
      env: process.env
    });
    return res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
