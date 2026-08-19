/**
 * notifications.gs — Notifications email du workflow NDF
 *
 * FICHIER AUTONOME : à ajouter comme NOUVEAU fichier dans le projet Apps Script
 * existant (celui lié au Sheet NDF/Compta). Ne modifie AUCUN code existant.
 * Si la v1 de ce fichier est déjà installée : remplacer tout son contenu par
 * celui-ci puis ré-exécuter installerDeclencheurNDF (l'ancien déclencheur est
 * remplacé proprement).
 *
 * Installation (une seule fois) :
 *   1. Ouvrir le projet Apps Script (Extensions → Apps Script depuis le Sheet)
 *   2. Fichier + → Script → nommer "notifications" → coller tout ce fichier
 *   3. Sélectionner la fonction installerDeclencheurNDF puis cliquer Exécuter
 *      (autoriser l'accès à la première exécution)
 *   4. PAS besoin de redéployer le web app : les déclencheurs utilisent
 *      toujours la dernière version enregistrée du code.
 *
 * Emails des salariés/prestataires (pour les notifications validée/refusée/réglée) :
 *   Ajouter une ligne dans l'onglet Config du Sheet :
 *     key   = notif_emails
 *     value = une ligne par personne, au format "Nom complet : email", ex :
 *             Céline Qi Objois : celine@lit-up.fr
 *             Laura Ait Chikh : laura@lit-up.fr
 *   Le nom doit correspondre à la colonne "salarie" de l'onglet NDF
 *   (la casse et les accents sont ignorés). Sans email trouvé, la personne
 *   n'est simplement pas notifiée (aucune erreur).
 *
 * Notifications envoyées :
 *   - NDF passe à "envoyée"  → email à la direction (groupé si plusieurs)
 *   - NDF passe à "validée"  → email au salarié (remboursement à venir)
 *   - NDF passe à "refusée"  → email au salarié (motif à consulter dans l'outil)
 *   - NDF passe à "réglée"   → email au salarié (montant + date de règlement)
 *   - Lundi matin : rappel à la direction si des NDF attendent depuis > 3 jours
 *
 * Le suivi se fait par transitions d'état : une NDF refusée puis renvoyée
 * re-notifie la direction ; le renommage de référence à la validation et au
 * règlement (nouvelle ligne Sheet) est traité comme une transition normale.
 * À l'installation, l'état courant est mémorisé sans envoyer d'email.
 */

var NOTIF_EMAIL_DIRECTION = "laetitia.deborde@lit-up.fr";
var NOTIF_SHEET_ID = "1YkW_vcIdh9BKxQ7vRYMOW4DTj0U1OLCuHVRIyouyGR8";
var NOTIF_TAB_NDF = "NDF";
var NOTIF_TAB_CONFIG = "Config";
var NOTIF_PROP_KEY = "NDF_STATUS_MAP";
var NOTIF_URL_DIRECTION = "https://lit-up-fr.github.io/litup-outils/litup_ndf_direction.html";
var NOTIF_URL_ACCUEIL = "https://lit-up-fr.github.io/litup-outils/";
var NOTIF_RAPPEL_JOURS = 3; // rappel hebdo : NDF en attente depuis plus de N jours

/** À exécuter UNE FOIS manuellement pour installer les déclencheurs. */
function installerDeclencheurNDF() {
  // supprimer les déclencheurs existants de ce module (évite les doublons, v1 incluse)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === "checkNotificationsNDF" || fn === "checkNDFEnvoyees" || fn === "rappelHebdoNDF") {
      ScriptApp.deleteTrigger(t);
    }
  });
  // mémoriser l'état actuel sans notifier (pas de rafale d'emails sur l'existant)
  var map = {};
  lireNDF_().forEach(function (n) { map[n.ref] = n.status; });
  var props = PropertiesService.getScriptProperties();
  props.setProperty(NOTIF_PROP_KEY, JSON.stringify(map));
  props.deleteProperty("NDF_NOTIFIED_REFS"); // nettoyage v1
  ScriptApp.newTrigger("checkNotificationsNDF").timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger("rappelHebdoNDF").timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone("Europe/Paris").create();
  Logger.log("Déclencheurs installés (check 5 min + rappel lundi 9h). NDF suivies : " + Object.keys(map).length);
}

/** Exécutée toutes les 5 minutes : détecte les transitions de statut et notifie. */
function checkNotificationsNDF() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // une exécution à la fois
  try {
    var props = PropertiesService.getScriptProperties();
    var prev = JSON.parse(props.getProperty(NOTIF_PROP_KEY) || "{}");
    var ndfs = lireNDF_();

    var pourDirection = [];           // nouvelles NDF envoyées
    var pourSalaries = {};            // email → [{ndf, event}]
    var emails = lireEmailsSalaries_();
    var next = {};

    ndfs.forEach(function (n) {
      next[n.ref] = n.status;
      var avant = prev[n.ref]; // undefined si référence nouvelle
      if (avant === n.status) return; // pas de changement
      if (n.status === "envoyée") {
        pourDirection.push(n);
      } else if (n.status === "validée" || n.status === "refusée" || n.status === "réglée") {
        var email = emails[normaliserNom_(nomNDF_(n))];
        if (email) {
          if (!pourSalaries[email]) pourSalaries[email] = [];
          pourSalaries[email].push(n);
        } else {
          Logger.log("Pas d'email Config pour « " + nomNDF_(n) + " » (NDF " + n.ref + ", " + n.status + ") — non notifié");
        }
      }
      // brouillon : rien (retour après refus, notifié au renvoi)
    });

    props.setProperty(NOTIF_PROP_KEY, JSON.stringify(next)); // les refs disparues sortent du suivi

    if (pourDirection.length) {
      var enAttente = ndfs.filter(function (n) { return n.status === "envoyée"; }).length;
      envoyerEmailDirection_(pourDirection, enAttente);
    }
    for (var email in pourSalaries) envoyerEmailSalarie_(email, pourSalaries[email]);
  } finally {
    lock.releaseLock();
  }
}

/** Lundi 9h : rappel à la direction si des NDF attendent depuis > NOTIF_RAPPEL_JOURS jours. */
function rappelHebdoNDF() {
  var limite = new Date(Date.now() - NOTIF_RAPPEL_JOURS * 24 * 3600 * 1000);
  var enRetard = lireNDF_().filter(function (n) {
    if (n.status !== "envoyée") return false;
    var d = parseDate_(n.statusDate);
    return !d || d < limite; // date illisible = on rappelle quand même
  });
  if (!enRetard.length) return;
  var lignes = enRetard.map(function (n) {
    return "• " + n.ref + " — " + nomNDF_(n) + " — " + n.total + " €"
      + (n.statusDate ? " — envoyée le " + formatDate_(n.statusDate) : "");
  });
  MailApp.sendEmail({
    to: NOTIF_EMAIL_DIRECTION,
    subject: "⏰ Rappel : " + enRetard.length + " NDF en attente de revue depuis plus de " + NOTIF_RAPPEL_JOURS + " jours",
    body: "Bonjour,\n\nCes notes de frais attendent toujours une revue :\n\n"
      + lignes.join("\n") + "\n\nOuvrir l'outil direction :\n" + NOTIF_URL_DIRECTION + "\n"
  });
}

/** Lit l'onglet NDF : toutes les lignes avec leur statut. */
function lireNDF_() {
  var sh = SpreadsheetApp.openById(NOTIF_SHEET_ID).getSheetByName(NOTIF_TAB_NDF);
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getDataRange().getValues();
  var head = data[0].map(function (h) { return String(h).trim(); });
  var col = {};
  ["ref", "salarie", "status", "statusDate", "paymentDate", "isPresta", "prestaName", "total", "nbLines", "coordo"]
    .forEach(function (k) { col[k] = head.indexOf(k); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var ref = String(data[r][col.ref] || "").trim();
    if (!ref) continue;
    out.push({
      ref: ref,
      salarie: String(data[r][col.salarie] || ""),
      status: String(data[r][col.status] || "").trim().toLowerCase(),
      statusDate: data[r][col.statusDate],
      paymentDate: data[r][col.paymentDate],
      isPresta: String(data[r][col.isPresta]).toUpperCase() === "TRUE",
      prestaName: String(data[r][col.prestaName] || ""),
      total: String(data[r][col.total] || "?"),
      nbLines: String(data[r][col.nbLines] || "?"),
      coordo: String(data[r][col.coordo] || "")
    });
  }
  return out;
}

/** Lit la ligne notif_emails de l'onglet Config → { nom normalisé : email }. */
function lireEmailsSalaries_() {
  var out = {};
  var sh = SpreadsheetApp.openById(NOTIF_SHEET_ID).getSheetByName(NOTIF_TAB_CONFIG);
  if (!sh || sh.getLastRow() < 2) return out;
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() !== "notif_emails") continue;
    String(data[r][1]).split(/[\n;]+/).forEach(function (ligne) {
      var m = ligne.split(/[:=]/);
      if (m.length < 2) return;
      var nom = normaliserNom_(m[0]);
      var email = m.slice(1).join(":").trim();
      if (nom && email.indexOf("@") > 0) out[nom] = email;
    });
    break;
  }
  return out;
}

/** Email direction : nouvelles NDF envoyées (groupé). */
function envoyerEmailDirection_(nouvelles, totalEnAttente) {
  var sujet = nouvelles.length === 1
    ? "📨 NDF à revoir : " + nouvelles[0].ref + " (" + nomNDF_(nouvelles[0]) + ") · " + nouvelles[0].total + " €"
    : "📨 " + nouvelles.length + " NDF à revoir";
  var lignes = nouvelles.map(function (n) {
    return "• " + n.ref + " — " + nomNDF_(n) + (n.isPresta ? " (prestataire)" : "")
      + " — " + n.total + " € (" + n.nbLines + " ligne(s))"
      + (n.coordo ? " — coordo : " + n.coordo : "");
  });
  MailApp.sendEmail({
    to: NOTIF_EMAIL_DIRECTION,
    subject: sujet,
    body: "Bonjour,\n\n"
      + (nouvelles.length === 1 ? "Une nouvelle note de frais attend ta validation :\n\n" : "De nouvelles notes de frais attendent ta validation :\n\n")
      + lignes.join("\n") + "\n\n"
      + "Total en attente de revue : " + totalEnAttente + " NDF\n\n"
      + "Ouvrir l'outil direction :\n" + NOTIF_URL_DIRECTION + "\n"
  });
}

/** Email salarié/prestataire : NDF validée, refusée ou réglée (groupé par personne). */
function envoyerEmailSalarie_(email, ndfs) {
  var blocs = ndfs.map(function (n) {
    if (n.status === "validée") {
      return "✅ Votre note de frais " + n.ref + " (" + n.total + " €) a été validée par la direction.\n"
        + "   Le remboursement sera effectué lors du prochain règlement.";
    }
    if (n.status === "refusée") {
      return "❌ Votre note de frais " + n.ref + " (" + n.total + " €) a été refusée.\n"
        + "   Ouvrez l'outil pour consulter le motif, corriger puis renvoyer :\n   " + NOTIF_URL_ACCUEIL;
    }
    // réglée
    return "💸 Votre note de frais " + n.ref + " (" + n.total + " €) a été réglée"
      + (n.paymentDate ? " le " + formatDate_(n.paymentDate) : "") + ".\n"
      + "   Le virement est en route.";
  });
  var premier = ndfs[0];
  var sujet = ndfs.length === 1
    ? { "validée": "✅ NDF " + premier.ref + " validée",
        "refusée": "❌ NDF " + premier.ref + " refusée",
        "réglée": "💸 NDF " + premier.ref + " réglée (" + premier.total + " €)" }[premier.status]
    : "Notes de frais : " + ndfs.length + " mises à jour";
  MailApp.sendEmail({
    to: email,
    subject: sujet,
    body: "Bonjour,\n\n" + blocs.join("\n\n") + "\n\n— Notification automatique des outils Lit uP\n"
  });
}

function nomNDF_(n) {
  return n.isPresta && n.prestaName ? n.prestaName : (n.salarie || "?");
}

/** Normalise un nom : minuscules, sans accents, espaces simples. */
function normaliserNom_(s) {
  return String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseDate_(v) {
  if (!v) return null;
  var d = (v instanceof Date) ? v : new Date(String(v).split("T")[0]);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate_(v) {
  var d = parseDate_(v);
  return d ? Utilities.formatDate(d, "Europe/Paris", "dd/MM/yyyy") : String(v).split("T")[0];
}

/** Test manuel : vérifie la lecture du Sheet et des emails Config, envoie un récap. */
function testNotificationNDF() {
  var ndfs = lireNDF_();
  var emails = lireEmailsSalaries_();
  var parStatut = {};
  ndfs.forEach(function (n) { parStatut[n.status] = (parStatut[n.status] || 0) + 1; });
  var corps = "Le script fonctionne.\n\nNDF par statut :\n"
    + Object.keys(parStatut).map(function (s) { return "• " + s + " : " + parStatut[s]; }).join("\n")
    + "\n\nEmails salariés configurés (Config → notif_emails) : " + Object.keys(emails).length
    + (Object.keys(emails).length ? "\n" + Object.keys(emails).map(function (n) { return "• " + n + " → " + emails[n]; }).join("\n") : "\n(aucun : ajoutez la ligne notif_emails dans l'onglet Config)");
  MailApp.sendEmail({ to: NOTIF_EMAIL_DIRECTION, subject: "✅ Test notifications NDF", body: corps });
  Logger.log("Email de test envoyé à " + NOTIF_EMAIL_DIRECTION);
}
