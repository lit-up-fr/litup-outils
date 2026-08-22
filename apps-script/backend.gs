// ============================================
// Lit uP — Backend Google Apps Script
// Version : 21 août 2026 (meta en tranches 45k + sync Airtable getAirtableData)
// Fichier versionné dans le repo : apps-script/backend.gs
// ============================================

// Configuration
const SHEET_NDF = "NDF";
const SHEET_COMPTA = "Compta";
const SHEET_CONFIG = "Config";
const SHEET_DEPENSES = "Depenses";

// ─── INITIALISATION ───
function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_NDF)) {
    const sh = ss.insertSheet(SHEET_NDF);
    sh.getRange(1, 1, 1, 16).setValues([["ref", "salarie", "date", "status", "statusDate", "paymentDate", "isPresta", "prestaName", "lines_json", "exportDate", "modifiedBy", "modifiedAt", "total", "nbLines", "comment", "coordo"]]);
    sh.getRange(1, 1, 1, 16).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SHEET_COMPTA)) {
    const sh = ss.insertSheet(SHEET_COMPTA);
    sh.getRange(1, 1, 1, 14).setValues([["id", "dt", "yr", "lib", "four", "cat", "act", "deb", "cre", "modal", "stat", "resp", "numj", "src"]]);
    sh.getRange(1, 1, 1, 14).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SHEET_CONFIG)) {
    const sh = ss.insertSheet(SHEET_CONFIG);
    sh.getRange(1, 1, 1, 3).setValues([["key", "value", "updatedAt"]]);
    sh.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SHEET_DEPENSES)) {
    const sh = ss.insertSheet(SHEET_DEPENSES);
    sh.getRange(1, 1, 1, 11).setValues([["date", "mode", "four", "desc", "amount", "code", "projet", "fileName", "driveUrl", "driveFileId", "createdAt"]]);
    sh.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
  }
}

// ─── WEB APP ENDPOINTS ───
function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || "";
    const postData = e.postData ? JSON.parse(e.postData.contents) : {};
    let result;
    switch (action) {
      case "getNDF": result = getNDF(params.salarie); break;
      case "getAllNDF": result = getAllNDF(); break;
      case "saveNDF": result = saveNDF(postData); break;
      case "deleteNDF": result = deleteNDF(postData); break;
      case "deleteNDFSheetOnly": result = deleteNDFSheetOnly(postData); break;
      case "updateStatus": result = updateStatus(postData); break;
      case "getLastNDFNumber": result = getLastNDFNumber(); break;
      case "generateNDFPDF": result = generateNDFPDF(postData); break;
      case "deleteDriveFile": result = deleteDriveFile(postData); break;
      case "getConfig": result = getConfig(params.key); break;
      case "setConfig": result = setConfig(postData.key, postData.value); break;
      case "getCompta": result = getCompta(); break;
      case "saveCompta": result = saveCompta(postData); break;
      case "getDepenses": result = getDepenses(); break;
      case "saveDepenses": result = saveDepenses(postData); break;
      case "init": onOpen(); result = { ok: true, message: "Onglets initialisés" }; break;
      case "uploadJustif": result = uploadJustif(postData); break;
      case "ocrJustif": result = ocrJustif(postData); break;
      case "renameDriveFolder": result = renameDriveFolder(postData); break;
      case "getCodesCompta": result = getCodesCompta(); break;
      case "setCodesCompta": result = setCodesCompta(postData); break;
      case "getAirtableData": result = getAirtableData(); break;
      default: result = { error: "Action inconnue: " + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message, stack: (err.stack || "").substring(0, 500) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── NDF FUNCTIONS ───
function getNDF(salarie) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NDF);
  if (!sh) return { ndfs: [] };
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const ndfs = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => row[h] = data[i][j]);
    if (!salarie || row.salarie === salarie) {
      try { row.lines = JSON.parse(row.lines_json || "[]"); } catch (e) { row.lines = []; }
      delete row.lines_json;
      ndfs.push(row);
    }
  }
  return { ndfs };
}

function getAllNDF() { return getNDF(null); }

function saveNDF(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NDF);
  if (!sh) { onOpen(); sh = ss.getSheetByName(SHEET_NDF); }
  const ndfs = data.ndfs || [data];
  const salarie = data.salarie || "";
  const now = new Date().toISOString();
  let saved = 0;
  ndfs.forEach(ndf => {
    const ref = ndf.ref || "";
    if (!ref) return;
    const total = (ndf.lines || []).reduce((s, l) => s + (l.amount || l.deb || 0), 0);
    const rowData = [
      ref, ndf.salarie || salarie, ndf.date || "", ndf.status || "à envoyer",
      ndf.statusDate || "", ndf.paymentDate || "",
      ndf.isPresta ? "TRUE" : "FALSE", ndf.isPresta ? (ndf.salarie || "") : "",
      JSON.stringify(ndf.lines || []), now.split("T")[0],
      data.modifiedBy || salarie, now, total, (ndf.lines || []).length,
      ndf.prestaComment || "", ndf.coordo || data.coordo || ""
    ];
    var allData = sh.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < allData.length; i++) {
      if (allData[i][0] === ref && allData[i][1] === (ndf.salarie || salarie)) {
        sh.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        found = true; break;
      }
    }
    if (!found) {
      // ANTI-DOUBLON: si c'est un ref provisoire (NDF-xxx ou IK-xxx),
      // vérifier qu'il n'existe pas déjà une ligne officielle (N2026-xxx)
      // pour le même salarié avec un statut plus avancé (validée/réglée)
      var dominated = false;
      if (ref.match(/^(NDF|IK)-/)) {
        var ndfSalarie = ndf.salarie || salarie;
        var ndfDate = (ndf.date || "").toString().split("T")[0];
        for (var j = 1; j < allData.length; j++) {
          var existRef = (allData[j][0] || "").toString();
          var existSalarie = (allData[j][1] || "").toString();
          var existDate = (allData[j][2] || "").toString().split("T")[0];
          var existStatus = (allData[j][3] || "").toString();
          if (existRef.match(/^N2026-/) && existSalarie === ndfSalarie && existDate === ndfDate
              && (existStatus === "réglée" || existStatus === "validée")) {
            dominated = true;
            break;
          }
        }
      }
      if (!dominated) {
        sh.appendRow(rowData);
      }
    }
    saved++;
  });
  return { ok: true, saved };
}

function deleteNDF(data) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NDF);
  if (!sh) return { error: "Onglet NDF non trouvé" };
  var ref = data.ref || "";
  var salarie = data.salarie || "";
  if (!ref) return { error: "Ref manquante" };
  var allData = sh.getDataRange().getValues();
  for (var i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === ref && (!salarie || allData[i][1] === salarie)) {
      sh.deleteRow(i + 1);
      // Also try to trash the Drive folder
      try {
        var parentId = "17FGnfAFah1A1vq9XKqx7YzyLWpvmFs4P";
        var parent = DriveApp.getFolderById(parentId);
        var folders = parent.getFoldersByName(ref);
        if (folders.hasNext()) {
          var folder = folders.next();
          folder.setTrashed(true);
        }
      } catch (e) { /* ignore Drive errors */ }
      return { ok: true, deleted: ref };
    }
  }
  return { ok: true, notFound: ref };
}

// Delete NDF from Sheet ONLY (no Drive deletion — used during règlement/renaming)
function deleteNDFSheetOnly(data) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NDF);
  if (!sh) return { error: "Onglet NDF non trouvé" };
  var ref = data.ref || "";
  if (!ref) return { error: "Ref manquante" };
  var allData = sh.getDataRange().getValues();
  for (var i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === ref) {
      sh.deleteRow(i + 1);
      return { ok: true, deleted: ref };
    }
  }
  return { ok: true, notFound: ref };
}

// FIX: updateStatus ne crée JAMAIS de nouvelles lignes — mise à jour uniquement
function updateStatus(data) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NDF);
  if (!sh) return { error: "Onglet NDF non trouvé" };
  const updates = data.updates || [];
  const director = data.director || "Direction";
  let updated = 0, skipped = 0;
  updates.forEach(u => {
    var allData = sh.getDataRange().getValues();
    var found = false;
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] === u.ref) {
        sh.getRange(i + 1, 4).setValue(u.status);
        sh.getRange(i + 1, 5).setValue(u.statusDate);
        sh.getRange(i + 1, 6).setValue(u.paymentDate);
        sh.getRange(i + 1, 11).setValue(director);
        sh.getRange(i + 1, 12).setValue(new Date().toISOString());
        updated++; found = true; break;
      }
    }
    // NE PLUS CRÉER de ligne si non trouvée — évite les doublons fantômes
    if (!found) skipped++;
  });
  return { ok: true, updated, skipped };
}

// ─── GET LAST NDF NUMBER ───
function getLastNDFNumber() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NDF);
  if (!sh) return { lastNumber: 0 };
  var allData = sh.getDataRange().getValues();
  var maxNum = 0;
  for (var i = 1; i < allData.length; i++) {
    var ref = allData[i][0] || "";
    var m = ref.match(/^N2026-(\d+)/);
    if (m) {
      var num = parseInt(m[1]);
      if (num > maxNum) maxNum = num;
    }
  }
  return { lastNumber: maxNum };
}

// ─── CONFIG FUNCTIONS ───
function getConfig(key) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  if (!sh) return { value: null };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return { key, value: data[i][1] };
  }
  return { key, value: null };
}

function setConfig(key, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_CONFIG);
  if (!sh) { onOpen(); sh = ss.getSheetByName(SHEET_CONFIG); }
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      sh.getRange(i + 1, 3).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  sh.appendRow([key, value, new Date().toISOString()]);
  return { ok: true };
}

// ─── CONFIG EN TRANCHES (contournement limite 50 000 caractères par cellule) ───
// Une valeur longue est découpée en tranches de 45 000 caractères :
// baseKey (tranche 0), baseKey_1, baseKey_2..., et baseKey_count = nombre de tranches.
// Rétrocompatible : sans baseKey_count, on lit la cellule unique comme avant.
var META_CHUNK_SIZE = 45000;

function setConfigChunked(baseKey, str) {
  str = str || "";
  var n = Math.max(1, Math.ceil(str.length / META_CHUNK_SIZE));
  for (var i = 0; i < n; i++) {
    var key = i === 0 ? baseKey : baseKey + "_" + i;
    setConfig(key, str.substring(i * META_CHUNK_SIZE, (i + 1) * META_CHUNK_SIZE));
  }
  // Vider les anciennes tranches devenues inutiles
  var j = n;
  while (j < 50 && (getConfig(baseKey + "_" + j).value || "") !== "") {
    setConfig(baseKey + "_" + j, "");
    j++;
  }
  setConfig(baseKey + "_count", String(n));
  return n;
}

function getConfigChunked(baseKey) {
  var count = parseInt(getConfig(baseKey + "_count").value || "1", 10);
  if (isNaN(count) || count < 1) count = 1;
  var s = getConfig(baseKey).value || "";
  for (var i = 1; i < count; i++) {
    s += getConfig(baseKey + "_" + i).value || "";
  }
  return s;
}

// ─── COMPTA FUNCTIONS ───
function getCompta() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_COMPTA);
  if (!sh) return { rows: [] };
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => row[h] = data[i][j]);
    rows.push(row);
  }
  // Also load metadata from Config (recollée depuis les tranches)
  var meta = {};
  try {
    var metaStr = getConfigChunked("compta_meta");
    if (metaStr) meta = JSON.parse(metaStr);
  } catch(e) {}
  return { rows, meta };
}

function saveCompta(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_COMPTA);
  if (!sh) { onOpen(); sh = ss.getSheetByName(SHEET_COMPTA); }
  if (data.rows && data.rows.length) {
    const headers = ["id", "dt", "yr", "lib", "four", "cat", "act", "deb", "cre", "modal", "stat", "resp", "numj", "src", "ndf", "compte", "driveUrl", "comment"];
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
    const rowData = data.rows.map(r => headers.map(h => r[h] !== undefined && r[h] !== null ? r[h] : ""));
    if (rowData.length) sh.getRange(2, 1, rowData.length, headers.length).setValues(rowData);
  }
  // Save metadata (ctr, ndfBuffer, depBuffer, rules, etc.) — en tranches de 45k
  var metaError = "";
  var metaChunks = 0;
  if (data.meta) {
    try {
      metaChunks = setConfigChunked("compta_meta", JSON.stringify(data.meta));
    } catch(e) { metaError = e.message; }
  }
  var result = { ok: true, saved: (data.rows||[]).length, metaChunks: metaChunks, timestamp: new Date().toISOString() };
  if (metaError) result.metaError = "Lignes sauvées mais métadonnées en échec : " + metaError;
  return result;
}

// ─── DEPENSES FUNCTIONS ───
function getDepenses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_DEPENSES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DEPENSES);
    sh.getRange(1, 1, 1, 11).setValues([["date", "mode", "four", "desc", "amount", "code", "projet", "fileName", "driveUrl", "driveFileId", "createdAt"]]);
    sh.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
  }
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    headers.forEach(function(h, j) { row[h] = data[i][j]; });
    rows.push(row);
  }
  return { rows: rows };
}

function saveDepenses(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_DEPENSES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DEPENSES);
    sh.getRange(1, 1, 1, 11).setValues([["date", "mode", "four", "desc", "amount", "code", "projet", "fileName", "driveUrl", "driveFileId", "createdAt"]]);
    sh.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#f3f4f6");
    sh.setFrozenRows(1);
  }
  var rows = data.rows || [];
  if (!rows.length) return { error: "Pas de données" };
  var headers = ["date", "mode", "four", "desc", "amount", "code", "projet", "fileName", "driveUrl", "driveFileId", "createdAt"];
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f4f6");
  sh.setFrozenRows(1);
  var rowData = rows.map(function(r) { return headers.map(function(h) { return r[h] || ""; }); });
  if (rowData.length) sh.getRange(2, 1, rowData.length, headers.length).setValues(rowData);
  return { ok: true, saved: rowData.length };
}

// ─── DRIVE UPLOAD ───
function uploadJustif(data) {
  var folderId = data.folderId || "17FGnfAFah1A1vq9XKqx7YzyLWpvmFs4P";
  var folder = DriveApp.getFolderById(folderId);
  var fileName = data.fileName || "justif.pdf";
  var fileData = data.fileData;
  var ndfRef = data.ndfRef || "";
  var base64 = fileData.replace(/^data:[^;]+;base64,/, "");
  var contentType = fileData.match(/^data:([^;]+);/);
  contentType = contentType ? contentType[1] : "application/octet-stream";
  var targetFolder;
  if (ndfRef) {
    var subFolders = folder.getFoldersByName(ndfRef);
    targetFolder = subFolders.hasNext() ? subFolders.next() : folder.createFolder(ndfRef);
  } else {
    targetFolder = folder;
  }
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), contentType, fileName);
  var file = targetFolder.createFile(blob);
  return { ok: true, fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName };
}

// ─── OCR VIA ANTHROPIC API (CÔTÉ SERVEUR) ───
function ocrJustif(data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) return { error: "Clé API Anthropic non configurée dans les propriétés du script" };

  var fileData = data.fileData || "";
  var fileType = data.fileType || "image/jpeg";
  if (!fileData) return { error: "Pas de fichier" };

  var base64 = fileData.replace(/^data:[^;]+;base64,/, "");
  var contentTypeMatch = fileData.match(/^data:([^;]+);/);
  var mediaType = contentTypeMatch ? contentTypeMatch[1] : fileType;

  var content = [];
  var isImage = mediaType.indexOf("image/") === 0;
  var isPDF = mediaType === "application/pdf";

  if (isImage) {
    if (mediaType === "image/jpg") mediaType = "image/jpeg";
    if (["image/jpeg", "image/png", "image/gif", "image/webp"].indexOf(mediaType) < 0) mediaType = "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
  } else if (isPDF) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
  } else {
    return { error: "Type de fichier non supporté: " + mediaType };
  }

  content.push({
    type: "text",
    text: "Analyse ce justificatif (facture, ticket, reçu). Extrais et réponds UNIQUEMENT avec un objet JSON:\n{\"date\":\"YYYY-MM-DD\",\"montant\":12.50,\"fournisseur\":\"Nom\",\"description\":\"Objet de la dépense\"}\nRègles: date au format ISO, montant en nombre décimal, fournisseur = nom de l'enseigne/société. Si une info est illisible ou absente, mettre null."
  });

  try {
    var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      payload: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: content }] }),
      muteHttpExceptions: true
    });

    var respCode = response.getResponseCode();
    var respBody = response.getContentText();
    if (respCode !== 200) return { error: "API Anthropic HTTP " + respCode + ": " + respBody.substring(0, 200) };

    var respData = JSON.parse(respBody);
    var text = "";
    (respData.content || []).forEach(function(c) { if (c.text) text += c.text; });

    var jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "Pas de JSON dans la réponse", raw: text.substring(0, 200) };

    var parsed = JSON.parse(jsonMatch[0].replace(/```json|```/g, "").trim());
    return { ok: true, data: parsed };
  } catch (e) {
    return { error: "OCR error: " + e.message };
  }
}

// ─── RENAME DRIVE FOLDER ───
function renameDriveFolder(data) {
  var parentFolderId = data.parentFolderId || "17FGnfAFah1A1vq9XKqx7YzyLWpvmFs4P";
  var oldName = data.oldName || "";
  var newName = data.newName || "";
  if (!oldName || !newName) return { error: "oldName et newName requis" };
  try {
    var parent = DriveApp.getFolderById(parentFolderId);
    // Try folders first
    var folders = parent.getFoldersByName(oldName);
    if (folders.hasNext()) {
      var folder = folders.next();
      folder.setName(newName);
      return { ok: true, renamed: true, type: "folder", oldName: oldName, newName: newName, id: folder.getId() };
    }
    // Then try files (for renaming justificatifs)
    var files = parent.getFilesByName(oldName);
    if (files.hasNext()) {
      var file = files.next();
      file.setName(newName);
      return { ok: true, renamed: true, type: "file", oldName: oldName, newName: newName, id: file.getId() };
    }
    // Also search recursively in subfolders (1 level deep)
    var subFolders = parent.getFolders();
    while (subFolders.hasNext()) {
      var sub = subFolders.next();
      var subFiles = sub.getFilesByName(oldName);
      if (subFiles.hasNext()) {
        var sf = subFiles.next();
        sf.setName(newName);
        return { ok: true, renamed: true, type: "file-in-subfolder", oldName: oldName, newName: newName, id: sf.getId(), folder: sub.getName() };
      }
    }
    return { ok: true, notFound: oldName, message: "Ni dossier ni fichier trouvé" };
  } catch (e) {
    return { error: "Erreur renommage: " + e.message };
  }
}

// ─── CODES COMPTA (cats, acts, rules) ───
function getCodesCompta() {
  var catsStr = getConfig("compta_cats");
  var actsStr = getConfig("compta_acts");
  var rulesStr = getConfig("compta_rules");
  return {
    cats: catsStr.value ? JSON.parse(catsStr.value) : null,
    acts: actsStr.value ? JSON.parse(actsStr.value) : null,
    rules: rulesStr.value ? JSON.parse(rulesStr.value) : null
  };
}

function setCodesCompta(data) {
  var now = new Date().toISOString();
  if (data.cats) setConfig("compta_cats", JSON.stringify(data.cats));
  if (data.acts) setConfig("compta_acts", JSON.stringify(data.acts));
  if (data.rules) setConfig("compta_rules", JSON.stringify(data.rules));
  return { ok: true, saved: true };
}

// ─── DELETE DRIVE FILE ───
function deleteDriveFile(data) {
  var fileId = data.fileId;
  if (!fileId) return { error: "fileId requis" };
  try {
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return { ok: true, deleted: fileId };
  } catch (e) {
    return { error: "Erreur suppression: " + e.message };
  }
}

// ─── SYNC AIRTABLE (codes projets + subventions + prestas) ───
// Jeton en LECTURE SEULE à créer sur https://airtable.com/create/tokens
// (scope data.records:read, accès à la base "Bases de données Lit uP"),
// puis à coller dans Apps Script → ⚙️ Paramètres du projet → Propriétés du script → AIRTABLE_TOKEN
var AIRTABLE_BASE_ID = "appWof91rLGFIUnrT";
var AIRTABLE_TBL_SUBS = "tbl580knux5PUZxfm";      // 3.2 Suivi subventions
var AIRTABLE_TBL_PRESTAS = "tblUC6S6JiCDNJI2G";   // 3.4 Suivi prestas commanditaires
var AIRTABLE_TBL_PARCOURS = "tbl7jv5UM8DPR5Sa6";  // 4. Parcours (codes projets)
var AIRTABLE_TBL_ORGS = "tblN4fV5i1qwaHdf6";      // 3. Organisation partenaire (Nom + Code compta)

// Champs de 3.2 Suivi subventions (IDs : robustes aux renommages de colonnes)
var F_SUB = {
  nom:"fldvKNv0sBS4gcjzM", statut:"fld8NUVDHdpxxD39D",
  attendu:"fldH0o0d0M6RJOLI8", obtenu:"fld4PNd9jzYPEBkF5",
  dateEff:"fldz716nw2nEA9i2A", datePrev:"fldWCT3DtpCBBaNdU",
  debut:"fldOK6lBHBIOSUnZD", fin:"fldEV5mmuNomjh4Rj",
  territoire:"fldLEW5bfpOn5mxdp", typeFin:"fldUXkQuUXi9rEREh",
  codeCompta:"fldSN87ivIU0Vknp0"   // Code compta remonté depuis 3.1 Suivi financeurs
};
// Champs de 3.4 Suivi prestas commanditaires
var F_PRE = {
  nom:"fldkeT3JHmpS9Wum6", statut:"fldXh0tmWYWlqneWX",
  attendu:"fldwuuyWfxDFCyWvs", obtenu:"fldTjTLSykvDxlvsp",
  annee:"fld5RGANZhNvywSy1", datePrev:"fldDecTkWmfCLEyMX",
  dateEff:"fldoB7E6LNUstTtPU", virement:"fldrH5eQmwRlTqfob",
  categorieRecette:"fldmBaEZ4ytmu9nMI"   // Non lucratif / Lucratif
};
// Catégorie Recette → compte comptable (règle Lit uP)
var CAT_RECETTE_COMPTE = { "non lucratif":"70600000", "lucratif":"70601000" };

function airtableFetchAll(tableId, fields, byId) {
  var token = PropertiesService.getScriptProperties().getProperty("AIRTABLE_TOKEN");
  if (!token) throw new Error("AIRTABLE_TOKEN non configuré dans les propriétés du script");
  var records = [];
  var offset = "";
  do {
    var url = "https://api.airtable.com/v0/" + AIRTABLE_BASE_ID + "/" + tableId + "?pageSize=100"
      + (byId ? "&returnFieldsByFieldId=true" : "")
      + fields.map(function(f) { return "&fields%5B%5D=" + encodeURIComponent(f); }).join("")
      + (offset ? "&offset=" + encodeURIComponent(offset) : "");
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      throw new Error("Airtable HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 200));
    }
    var data = JSON.parse(resp.getContentText());
    records = records.concat(data.records || []);
    offset = data.offset || "";
  } while (offset);
  return records;
}

// "1_Préfecture de Paris_PUB" → "Préfecture de Paris 1"
function airtableCleanName(raw) {
  var s = String(raw || "").replace(/\s+/g, " ").trim();
  s = s.replace(/_(PUB|PRIV|MLDS|E2C|Mission Locale|Autres)"?$/, "").replace(/^"|"$/g, "");
  var m = s.match(/^([\d.]*)_(.*)$/);
  if (m) return (m[2].trim() + (m[1] ? " " + m[1] : "")).trim();
  return s;
}

// Lookups Airtable : les valeurs arrivent en tableau
function airtableFirst(v) { return Array.isArray(v) ? (v.length ? v[0] : "") : (v || ""); }
function airtableJoin(v) { return Array.isArray(v) ? v.filter(function(x) { return x; }).join(", ") : (v || ""); }
// Année d'affectation : déduite de la période de financement.
// Convention Lit uP : une fin au 1er janvier borne l'exercice précédent
// (01/01/2025 → 01/01/2026 = subvention de l'exercice 2025).
function airtableYearEnd(df) {
  var s = String(df || "").substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  var parts = s.split("-");
  if (parts[1] === "01" && parts[2] === "01") return String(parseInt(parts[0], 10) - 1);
  return parts[0];
}
// Montant retenu : obtenu pour un financement acquis (validé / versé / engagé), attendu sinon
function airtableAmount(statut, obtenu, attendu) {
  var acquis = ["versée", "validée", "payé", "facturé", "signé"].indexOf(statut) >= 0;
  var hasOb = obtenu !== undefined && obtenu !== null && obtenu !== "";
  var hasMt = attendu !== undefined && attendu !== null && attendu !== "";
  if (acquis) return hasOb ? obtenu : (hasMt ? attendu : 0);
  return hasMt ? attendu : (hasOb ? obtenu : 0);
}

function getAirtableData() {
  // Comptes comptables saisis dans Airtable (3. Organisation partenaire → Code compta).
  // Ce sont eux qui font référence : ils prennent le pas sur les codes mémorisés dans l'outil.
  var orgCodes = {};
  airtableFetchAll(AIRTABLE_TBL_ORGS, ["Nom", "Code compta"]).forEach(function(r) {
    var f = r.fields || {};
    if (f["Nom"] && f["Code compta"]) orgCodes[String(f["Nom"]).trim().toLowerCase()] = String(f["Code compta"]).trim();
  });
  var orgKeys = Object.keys(orgCodes);
  // Résolution par nom exact (financeur) puis par inclusion (libellé de la ligne)
  function codeFor(names, label) {
    var list = String(names || "").split(",");
    for (var i = 0; i < list.length; i++) {
      var k = list[i].trim().toLowerCase();
      if (k && orgCodes[k]) return orgCodes[k];
    }
    var lab = String(label || "").toLowerCase();
    for (var j = 0; j < orgKeys.length; j++) {
      if (orgKeys[j].length > 3 && lab.indexOf(orgKeys[j]) >= 0) return orgCodes[orgKeys[j]];
    }
    return "";
  }
  var mapSub = {
    "validée et versée": "versée",
    "validée et non versée": "validée",
    "attente retour dépôt dossier": "sollicitée",
    "prévue mais non validée": "attente",
    "Renouvellement - dossier à déposer": "attente"
  };
  // Subventions (3.2) — les refus sont exclus
  var subFields = [];
  for (var kf in F_SUB) subFields.push(F_SUB[kf]);
  var subs = airtableFetchAll(AIRTABLE_TBL_SUBS, subFields, true)
    .map(function(r) {
      var f = r.fields || {};
      var st = String(airtableFirst(f[F_SUB.statut]) || "");
      // Les refus ne sont jamais remontés
      if (/refus/i.test(st) || !f[F_SUB.nom]) return null;
      var s = mapSub[st] || st || "attente";
      var nom = String(f[F_SUB.nom]);
      var o = { n: airtableCleanName(nom), s: s, mt: f[F_SUB.attendu] || 0 };
      if (f[F_SUB.obtenu] !== undefined) o.ob = f[F_SUB.obtenu];
      // Type de financeur : champ Airtable dédié, sinon suffixe du nom
      var tf = airtableFirst(f[F_SUB.typeFin]);
      var km = nom.match(/_(PUB|PRIV)"?\s*$/);
      if (tf) o.k = String(tf).toUpperCase(); else if (km) o.k = km[1];
      // Dates de versement : prévue et effective conservées séparément
      if (f[F_SUB.datePrev]) o.dpv = f[F_SUB.datePrev];
      if (f[F_SUB.dateEff]) o.dev = f[F_SUB.dateEff];
      o.dp = o.dev || o.dpv || "";
      var terr = airtableFirst(f[F_SUB.territoire]);
      if (terr) o.t = terr;
      // Période de financement Airtable → année d'affectation
      if (f[F_SUB.debut]) o.db = f[F_SUB.debut];
      if (f[F_SUB.fin]) o.df = f[F_SUB.fin];
      if (o.db) {
        o.yr = String(o.db).substring(0, 4);            // année de début de financement
        o.yre = airtableYearEnd(o.df) || o.yr;          // année de fin (1er janvier = exercice précédent)
      } else if (o.dp) {
        o.yr = String(o.dp).substring(0, 4);
      }
      // Montant retenu : obtenu si la subvention est validée, attendu sinon
      o.am = airtableAmount(s, o.ob, o.mt);
      // Compte comptable : celui d'Airtable (3.1 Suivi financeurs) fait référence
      var cc = String(airtableFirst(f[F_SUB.codeCompta]) || "").trim() || codeFor("", nom);
      if (cc) o.ccAt = cc;
      return o;
    }).filter(function(x) { return x; });

  // Prestas (3.4)
  var preFields = [];
  for (var kp in F_PRE) preFields.push(F_PRE[kp]);
  var prestas = airtableFetchAll(AIRTABLE_TBL_PRESTAS, preFields, true)
    .map(function(r) {
      var f = r.fields || {};
      if (!f[F_PRE.nom]) return null;
      var st = String(airtableFirst(f[F_PRE.statut]) || "");
      var s = f[F_PRE.virement] ? "payé"
        : st.indexOf("1.") === 0 ? "négo"
        : st.indexOf("2.") === 0 ? "signé"
        : st.indexOf("3.") === 0 ? "signé"
        : st.indexOf("4.") === 0 ? "facturé"
        : st.indexOf("5.") === 0 ? "facturé"
        : st.indexOf("6.") === 0 ? "payé"
        : "négo";
      var nomP = String(f[F_PRE.nom]);
      var o = { n: airtableCleanName(nomP), s: s, mt: f[F_PRE.attendu] || 0 };
      if (f[F_PRE.obtenu] !== undefined) o.ob = f[F_PRE.obtenu];
      if (f[F_PRE.datePrev]) o.dpv = f[F_PRE.datePrev];
      if (f[F_PRE.dateEff]) o.dev = f[F_PRE.dateEff];
      o.dp = o.dev || o.dpv || "";
      var an = airtableFirst(f[F_PRE.annee]);
      if (an) o.yr = String(an);
      else if (o.dp) o.yr = String(o.dp).substring(0, 4);
      o.am = airtableAmount(s, o.ob, o.mt);
      // Catégorie Recette Airtable → compte comptable
      // Non lucratif = 70600000 · Lucratif = 70601000
      var cr = String(airtableFirst(f[F_PRE.categorieRecette]) || "").trim();
      if (cr) o.cr = cr;
      var ccp = CAT_RECETTE_COMPTE[cr.toLowerCase()] || codeFor("", nomP);
      if (ccp) o.ccAt = ccp;
      return o;
    }).filter(function(x) { return x; });

  // Codes projets (4. Parcours) : label "BU92 - MLDS - Hyères 3" + territoire
  var acts = airtableFetchAll(AIRTABLE_TBL_PARCOURS, ["Parcours", "Territoire_texte"])
    .map(function(r) {
      var f = r.fields || {};
      var l = String(f["Parcours"] || "").replace(/\s+/g, " ").trim();
      if (!l) return null;
      return { l: l, t: String(f["Territoire_texte"] || "NAT").trim() || "NAT" };
    }).filter(function(x) { return x; });

  return { ok: true, subs: subs, prestas: prestas, acts: acts,
           orgCodes: orgCodes, orgCodesCount: orgKeys.length,
           syncedAt: new Date().toISOString() };
}

// ─── GENERATE NDF PDF RECAP ───
function generateNDFPDF(data) {
  var ref = data.ref || "";
  var salarie = data.salarie || "";
  var date = (data.date || "").split("T")[0];
  var lines = data.lines || [];
  var status = data.status || "réglée";
  var paymentDate = (data.paymentDate || "").split("T")[0];
  var validationDate = (data.statusDate || "").split("T")[0];
  var director = data.director || "Direction";
  var isPresta = data.isPresta || false;
  var comment = data.prestaComment || "";
  
  if (!ref || !salarie) return { error: "Ref et salarie requis" };
  
  var total = 0;
  lines.forEach(function(l) { total += (l.amount || 0); });
  
  // Check if there are IK lines and get CV
  var hasIK = false;
  var cvValue = "";
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].type === "ik") { hasIK = true; cvValue = lines[i].cv || ""; break; }
  }
  
  // Build simple HTML for PDF conversion
  var rows = "";
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var type = l.type === "ik" ? "IK" : "Dépense";
    var amt = (l.amount || 0).toFixed(2).replace(".", ",");
    var d = (l.date || "").split("T")[0];
    var km = l.type === "ik" && l.km ? " (" + l.km + " km)" : "";
    var justif = l.fileName ? l.fileName : "<i style='color:#888'>Ce récapitulatif tient lieu de justificatif</i>";
    rows += "<tr><td>" + (i+1) + "</td><td>" + d + "</td><td>" + type + "</td><td>" + (l.desc || "") + km + "</td><td>" + (l.four || "") + "</td><td style='text-align:right'>" + amt + " EUR</td><td>" + (l.code || "") + "</td><td>" + justif + "</td></tr>";
  }
  
  var commentHtml = comment ? "<p style='background:#fffbeb;padding:8px;border:1px solid #fde68a;border-radius:4px;font-size:10px'><b>Commentaire :</b> " + comment + "</p>" : "";
  
  var html = "<html><head><style>"
    + "body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#333;margin:30px}"
    + "h1{font-size:16px;color:#00989D;margin-bottom:2px}"
    + "h2{font-size:12px;color:#666;margin-top:0;font-weight:normal}"
    + ".info{margin:12px 0;padding:10px;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:4px;font-size:10px}"
    + "table{width:100%;border-collapse:collapse;margin-top:10px;font-size:9px}"
    + "th{background:#00989D;color:white;padding:4px 6px;text-align:left}"
    + "td{padding:3px 6px;border-bottom:1px solid #eee}"
    + ".total{font-size:13px;font-weight:bold;text-align:right;margin-top:8px;color:#00989D}"
    + ".footer{margin-top:20px;padding-top:8px;border-top:1px solid #ddd;font-size:8px;color:#999}"
    + "</style></head><body>"
    + "<h1>Note de Frais " + ref + "</h1>"
    + "<h2>" + salarie + (isPresta ? " (Prestataire)" : "") + "</h2>"
    + "<div class='info'>"
    + "<b>Date :</b> " + date + " | "
    + "<b>Lignes :</b> " + lines.length + " | "
    + "<b>Total TTC :</b> " + total.toFixed(2).replace(".",",") + " EUR | "
    + "<b>Statut :</b> " + status
    + (paymentDate ? " | <b>Réglée le :</b> " + paymentDate : "")
    + "</div>"
    + (hasIK ? "<div class='info' style='margin-top:6px'><b>Indemnités kilométriques :</b> barème fiscal " + (cvValue || "?") + " CV</div>" : "")
    + commentHtml
    + "<table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th>Fournisseur</th><th style='text-align:right'>Montant</th><th>Code projet</th><th>Justificatif</th></tr></thead><tbody>"
    + rows
    + "</tbody></table>"
    + "<div class='total'>Total : " + total.toFixed(2).replace(".",",") + " EUR</div>"
    + "<div class='footer'>Valide par " + director + (validationDate ? " le " + validationDate : "") + " | Genere le " + new Date().toISOString().split("T")[0] + " | Lit uP - Association loi 1901 - SIRET 903 045 987 00018</div>"
    + "</body></html>";
  
  var blob = HtmlService.createHtmlOutput(html).getBlob().setName(ref + "_recap.pdf").getAs("application/pdf");
  
  // Find or create the NDF folder
  var parentId = "17FGnfAFah1A1vq9XKqx7YzyLWpvmFs4P";
  var parent = DriveApp.getFolderById(parentId);
  var folders = parent.getFoldersByName(ref);
  var folder = folders.hasNext() ? folders.next() : parent.createFolder(ref);
  
  // Delete existing recap
  var existing = folder.getFilesByName(ref + "_recap.pdf");
  while (existing.hasNext()) existing.next().setTrashed(true);
  
  var file = folder.createFile(blob);
  return { ok: true, fileId: file.getId(), fileUrl: file.getUrl(), fileName: ref + "_recap.pdf" };
}

// ─── TEST FUNCTIONS ───
function testUpload() {
  var result = uploadJustif({ ndfRef: "TEST6", fileName: "test.txt", fileData: "data:text/plain;base64,SGVsbG8gTGl0IHVQ" });
  Logger.log(JSON.stringify(result));
}

function testOCR() {
  var result = ocrJustif({ fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5CYII=", fileType: "image/png" });
  Logger.log(JSON.stringify(result));
}

function forceDriveAuth() {
  var folder = DriveApp.getFolderById("17FGnfAFah1A1vq9XKqx7YzyLWpvmFs4P");
  Logger.log("Folder name: " + folder.getName());
}

// ─── TEST : vérifier l'écriture meta en tranches ───
function testMetaChunked() {
  var big = "";
  for (var i = 0; i < 60000; i++) big += "x";
  var n = setConfigChunked("test_meta", big);
  var back = getConfigChunked("test_meta");
  Logger.log("Tranches écrites : " + n + " | Relu identique : " + (back === big) + " (" + back.length + " caractères)");
}

// ─── TEST : vérifier la sync Airtable ───
function testAirtable() {
  var r = getAirtableData();
  var withCode = (r.subs || []).filter(function(s) { return s.ccAt; }).length
               + (r.prestas || []).filter(function(p) { return p.ccAt; }).length;
  Logger.log("Financements avec compte comptable Airtable : " + withCode);
  Logger.log((r.subs ? r.subs.length : 0) + " subventions | " + (r.prestas ? r.prestas.length : 0) + " prestas | " + (r.acts ? r.acts.length : 0) + " codes projets");
  Logger.log("Exemple sub : " + JSON.stringify((r.subs || [])[0]));
  Logger.log("Exemple code : " + JSON.stringify((r.acts || [])[0]));
}
