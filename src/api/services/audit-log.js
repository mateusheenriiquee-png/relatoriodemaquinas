const { db, admin } = require("../firebase-admin");

const AUDIT_COLLECTION = process.env.AUDIT_LOGS_COLLECTION || "audit_logs";

async function logAuditEntry({ action, entity, entityId = null, userId = null, userEmail = null, details = {} }) {
  const payload = {
    action: action || "unknown",
    entity: entity || "unknown",
    entityId,
    userId,
    userEmail,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection(AUDIT_COLLECTION).add(payload);
  } catch (error) {
    console.warn("[AuditLog] Nao foi possivel gravar log de auditoria:", error.message);
  }
}

module.exports = { logAuditEntry };