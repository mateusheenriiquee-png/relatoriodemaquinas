function doPost(e) {
  var context = getSheetContext();
  if (!context.ok) return jsonResponse(false, context.message);

  var sheet = context.sheet;
  var headerRow = context.headerRow;
  var COL_MAQUINA = context.colMaquina;
  var COL_STATUS = context.colStatus;
  var data = JSON.parse(e.postData.contents);
  var acao = data.acao || "atualizarStatus";
  var values = sheet.getDataRange().getValues();

  if (acao === "adicionar") {
    for (var j = headerRow; j < values.length; j++) {
      if (String(values[j][COL_MAQUINA - 1]).toLowerCase() === String(data.maquina).toLowerCase()) {
        return jsonResponse(false, "Já existe uma máquina com esse nome.");
      }
    }
    var lastCol = Math.max(sheet.getLastColumn(), COL_STATUS);
    var newRow = new Array(lastCol);
    for (var n = 0; n < lastCol; n++) newRow[n] = "";
    newRow[COL_MAQUINA - 1] = data.maquina;
    newRow[COL_STATUS - 1] = data.status;
    sheet.appendRow(newRow);
    return jsonResponse(true, "ADICIONADO");
  }

  if (acao === "excluir") {
    for (var x = headerRow; x < values.length; x++) {
      if (values[x][COL_MAQUINA - 1] == data.maquina) {
        sheet.deleteRow(x + 1);
        return jsonResponse(true, "EXCLUIDO");
      }
    }
    return jsonResponse(false, "Máquina não encontrada para exclusão.");
  }

  for (var i = headerRow; i < values.length; i++) {
    if (values[i][COL_MAQUINA - 1] == data.maquina || values[i][COL_MAQUINA - 1] == data.maquinaAtual) {
      if (acao === "editar") {
        for (var k = headerRow; k < values.length; k++) {
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

function getSheetContext() {
  var spreadsheet = SpreadsheetApp.openById("12bTm7cAwlxKmW1qzaGr-dGpBAacUmNJmoC8ONLUqGHs");
  var sheets = spreadsheet.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var values = sheet.getDataRange().getValues();
    if (!values || !values.length) continue;

    for (var r = 0; r < Math.min(values.length, 10); r++) {
      var row = values[r].map(function(cell) {
        return String(cell || "").trim().toUpperCase();
      });

      var colMaquina = row.indexOf("MAQUINA") + 1;
      var colStatus = row.indexOf("SITUAÇÃO") + 1;
      if (colStatus === 0) colStatus = row.indexOf("SITUACAO") + 1;

      if (colMaquina > 0 && colStatus > 0) {
        return {
          ok: true,
          sheet: sheet,
          headerRow: r + 1,
          colMaquina: colMaquina,
          colStatus: colStatus
        };
      }
    }
  }

  return {
    ok: false,
    message: "Não encontrei os cabeçalhos MAQUINA e SITUAÇÃO na planilha."
  };
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
