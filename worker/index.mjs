import { processWebhookPost } from "./webhook.mjs";
import { upsertSheetRow, deleteSheetRow } from "./sheets-sync.mjs";
import { getDocument, updateDocument } from "./firestore-rest.mjs";
import { createUserInFirebase, verifyFirebaseToken } from "./auth-admin.mjs";
import { criarUsuarioFirebase } from "./criar-usuario.mjs";
import {
  editarUsuario,
  atualizarCargo,
  excluirUsuario,
  liberarEmailUsuario
} from "./gerenciar-usuario.mjs";
import { CARGOS, normalizarCargo } from "./funcoes.mjs";

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function isSheetsAuthorized(request, env) {
  const expected = (env.SHEETS_SYNC_TOKEN || "").toString();
  if (!expected) return true;
  const token = (request.headers.get("x-sync-token") || "").toString();
  return token && token === expected;
}

async function getAdminAuthInfo(request, env) {
  // Obter token do header Authorization
  const authHeader = request.headers.get("authorization") || "";
  const headerToken = authHeader.replace("Bearer ", "");

  console.log(`[Middleware] Verificando autorização:`);
  console.log(`  - Authorization header: ${authHeader ? "✓" : "✗"}`);
  console.log(`  - Token extraído: ${headerToken ? headerToken.substring(0, 50) + "..." : "✗"}`);

  // Se há token, validar com Firebase
  if (headerToken) {
    console.log(`[Middleware] Modo: Firebase Token`);
    try {
      console.log(`[Middleware] Validando Firebase Token...`);
      const result = await verifyFirebaseToken(headerToken, env);
      if (result.valid) {
        console.log(`[Middleware] ✅ Firebase Token válido - UID: ${result.uid}`);
        return { authorized: true, uid: result.uid, email: result.email };
      }
      console.log(`[Middleware] ❌ Firebase Token inválido: ${result.error}`);
      return { authorized: false, error: result.error };
    } catch (error) {
      console.error(`[Middleware] ❌ Erro ao validar Firebase token:`, error.message);
      return { authorized: false, error: error.message };
    }
  }

  // Sem token - modo desenvolvimento, permitir
  console.log(`[Middleware] Nenhum token fornecido - modo desenvolvimento (permitindo)`);
  return { authorized: true, uid: null, email: null };
}

async function handleAssociateTecnico(supportId, authInfo, env) {
  if (!authInfo?.uid) {
    return jsonResponse(401, {
      ok: false,
      error: "Nao autorizado. Nao foi possivel identificar o usuario a partir do token."
    });
  }

  try {
    const usuariosCollection = env.USUARIOS_COLLECTION || "usuarios";
    const supportsCollection = env.FIRESTORE_COLLECTION || "suportes_tecnicos";
    const serviceAccountRaw = env.FIREBASE_SERVICE_ACCOUNT_BASE64 || env.FIREBASE_SERVICE_ACCOUNT;

    const userData = await getDocument({
      serviceAccountRaw,
      collection: usuariosCollection,
      docId: authInfo.uid
    });

    const tecnico = String(userData?.displayName || authInfo.email || "").trim();
    if (!tecnico) {
      return jsonResponse(400, {
        ok: false,
        error: "Nao foi possivel determinar o nome do tecnico a partir do usuario autenticado."
      });
    }

    const supportDoc = await getDocument({
      serviceAccountRaw,
      collection: supportsCollection,
      docId: supportId
    });
    if (!supportDoc) {
      return jsonResponse(404, { ok: false, error: "Registro não encontrado." });
    }

    await updateDocument({
      serviceAccountRaw,
      collection: supportsCollection,
      docId: supportId,
      fields: {
        tecnico,
        status: "EM ANDAMENTO",
        updatedAt: new Date().toISOString()
      }
    });

    console.log(`[AssociateRoute] Suporte ${supportId} atualizado. Tecnico: ${tecnico}`);

    return jsonResponse(200, { ok: true, tecnico, message: `Técnico associado com sucesso: ${tecnico}` });
  } catch (error) {
    console.error("[AssociateRoute] Erro interno ao associar técnico:", error.stack || error.message || error);
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao associar técnico.",
      details: String(error?.message || error)
    });
  }
}

function getSheetsConfig(env) {
  // Tentar primeiro FIREBASE_SERVICE_ACCOUNT_BASE64, depois fallback
  const firebaseBase64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const firebaseRaw = env.FIREBASE_SERVICE_ACCOUNT;
  const sheetsServiceAccount = env.SHEETS_SERVICE_ACCOUNT;
  
  let serviceAccountRaw = sheetsServiceAccount || firebaseBase64 || firebaseRaw;
  let isBase64 = !sheetsServiceAccount && !!firebaseBase64;
  
  // Se for Base64, decodificar
  if (isBase64 && serviceAccountRaw) {
    try {
      serviceAccountRaw = atob(serviceAccountRaw);
    } catch (e) {
      console.error("[Sheets] Erro ao decodificar Base64:", e.message);
    }
  }
  
  return {
    spreadsheetId: env.SHEETS_SPREADSHEET_ID,
    sheetName: env.SHEETS_SHEET_NAME || "Sheet1",
    serviceAccountRaw
  };
}

async function handleSheetsRoute(request, env, action) {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }
  if (!isSheetsAuthorized(request, env)) {
    return jsonResponse(401, { ok: false, error: "Nao autorizado." });
  }

  const { spreadsheetId, sheetName, serviceAccountRaw } = getSheetsConfig(env);
  if (!spreadsheetId || !serviceAccountRaw) {
    return jsonResponse(400, {
      ok: false,
      error: "SHEETS_SPREADSHEET_ID ou FIREBASE_SERVICE_ACCOUNT nao configurados."
    });
  }

  try {
    const body = await request.json();
    if (action === "upsert") {
      const doc = body?.doc;
      if (!doc?.id) {
        return jsonResponse(400, { ok: false, error: "doc com id necessario." });
      }
      const result = await upsertSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, doc });
      return jsonResponse(200, { ok: true, ...result });
    }

    const docId = body?.docId;
    if (!docId) {
      return jsonResponse(400, { ok: false, error: "docId requerido." });
    }
    const result = await deleteSheetRow({ serviceAccountRaw, spreadsheetId, sheetName, docId });
    return jsonResponse(200, { ok: true, ...result });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "Erro ao sincronizar com a planilha.",
      details: String(error?.message || error)
    });
  }
}

// ============================================
// � SINCRONIZAÇÃO COM GOOGLE SHEETS
// ============================================
async function syncDocsToSheets(docs, env) {
  const { spreadsheetId, sheetName, serviceAccountRaw } = getSheetsConfig(env);
  
  if (!spreadsheetId || !serviceAccountRaw) {
    console.warn("[Sheets Sync] Configuração incompleta, pulando sincronização");
    return;
  }

  console.log(`[Sheets Sync] Iniciando sincronização de ${docs.length} documento(s)...`);
  
  for (const doc of docs) {
    try {
      if (!doc.id) {
        console.warn("[Sheets Sync] Documento sem ID, pulando");
        continue;
      }
      
      console.log(`[Sheets Sync] Sincronizando documento: ${doc.id}`);
      const result = await upsertSheetRow({
        serviceAccountRaw,
        spreadsheetId,
        sheetName,
        doc
      });
      
      console.log(`[Sheets Sync] ✓ ${result.updated ? "Atualizado" : "Adicionado"}: ${doc.id}`);
    } catch (error) {
      console.error(`[Sheets Sync] ❌ Erro ao sincronizar ${doc.id}:`, error.message);
      // Continuar mesmo em caso de erro para não bloquear outros documentos
    }
  }
  
  console.log(`[Sheets Sync] ✓ Sincronização concluída`);
}

// ============================================
// �🔌 INTEGRAÇÃO COM GOOGLE APPS SCRIPT (OPÇÃO 1)
// ============================================
async function atualizarStatusNaPlanilha(protocolo, novoStatus, env) {
  const url = env.APPS_SCRIPT_URL;
  const token = env.APPS_SCRIPT_TOKEN;

  if (!url || !token) {
    console.error("[Sheets AppScript] Faltam as variáveis APPS_SCRIPT_URL ou APPS_SCRIPT_TOKEN.");
    return false;
  }

  const payload = {
    token: token,
    protocolo: protocolo,
    status: novoStatus
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const resultado = await response.json();
    if (resultado.sucesso) {
      console.log("[Sheets AppScript] Sucesso:", resultado.mensagem);
      return true;
    } else {
      console.error("[Sheets AppScript] Erro retornado:", resultado.erro);
      return false;
    }
  } catch (erro) {
    console.error("[Sheets AppScript] Falha na requisição:", erro);
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ============================================
    // 🔐 Proteção de Rotas Admin
    // ============================================
    let adminAuthInfo = null;
    if (url.pathname.startsWith("/admin/") && !url.pathname.startsWith("/admin/debug-")) {
      adminAuthInfo = await getAdminAuthInfo(request, env);
      if (!adminAuthInfo.authorized) {
        return jsonResponse(401, {
          ok: false,
          error: "Não autorizado. Forneça um Firebase ID Token válido via header Authorization: Bearer"
        });
      }
    }

    // ============================================
    // 🔧 ASSOCIAR TÉCNICO RESPONSÁVEL
    // ============================================
    const associateMatch = url.pathname.match(/^\/admin\/supports\/([^/]+)\/associate$/);
    if (associateMatch && request.method === "POST") {
      return handleAssociateTecnico(associateMatch[1], adminAuthInfo, env);
    }

    if (url.pathname === "/sheets/upsert") {
      return handleSheetsRoute(request, env, "upsert");
    }
    if (url.pathname === "/sheets/delete") {
      return handleSheetsRoute(request, env, "delete");
    }

    if (url.pathname === "/webhook/suportes") {
      if (request.method !== "POST") {
        return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
      }

      try {
        const result = await processWebhookPost(
          {
            httpMethod: "POST",
            body: await request.text(),
            headers: Object.fromEntries(request.headers),
            queryStringParameters: Object.fromEntries(url.searchParams)
          },
          { origemIntegracao: "webhook-cloudflare-worker", env }
        );
        
        // 🔄 SINCRONIZAÇÃO AUTOMÁTICA COM SHEETS (após webhook processado)
        const parsedBody = JSON.parse(result.body);
        if (parsedBody.ok && parsedBody.docs && Array.isArray(parsedBody.docs)) {
          // Sincronizar cada documento com a planilha (background, não bloqueia resposta)
          syncDocsToSheets(parsedBody.docs, env).catch((err) => {
            console.error("[Webhook Sheets Sync] Erro ao sincronizar:", err.message);
          });
        }
        
        return jsonResponse(result.statusCode, parsedBody);
      } catch (error) {
        return jsonResponse(500, {
          ok: false,
          error: "Erro interno ao processar webhook.",
          details: String(error?.message || error)
        });
      }
    }
        // ============================================
    // 📝 ROTA PARA ATUALIZAR STATUS DO SUPORTE
    // ============================================
    if (url.pathname === "/api/suportes/atualizar" && request.method === "PUT") {
      try {
        const body = await request.json();
        const { protocolo, status } = body;

        if (!protocolo || !status) {
          return jsonResponse(400, { 
            ok: false, 
            error: "É necessário enviar 'protocolo' e 'status'." 
          });
        }

        // 1. ATUALIZAR NO FIRESTORE
        // Se o seu frontend (site) já atualiza o Firestore diretamente via Firebase SDK,
        // você pode pular esta etapa aqui no Worker. 
        // Caso contrário, você deve chamar sua função do firestore-rest.mjs aqui.
        
        // 2. AVISAR A PLANILHA DO GOOGLE (APPS SCRIPT)
        const planilhaAtualizada = await atualizarStatusNaPlanilha(protocolo, status, env);

        return jsonResponse(200, {
          ok: true,
          mensagem: "Status processado com sucesso.",
          planilha_atualizada: planilhaAtualizada
        });
      } catch (error) {
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao processar atualização.",
          details: error.message
        });
      }
    }
    // Endpoint de DEBUG - lista TODAS as variáveis do env
    if (url.pathname === "/admin/debug-env") {
      try {
        const allVars = {};
        
        // Listar todas as variáveis conhecidas
        const knownVars = [
          "FIREBASE_SERVICE_ACCOUNT",
          "FIREBASE_SERVICE_ACCOUNT_BASE64",
          "FIREBASE_PROJECT_ID",
          "USUARIOS_COLLECTION",
          "SHEETS_SERVICE_ACCOUNT",
          "SHEETS_SPREADSHEET_ID",
          "SHEETS_SHEET_NAME",
          "SHEETS_SYNC_TOKEN",
          "WEBHOOK_TOKEN"
        ];

        for (const varName of knownVars) {
          const value = env[varName];
          if (value) {
            // Se for credencial, mostrar apenas o tamanho
            if (varName.includes("SERVICE_ACCOUNT") || varName.includes("TOKEN") || varName.includes("KEY")) {
              allVars[varName] = `[${value.length} chars]`;
            } else {
              allVars[varName] = value;
            }
          } else {
            allVars[varName] = "❌ NÃO CONFIGURADA";
          }
        }

        return jsonResponse(200, {
          ok: true,
          allVariables: allVars,
          hasBase64: !!env.FIREBASE_SERVICE_ACCOUNT_BASE64,
          hasPlaintext: !!env.FIREBASE_SERVICE_ACCOUNT
        });
      } catch (error) {
        return jsonResponse(500, {
          ok: false,
          error: error.message
        });
      }
    }

    // Endpoint para diagnóstico de Firebase
    if (url.pathname === "/admin/health") {
      try {
        const hasFBServiceAccount = !!env.FIREBASE_SERVICE_ACCOUNT || !!env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        const hasFBProjectId = !!env.FIREBASE_PROJECT_ID;
        const hasUsuariosCollection = !!env.USUARIOS_COLLECTION;

        return jsonResponse(200, {
          ok: true,
          environment: {
            FIREBASE_SERVICE_ACCOUNT: hasFBServiceAccount ? "✓ Configurada" : "✗ Faltando",
            FIREBASE_PROJECT_ID: hasFBProjectId ? "✓ Configurada" : "✗ Faltando",
            USUARIOS_COLLECTION: hasUsuariosCollection ? "✓ Configurada" : "✗ Faltando"
          },
          message: "Verifique se todas as variáveis estão ✓"
        });
      } catch (error) {
        return jsonResponse(500, {
          ok: false,
          error: error.message
        });
      }
    }

    // Endpoint de DEBUG - mostra dados da requisição
    if (url.pathname === "/admin/debug-request") {
      try {
        console.log("[Debug] Método:", request.method);
        console.log("[Debug] URL:", url.pathname);
        console.log("[Debug] Headers:", Object.fromEntries(request.headers));
        
        return jsonResponse(200, {
          ok: true,
          request: {
            method: request.method,
            pathname: url.pathname,
            url: request.url,
            headers: Object.fromEntries(request.headers)
          },
          env: {
            hasFirebaseServiceAccount: !!env.FIREBASE_SERVICE_ACCOUNT,
            hasFirebaseServiceAccountBase64: !!env.FIREBASE_SERVICE_ACCOUNT_BASE64
          }
        });
      } catch (error) {
        return jsonResponse(500, {
          ok: false,
          error: error.message
        });
      }
    }

    // Endpoint de DEBUG - testa decodificação Base64
    if (url.pathname === "/admin/debug-base64") {
      try {
        const base64Input = env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        
        if (!base64Input) {
          return jsonResponse(400, {
            ok: false,
            error: "FIREBASE_SERVICE_ACCOUNT_BASE64 não configurada"
          });
        }

        console.log("[Debug-Base64] Input length:", base64Input.length);
        console.log("[Debug-Base64] Input start:", base64Input.substring(0, 50));

        // Tentar decodificar
        let decoded;
        try {
          decoded = atob(base64Input);
          console.log("[Debug-Base64] ✓ Decodificado com sucesso");
          console.log("[Debug-Base64] Decoded length:", decoded.length);
          console.log("[Debug-Base64] Decoded start:", decoded.substring(0, 100));
        } catch (decodeError) {
          console.error("[Debug-Base64] Erro ao decodificar:", decodeError.message);
          return jsonResponse(400, {
            ok: false,
            error: "Erro ao decodificar Base64",
            details: decodeError.message
          });
        }

        // Tentar fazer parse JSON
        let parsed;
        try {
          parsed = JSON.parse(decoded);
          console.log("[Debug-Base64] ✓ JSON parseado com sucesso");
          console.log("[Debug-Base64] project_id:", parsed.project_id);
          console.log("[Debug-Base64] client_email:", parsed.client_email);
          console.log("[Debug-Base64] has private_key:", !!parsed.private_key);
        } catch (parseError) {
          console.error("[Debug-Base64] Erro ao parsear JSON:", parseError.message);
          return jsonResponse(400, {
            ok: false,
            error: "Erro ao parsear JSON",
            details: parseError.message,
            receivedText: decoded.substring(0, 200)
          });
        }

        return jsonResponse(200, {
          ok: true,
          base64: {
            inputLength: base64Input.length,
            decodedLength: decoded.length
          },
          credentials: {
            project_id: parsed.project_id,
            client_email: parsed.client_email,
            has_private_key: !!parsed.private_key,
            private_key_length: parsed.private_key?.length || 0
          }
        });
      } catch (error) {
        console.error("[Debug-Base64] Erro geral:", error.message);
        return jsonResponse(500, {
          ok: false,
          error: "Erro geral no debug",
          details: error.message
        });
      }
    }

    // ============================================
    // 👤 ROTAS DE GERENCIAMENTO DE USUÁRIOS
    // ============================================

    // 1. CREATE USER
    if (url.pathname === "/admin/create-user" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, password, displayName, cargo } = body;

        if (!email || !password || !displayName) {
          return jsonResponse(400, {
            ok: false,
            error: "Email, senha e displayName são obrigatórios."
          });
        }

        const result = await criarUsuarioFirebase({
          email,
          password,
          displayName,
          cargo: normalizarCargo(cargo || "Operador"),
          env
        });

        return result.ok
          ? jsonResponse(201, { ok: true, ...result })
          : jsonResponse(400, result);
      } catch (error) {
        console.error("[Worker] Erro em /admin/create-user:", error);
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao criar usuário.",
          details: String(error?.message || error)
        });
      }
    }

    // 2. EDIT USER (email, nome, cargo, senha)
    if (url.pathname === "/admin/edit-user" && request.method === "PATCH") {
      try {
        const body = await request.json();
        const result = await editarUsuario({
          ...body,
          cargo: body.cargo ? normalizarCargo(body.cargo) : undefined,
          env
        });

        return result.ok
          ? jsonResponse(200, result)
          : jsonResponse(400, result);
      } catch (error) {
        console.error("[Worker] Erro em /admin/edit-user:", error);
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao editar usuário.",
          details: String(error?.message || error)
        });
      }
    }

    // 3. UPDATE CARGO
    if (url.pathname === "/admin/update-cargo" && request.method === "PATCH") {
      try {
        const body = await request.json();
        const { uid, cargo } = body;

        if (!uid || !cargo) {
          return jsonResponse(400, {
            ok: false,
            error: "uid e cargo são obrigatórios."
          });
        }

        const result = await atualizarCargo(uid, normalizarCargo(cargo), env);
        return result.ok
          ? jsonResponse(200, result)
          : jsonResponse(400, result);
      } catch (error) {
        console.error("[Worker] Erro em /admin/update-cargo:", error);
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao atualizar cargo.",
          details: String(error?.message || error)
        });
      }
    }

    // 4. DELETE USER
    if (url.pathname === "/admin/delete-user" && request.method === "DELETE") {
      try {
        const body = await request.json();
        const result = await excluirUsuario({
          ...body,
          env
        });

        return result.ok
          ? jsonResponse(200, result)
          : jsonResponse(400, result);
      } catch (error) {
        console.error("[Worker] Erro em /admin/delete-user:", error);
        return jsonResponse(500, {
          ok: false,
          error: "Erro ao excluir usuário.",
          details: String(error?.message || error)
        });
      }
    }

    // 5. LIST CARGOS
    if (url.pathname === "/admin/cargos" && request.method === "GET") {
      return jsonResponse(200, {
        ok: true,
        cargos: CARGOS
      });
    }

    return env.ASSETS.fetch(request);
  }
};
