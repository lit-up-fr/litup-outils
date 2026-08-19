/**
 * notifications.gs — Notification email quand une NDF est envoyée à la direction
 *
 * FICHIER AUTONOME : à ajouter comme NOUVEAU fichier dans le projet Apps Script
 * existant (celui lié au Sheet NDF/Compta). Ne modifie AUCUN code existant.
 *
 * Installation (une seule fois) :
 *   1. Ouvrir le projet Apps Script (Extensions → Apps Script depuis le Sheet)
 *   2. Fichier + → Script → nommer "notifications" → coller tout ce fichier
 *   3. Dans la barre d'outils, sélectionner la fonction installerDeclencheurNDF
 *      puis cliquer Exécuter (autoriser l'accès à la première exécution)
 *   4. C'est tout. PAS besoin de redéployer le web app : les déclencheurs
 *      utilisent toujours la dernière version enregistrée du code.
 *
 * Fonctionnement :
 *   - Toutes les 5 minutes, checkNDFEnvoyees() lit l'onglet NDF
 *   - Toute NDF au statut "envoyée" pas encore notifiée déclenche un email
 *     à NOTIF_EMAIL (groupé si plusieurs nouvelles NDF)
 *   - Quand le statut change (validée/refusée/réglée/brouillon), la NDF sort
 *     de la liste des notifiées : une NDF refusée puis RENVOYÉE re-notifie
 *   - À l'installation, les NDF déjà "envoyée" sont marquées comme connues
 *     (pas de rafale d'emails sur l'existant)
 */

const NOTIF_EMAIL = "laetitia.deborde@lit-up.fr";
const NOTIF_SHEET_ID = "1YkW_vcIdh9BKxQ7vRYMOW4DTj0U1OLCuHVRIyouyGR8";
const NOTIF_TAB = "NDF";
const NOTIF_PROP_KEY = "NDF_NOTIFIED_REFS";
const NOTIF_APP_URL = "https://lit-up-fr.github.io/litup-outils/litup_ndf_direction.html";

/** À exécuter UNE FOIS manuellement pour installer le déclencheur 5 min. */
function installerDeclencheurNDF() {
  // supprimer les déclencheurs existants de cette fonction (évite les doublons)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "checkNDFEnvoyees") ScriptApp.deleteTrigger(t);
  });
  // marquer les NDF actuellement "envoyée" comme déjà connues
  var envoyees = lireNDFEnvoyees_().map(function (n) { return n.ref; });
  PropertiesService.getScriptProperties().setProperty(NOTIF_PROP_KEY, JSON.stringify(envoyees));
  ScriptApp.newTrigger("checkNDFEnvoyees").timeBased().everyMinutes(5).create();
  Logger.log("Déclencheur installé. NDF déjà envoyées (non notifiées) : " + (envoyees.join(", ") || "aucune"));
}

/** Exécutée automatiquement toutes les 5 minutes par le déclencheur. */
function checkNDFEnvoyees() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // une exécution à la fois
  try {
    var props = PropertiesService.getScriptProperties();
    var notified = JSON.parse(props.getProperty(NOTIF_PROP_KEY) || "[]");
    var notifiedSet = {};
    notified.forEach(function (r) { notifiedSet[r] = true; });

    var envoyees = lireNDFEnvoyees_();
    var envoyeesSet = {};
    envoyees.forEach(function (n) { envoyeesSet[n.ref] = true; });

    // nouvelles NDF envoyées → à notifier
    var nouvelles = envoyees.filter(function (n) { return !notifiedSet[n.ref]; });

    // la liste des notifiées ne garde que les NDF ENCORE au statut envoyée :
    // une NDF refusée qui repasse brouillon puis est renvoyée re-notifiera
    var updated = envoyees.map(function (n) { return n.ref; });
    props.setProperty(NOTIF_PROP_KEY, JSON.stringify(updated));

    if (nouvelles.length) envoyerEmailNDF_(nouvelles, envoyees.length);
  } finally {
    lock.releaseLock();
  }
}

/** Lit l'onglet NDF et retourne les NDF au statut "envoyée". */
function lireNDFEnvoyees_() {
  var sh = SpreadsheetApp.openById(NOTIF_SHEET_ID).getSheetByName(NOTIF_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getDataRange().getValues();
  var head = data[0].map(function (h) { return String(h).trim(); });
  var col = {};
  ["ref", "salarie", "status", "statusDate", "isPresta", "prestaName", "total", "nbLines", "coordo"].forEach(function (k) {
    col[k] = head.indexOf(k);
  });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][col.status] || "").trim().toLowerCase();
    var ref = String(data[r][col.ref] || "").trim();
    if (!ref || status !== "envoyée") continue;
    out.push({
      ref: ref,
      salarie: String(data[r][col.salarie] || ""),
      prestaName: String(data[r][col.prestaName] || ""),
      isPresta: String(data[r][col.isPresta]).toUpperCase() === "TRUE",
      total: String(data[r][col.total] || "?"),
      nbLines: String(data[r][col.nbLines] || "?"),
      statusDate: formatDate_(data[r][col.statusDate]),
      coordo: String(data[r][col.coordo] || "")
    });
  }
  return out;
}

/** Envoie l'email récapitulatif des nouvelles NDF envoyées. */
function envoyerEmailNDF_(nouvelles, totalEnAttente) {
  var sujet = nouvelles.length === 1
    ? "📨 NDF à revoir : " + nouvelles[0].ref + " (" + nomNDF_(nouvelles[0]) + ") · " + nouvelles[0].total + " €"
    : "📨 " + nouvelles.length + " NDF à revoir";

  var lignes = nouvelles.map(function (n) {
    return "• " + n.ref + " — " + nomNDF_(n) + (n.isPresta ? " (prestataire)" : "")
      + " — " + n.total + " € (" + n.nbLines + " ligne(s))"
      + (n.statusDate ? " — envoyée le " + n.statusDate : "")
      + (n.coordo ? " — coordo : " + n.coordo : "");
  });

  var corps =
    "Bonjour,\n\n"
    + (nouvelles.length === 1 ? "Une nouvelle note de frais attend ta validation :\n\n" : "De nouvelles notes de frais attendent ta validation :\n\n")
    + lignes.join("\n") + "\n\n"
    + "Total en attente de revue : " + totalEnAttente + " NDF\n\n"
    + "Ouvrir l'outil direction :\n" + NOTIF_APP_URL + "\n";

  MailApp.sendEmail({ to: NOTIF_EMAIL, subject: sujet, body: corps });
}

function nomNDF_(n) {
  return n.isPresta && n.prestaName ? n.prestaName : (n.salarie || "?");
}

function formatDate_(v) {
  if (!v) return "";
  try {
    var d = (v instanceof Date) ? v : new Date(String(v).split("T")[0]);
    if (isNaN(d.getTime())) return String(v).split("T")[0];
    return Utilities.formatDate(d, "Europe/Paris", "dd/MM/yyyy");
  } catch (e) { return ""; }
}

/** Test manuel : force un email avec les NDF actuellement envoyées. */
function testNotificationNDF() {
  var envoyees = lireNDFEnvoyees_();
  if (!envoyees.length) {
    MailApp.sendEmail({ to: NOTIF_EMAIL, subject: "✅ Test notifications NDF", body: "Le script fonctionne. Aucune NDF au statut envoyée actuellement." });
  } else {
    envoyerEmailNDF_(envoyees, envoyees.length);
  }
  Logger.log("Email de test envoyé à " + NOTIF_EMAIL);
}
