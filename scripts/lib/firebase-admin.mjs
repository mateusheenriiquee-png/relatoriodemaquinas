import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * Inicialização do Admin SDK para os scripts de manutenção.
 *
 * Existe para os scripts não repetirem o caminho da chave: quando a credencial
 * é rotacionada, quem tinha o nome do arquivo escrito dentro de si passava a
 * falhar com UNAUTHENTICATED sem dizer o porquê. Aqui a chave é resolvida em
 * um lugar só, e o erro diz exatamente o que fazer.
 *
 * Ordem de resolução:
 *   1. GOOGLE_APPLICATION_CREDENTIALS (caminho completo) — útil em CI.
 *   2. credentials/<CHAVE_PADRAO>.
 *   3. Qualquer outro *firebase-adminsdk*.json em credentials/, do mais novo
 *      para o mais antigo — depois de uma rotação, a chave nova costuma ser a
 *      última baixada.
 */

const PASTA_CREDENCIAIS = 'credentials';
const CHAVE_PADRAO = 'suportetecnico-api2-firebase-adminsdk-fbsvc-57f85e4a33.json';

function candidatos() {
  const lista = [];

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    lista.push(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }

  const pasta = path.resolve(process.cwd(), PASTA_CREDENCIAIS);
  lista.push(path.join(pasta, CHAVE_PADRAO));

  if (fs.existsSync(pasta)) {
    const outras = fs
      .readdirSync(pasta)
      .filter((nome) => nome.includes('firebase-adminsdk') && nome.endsWith('.json'))
      .map((nome) => path.join(pasta, nome))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    lista.push(...outras);
  }

  return [...new Set(lista)].filter((p) => fs.existsSync(p));
}

/** Devolve { db, caminho } com o Admin SDK já inicializado, ou encerra o processo. */
export function iniciarFirestore() {
  const encontrados = candidatos();

  if (!encontrados.length) {
    console.error(
      `Nenhuma chave de service account encontrada em ${PASTA_CREDENCIAIS}/.\n` +
        'Gere uma no Firebase Console (Configurações do projeto → Contas de serviço →\n' +
        `Gerar nova chave privada) e salve em ${PASTA_CREDENCIAIS}/, ou aponte\n` +
        'GOOGLE_APPLICATION_CREDENTIALS para o arquivo.'
    );
    process.exit(1);
  }

  const caminho = encontrados[0];
  const serviceAccount = JSON.parse(fs.readFileSync(caminho, 'utf8'));

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  return { db: admin.firestore(), caminho };
}

/**
 * Falha de credencial dá erro de gRPC genérico; sem esta tradução a mensagem
 * não diz que o problema é a chave, e o tempo vai embora depurando a query.
 */
export function explicarErro(err) {
  if (err && err.code === 16) {
    return (
      'Credencial recusada pelo Firestore (UNAUTHENTICATED). A chave provavelmente\n' +
      'foi revogada. Gere uma nova no Firebase Console → Configurações do projeto →\n' +
      `Contas de serviço → Gerar nova chave privada e salve em ${PASTA_CREDENCIAIS}/.`
    );
  }
  return err?.stack || String(err);
}
