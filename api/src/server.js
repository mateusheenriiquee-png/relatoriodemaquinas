const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./routes/webhook");
const sheetsRoutes = require("./routes/sheets");
const adminRoutes = require("./routes/admin");
const { notFoundHandler, errorHandler } = require("./middleware/error-handler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "suporte-webhook-api" });
});

app.use("/webhook", webhookRoutes);
app.use("/sheets", sheetsRoutes);
app.use("/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Webhook API rodando em http://localhost:${PORT}`);
});
