import { explicarErro, iniciarFirestore } from './lib/firebase-admin.mjs';

const { db, caminho } = iniciarFirestore();
console.log('Credencial:', caminho);

const COLLECTION = 'suportes_tecnicos';

// true = só mostra o que seria alterado, sem gravar nada.
const DRY_RUN = process.argv.includes('--dry-run');

async function backfillBatch(startAfter, limit = 500) {
  let q = db.collection(COLLECTION).orderBy('__name__').limit(limit);
  if (startAfter) q = q.startAfter(startAfter);
  const snapshot = await q.get();
  if (snapshot.empty) return { count: 0, last: null, examples: [] };

  const batch = db.batch();
  let count = 0;
  const examples = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const valor = Number(data.valorVenda) || 0;
    const jaTemStatus = String(data.vendaStatus || '').trim();
    if (valor > 0 && !jaTemStatus) {
      count += 1;
      if (examples.length < 10) {
        examples.push({ id: doc.id, valorVenda: valor, protocolo: data.protocolo || '' });
      }
      if (!DRY_RUN) batch.update(doc.ref, { vendaStatus: 'GANHO' });
    }
  });
  if (!DRY_RUN && count) await batch.commit();

  return { count, last: snapshot.docs[snapshot.docs.length - 1], examples };
}

async function run() {
  console.log(
    DRY_RUN
      ? 'Simulando backfill de vendaStatus=GANHO (nada será gravado)...'
      : 'Gravando backfill de vendaStatus=GANHO...'
  );
  let totalUpdated = 0;
  let cursor;
  let mostrouExemplos = false;
  for (;;) {
    const { count, last, examples } = await backfillBatch(cursor, 500);
    if (!last) break;
    totalUpdated += count;
    if (count) console.log('Lote processado, docs marcados:', count);
    if (!mostrouExemplos && examples.length) {
      console.log('Exemplos:', examples);
      mostrouExemplos = true;
    }
    cursor = last;
    if (!DRY_RUN) await new Promise((res) => setTimeout(res, 400));
  }
  console.log(
    `Backfill ${DRY_RUN ? 'simulado' : 'concluído'}. Total de documentos ${DRY_RUN ? 'que seriam marcados' : 'marcados'}:`,
    totalUpdated
  );
  process.exit(0);
}

run().catch((err) => {
  console.error('Backfill falhou:', explicarErro(err));
  process.exit(1);
});
