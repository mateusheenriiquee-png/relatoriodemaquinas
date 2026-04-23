function doPost(e) {
  var sheet = SpreadsheetApp.openById("12bTm7cAwlxKmW1qzaGr-dGpBAacUmNJmoC8ONLUqGHs").getSheets()[0];
  var data = JSON.parse(e.postData.contents);
  var acao = data.acao || "atualizarStatus";
  var values = sheet.getDataRange().getValues();

  if (acao === "adicionar") {
    for (var j = 1; j < values.length; j++) {
      if (String(values[j][0]).toLowerCase() === String(data.maquina).toLowerCase()) {
        return jsonResponse(false, "Já existe uma máquina com esse nome.");
      }
    }
    sheet.appendRow([data.maquina, data.status]);
    return jsonResponse(true, "ADICIONADO");
  }

  if (acao === "excluir") {
    for (var x = 1; x < values.length; x++) {
      if (values[x][0] == data.maquina) {
        sheet.deleteRow(x + 1);
        return jsonResponse(true, "EXCLUIDO");
      }
    }
    return jsonResponse(false, "Máquina não encontrada para exclusão.");
  }

  for (var i = 1; i < values.length; i++) {
    if (values[i][0] == data.maquina || values[i][0] == data.maquinaAtual) {
      if (acao === "editar") {
        for (var k = 1; k < values.length; k++) {
          var mesmoNome = String(values[k][0]).toLowerCase() === String(data.novaMaquina).toLowerCase();
          var linhaAtual = String(values[k][0]).toLowerCase() === String(data.maquinaAtual).toLowerCase();
          if (mesmoNome && !linhaAtual) {
            return jsonResponse(false, "Já existe uma máquina com esse nome.");
          }
        }
        sheet.getRange(i + 1, 1).setValue(data.novaMaquina);
        sheet.getRange(i + 1, 2).setValue(data.novoStatus);
        return jsonResponse(true, "EDITADO");
      }

      sheet.getRange(i + 1, 2).setValue(data.status);
      return jsonResponse(true, "ATUALIZADO");
    }
  }

  return jsonResponse(false, "Máquina não encontrada.");
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
