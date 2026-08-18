const { db } = require('../firebase-admin');
const { getIdempotencyDocId } = require('../support-id');

const COLLECTION = process.env.FIRESTORE_COLLECTION || 'suportes_tecnicos';

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeStatusValue(value) {
  const text = normalizeText(value).toUpperCase();
  if (!text) return 'EM ABERTO';
  if (/EM ABERTO|NOVO|BACKLOG/.test(text)) return 'EM ABERTO';
  if (/ANDAMENTO|ATENDIMENTO|TRATATIV/.test(text)) return 'EM ANDAMENTO';
  if (/FINALIZ|CONCLUID|RESOLVID|FECHAD/.test(text)) return 'FINALIZADO';
  if (/SEM RETORNO/.test(text)) return 'SEM RETORNO';
  if (/REAGEND/.test(text)) return 'REAGENDADO';
  return text;
}

function normalizeStatusLabel(value) {
  return normalizeStatusValue(value);
}

function normalizeTecnicoKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '_');
}

function normalizeSupportRow(doc) {
  const data = doc.data ? doc.data() : {};
  return {
    id: data.id || doc.id,
    ...data,
    id: data.id || doc.id,
    protocolo: data.protocolo || data.idSuporte || '',
    responsavelAbertura: data.responsavelAbertura || data.responsavel_abertura || data.responsavel || '',
    cpfCnpj: data.cpfCnpj || data.cpf_cnpj || '',
    contato: data.contato || data.telefone || '',
    tipo: data.tipo || '',
    ac: data.ac || '',
    tecnico: data.tecnico || data.tecnicoResponsavel || '',
    tecnicoKey: data.tecnicoKey || data.tecnico_key || normalizeTecnicoKey(data.tecnico || data.tecnicoResponsavel || ''),
    status: normalizeStatusLabel(data.status || data.situacao || data.situacaoAtendimento || 'EM ABERTO'),
    statusAbertura: normalizeStatusLabel(data.statusAbertura || data.status_abertura || 'DEVIDO'),
    dataAbertura: data.dataAbertura || data.data_abertura || data.createdAt || data.created_at || '',
    dataInicioAtendimento: data.dataInicioAtendimento || data.data_inicio_atendimento || '',
    dataReagendamento: data.dataReagendamento || data.data_reagendamento || '',
    anotacoes: data.anotacoes || data.anotacao || '',
    motivo: data.motivo || data.motivoSemRetorno || '',
    motivoIndevido: data.motivoIndevido || data.motivo_indevido || '',
    createdAt: data.createdAt || data.created_at || '',
    updatedAt: data.updatedAt || data.updated_at || ''
  };
}

function applyDefaults(payload = {}) {
  const now = new Date().toISOString();
  const data = { ...payload };
  data.status = normalizeStatusValue(data.status || data.situacao || 'EM ABERTO');
  data.statusAbertura = normalizeStatusValue(data.statusAbertura || data.status_abertura || 'DEVIDO');
  data.updatedAt = data.updatedAt || now;
  if (!data.createdAt) data.createdAt = data.dataAbertura || now;
  if (!data.dataAbertura) data.dataAbertura = data.createdAt;
  if (data.tecnico && !data.tecnicoKey) {
    data.tecnicoKey = normalizeTecnicoKey(data.tecnico);
  }
  return data;
}

function resolveSupportDocId(input = {}) {
  const normalized = applyDefaults(input);
  const explicitId = normalizeText(normalized.id || normalized.docId || normalized.documentId || normalized.firestoreId || normalized._id);
  if (explicitId) {
    return explicitId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
  }
  return getIdempotencyDocId(normalized, input);
}

async function getSuportes(filters = {}) {
  const snapshot = await db.collection(COLLECTION).orderBy('dataAbertura', 'desc').limit(500).get();
  let rows = snapshot.docs.map(normalizeSupportRow);

  if (filters.status) {
    const normalizedStatus = normalizeStatusValue(filters.status);
    rows = rows.filter((row) => normalizeStatusValue(row.status) === normalizedStatus);
  }

  if (filters.tecnico) {
    const tecnicoKey = normalizeTecnicoKey(filters.tecnico);
    rows = rows.filter((row) => normalizeTecnicoKey(row.tecnicoKey || row.tecnico) === tecnicoKey);
  }

  if (filters.ac) {
    rows = rows.filter((row) => normalizeText(row.ac) === normalizeText(filters.ac));
  }

  if (filters.dataInicio) {
    rows = rows.filter((row) => (row.dataAbertura || '') >= filters.dataInicio);
  }

  if (filters.dataFim) {
    rows = rows.filter((row) => (row.dataAbertura || '') <= filters.dataFim);
  }

  return rows;
}

async function getSuporte(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? normalizeSupportRow(doc) : null;
}

async function getCountsByStatus() {
  const snapshot = await db.collection(COLLECTION).get();
  const counts = {};
  for (const doc of snapshot.docs) {
    const row = normalizeSupportRow(doc);
    const status = normalizeStatusValue(row.status || 'EM ABERTO');
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

async function createSuporte(data = {}) {
  const payload = applyDefaults(data);
  const docId = resolveSupportDocId(payload);
  const docRef = db.collection(COLLECTION).doc(docId);
  const finalPayload = { ...payload };
  delete finalPayload.id;
  await docRef.set(finalPayload, { merge: true });
  const createdDoc = await docRef.get();
  return normalizeSupportRow(createdDoc);
}

async function importSuportes(rows = []) {
  const created = [];
  for (const row of rows) {
    const payload = applyDefaults(row);
    const docId = resolveSupportDocId(payload);
    const docRef = db.collection(COLLECTION).doc(docId);
    const finalPayload = { ...payload };
    delete finalPayload.id;
    await docRef.set(finalPayload, { merge: true });
    created.push(normalizeSupportRow(await docRef.get()));
  }
  return { imported: created.length };
}

async function updateSuporte(id, patch = {}) {
  const payload = applyDefaults({ ...patch, id });
  const finalPayload = { ...payload };
  delete finalPayload.id;
  const targetDocId = id || resolveSupportDocId(payload);
  await db.collection(COLLECTION).doc(targetDocId).set(finalPayload, { merge: true });
  const updatedDoc = await db.collection(COLLECTION).doc(targetDocId).get();
  return normalizeSupportRow(updatedDoc);
}

async function deleteSuporte(id) {
  await db.collection(COLLECTION).doc(id).delete();
}

async function getReagendadosOverdue() {
  const snapshot = await db.collection(COLLECTION).get();
  const now = Date.now();
  return snapshot.docs
    .map(normalizeSupportRow)
    .filter((row) => normalizeStatusValue(row.status) === 'REAGENDADO' && row.dataReagendamento && new Date(row.dataReagendamento).getTime() <= now)
    .sort((a, b) => (a.dataReagendamento || '').localeCompare(b.dataReagendamento || ''));
}

async function updateReagendadoToAberto() {
  const snapshot = await db.collection(COLLECTION).get();
  const now = Date.now();
  const updates = [];
  snapshot.docs.forEach((doc) => {
    const row = normalizeSupportRow(doc);
    if (normalizeStatusValue(row.status) === 'REAGENDADO' && row.dataReagendamento && new Date(row.dataReagendamento).getTime() <= now) {
      updates.push(db.collection(COLLECTION).doc(doc.id).set({ status: 'EM ABERTO', updatedAt: new Date().toISOString() }, { merge: true }));
    }
  });
  await Promise.all(updates);
  return updates.length;
}

module.exports = {
  getSuportes,
  getSuporte,
  getCountsByStatus,
  createSuporte,
  importSuportes,
  updateSuporte,
  deleteSuporte,
  getReagendadosOverdue,
  updateReagendadoToAberto,
  resolveSupportDocId
};
