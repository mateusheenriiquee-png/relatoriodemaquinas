const express = require("express");
const { jsonError, jsonSuccess } = require("../utils/http");
const { isSheetsAuthorized } = require("../middleware/auth");
const { upsertSheetRow, deleteSheetRow } = require("../sheets");

const router = express.Router();

router.post("/upsert", async (req, res, next) => {
  try {
    if (!isSheetsAuthorized(req)) {
      return jsonError(res, "Nao autorizado.", 401);
    }

    const doc = req.body?.doc;
    if (!doc || !doc.id) {
      return jsonError(res, "doc com id necessario.", 400);
    }

    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    const sheetName = process.env.SHEETS_SHEET_NAME || "Sheet1";
    const serviceAccountRaw = process.env.SHEETS_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    const result = await upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc });
    return jsonSuccess(res, result, 200);
  } catch (err) {
    return next(err);
  }
});

router.post("/delete", async (req, res, next) => {
  try {
    if (!isSheetsAuthorized(req)) {
      return jsonError(res, "Nao autorizado.", 401);
    }

    const docId = req.body?.docId;
    if (!docId) {
      return jsonError(res, "docId requerido.", 400);
    }

    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    const sheetName = process.env.SHEETS_SHEET_NAME || "Sheet1";
    const serviceAccountRaw = process.env.SHEETS_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    const result = await deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId });
    return jsonSuccess(res, result, 200);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
