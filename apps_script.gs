function doPost(e) {
  var sheet = SpreadsheetApp.openById("12bTm7cAwlxKmW1qzaGr-dGpBAacUmNJmoC8ONLUqGHs").getSheets()[0];
  var data = JSON.parse(e.postData.contents);
  var acao = data.acao || "atualizarStatus";
  var values = sheet.getDataRange().getValues();
  var COL_MAQUINA = 2; // Coluna B
  var COL_STATUS = 7;  // Coluna G (SITUAÇÃO)

  if (acao === "adicionar") {
    for (var j = 1; j < values.length; j++) {
      if (String(values[j][COL_MAQUINA - 1]).toLowerCase() === String(data.maquina).toLowerCase()) {
        return jsonResponse(false, "Já existe uma máquina com esse nome.");
      }
    }
    sheet.appendRow(["", data.maquina, "", "", "", "", data.status]);
    return jsonResponse(true, "ADICIONADO");
  }

  if (acao === "excluir") {
    for (var x = 1; x < values.length; x++) {
      if (values[x][COL_MAQUINA - 1] == data.maquina) {
        sheet.deleteRow(x + 1);
        return jsonResponse(true, "EXCLUIDO");
      }
    }
    return jsonResponse(false, "Máquina não encontrada para exclusão.");
  }

  for (var i = 1; i < values.length; i++) {
    if (values[i][COL_MAQUINA - 1] == data.maquina || values[i][COL_MAQUINA - 1] == data.maquinaAtual) {
      if (acao === "editar") {
        for (var k = 1; k < values.length; k++) {
          var mesmoNome = String(values[k][COL_MAQUINA - 1]).toLowerCase() === String(data.novaMaquina).toLowerCase();
          var linhaAtual = String(values[k][COL_MAQUINA - 1]).toLowerCase() === String(data.maquinaAtual).toLowerCase();
          if (mesmoNome && !linhaAtual) {
            return jsonResponse(false, "Já existe uma máquina com esse nome.");
          }
        }
        sheet.getRange(i + 1, COL_MAQUINA).setValue(data.novaMaquina);
        sheet.getRange(i + 1, COL_STATUS).setValue(data.novoStatus);
        return jsonResponse(true, "EDITADO");
      }

      sheet.getRange(i + 1, COL_STATUS).setValue(data.status);
      return jsonResponse(true, "ATUALIZADO");
    }
  }

  return jsonResponse(false, "Máquina não encontrada.");
}

function doGet() {
  return jsonResponse(true, "API online. Use POST para atualizar dados.");
}

function jsonResponse(ok, message) {
  var payload = JSON.stringify({
    ok: ok,
    message: message
  });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
