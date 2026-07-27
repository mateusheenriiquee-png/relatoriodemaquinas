import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Adjust path to your service account JSON file in the repo
const SERVICE_ACCOUNT_PATH = path.resolve(process.cwd(), 'suportetecnico-api2-firebase-adminsdk-fbsvc-2af735b884.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account file not found:', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
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
  console.error('Backfill failed:', err);
  process.exit(1);
});
