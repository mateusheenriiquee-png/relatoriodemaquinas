import { explicarErro, iniciarFirestore } from './lib/firebase-admin.mjs';

const { db, caminho } = iniciarFirestore();
console.log('Credencial:', caminho);

const COLLECTION = 'suportes_tecnicos';

function normKey(v) {
  return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function titleCaseName(value) {
  const s = String(value || '').trim().replace(/\s+/g, ' ');
  if (!s) return s;
  return s
    .split(' ')
    .map(part => part.split('-').map(p => p ? (p[0].toUpperCase() + p.slice(1).toLowerCase()) : '').join('-'))
    .join(' ');
}

async function backfillBatch(limit = 500) {
  const snapshot = await db.collection(COLLECTION).limit(limit).get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  let count = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    const tecnico = data.tecnico || data.tecnicoResponsavel || '';
    const key = normKey(tecnico);
    const title = titleCaseName(tecnico);
    const updateData = {};
    if (title && data.tecnico !== title) updateData.tecnico = title;
    if (key && data.tecnicoKey !== key) updateData.tecnicoKey = key;
    if (Object.keys(updateData).length) {
      batch.update(doc.ref, updateData);
      count += 1;
    }
  });
  await batch.commit();
  return count;
}

async function run() {
  console.log('Starting backfill for tecnicoKey...');
  let totalUpdated = 0;
  while (true) {
    const updated = await backfillBatch(500);
    if (updated === 0) break;
    totalUpdated += updated;
    console.log('Updated batch, docs updated:', updated);
    // small delay to avoid bursting
    await new Promise(res => setTimeout(res, 400));
  }
  console.log('Backfill completed. Total documents updated:', totalUpdated);
  process.exit(0);
}

run().catch(err => {
  console.error('Backfill failed:', explicarErro(err));
  process.exit(1);
});
