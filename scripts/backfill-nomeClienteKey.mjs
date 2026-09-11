import { explicarErro, iniciarFirestore } from './lib/firebase-admin.mjs';
// A MESMA função que a tela usa para normalizar o termo digitado. Importada, e
// não copiada: se a chave gravada aqui divergir um caractere do que a busca
// procura, o chamado simplesmente não aparece — e nada acusa o erro.
// `utils/format.js` não importa nada, então roda no Node sem o Vite.
import { normalizeSearchText } from '../src/frontend/web/src/utils/format.js';

/**
 * Preenche `nomeClienteKey` nos chamados que já existiam antes da busca por
 * nome do cliente.
 *
 * O Firestore não faz busca case-insensitive nem ignora acento, então a
 * consulta roda sobre esse campo normalizado. Sem o backfill, todo chamado
 * anterior fica invisível para quem procura pelo nome.
 */
const chaveNomeCliente = normalizeSearchText;

const { db, caminho } = iniciarFirestore();
console.log('Credencial:', caminho);

const COLLECTION = 'suportes_tecnicos';
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  console.log(
    DRY_RUN
      ? 'Simulando backfill de nomeClienteKey (nada será gravado)...'
      : 'Gravando backfill de nomeClienteKey...'
  );

  const snap = await db.collection(COLLECTION).get();
  console.log('Documentos na coleção:', snap.size);

  const pendentes = [];
  let semNome = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    const nome = data.nomeCliente;
    if (!nome) {
      semNome += 1;
      return;
    }
    const esperado = chaveNomeCliente(nome);
    if (data.nomeClienteKey !== esperado) {
      pendentes.push({ ref: doc.ref, id: doc.id, nome, esperado });
    }
  });

  console.log('Sem nome de cliente (ficam de fora):', semNome);
  console.log('A atualizar:', pendentes.length);
  console.log(
    'Exemplos:',
    pendentes.slice(0, 5).map((p) => ({ id: p.id, nome: p.nome, chave: p.esperado }))
  );

  if (DRY_RUN || !pendentes.length) {
    console.log(DRY_RUN ? 'Simulação concluída.' : 'Nada a fazer.');
    process.exit(0);
  }

  // Lotes de 400: o limite do batch do Firestore é 500 operações.
  let gravados = 0;
  for (let i = 0; i < pendentes.length; i += 400) {
    const lote = pendentes.slice(i, i + 400);
    const batch = db.batch();
    lote.forEach((p) => batch.update(p.ref, { nomeClienteKey: p.esperado }));
    await batch.commit();
    gravados += lote.length;
    console.log(`Gravados ${gravados} de ${pendentes.length}`);
  }

  console.log('Backfill concluído. Documentos atualizados:', gravados);
  process.exit(0);
}

run().catch((err) => {
  console.error('Backfill falhou:', explicarErro(err));
  process.exit(1);
});
