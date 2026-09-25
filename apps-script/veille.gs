/**
 * veille.gs : veille financements Lit uP (AAP, nouveaux fonds, appels d'offres)
 *
 * FICHIER AUTONOME : à ajouter comme NOUVEAU fichier dans le projet Apps Script
 * existant (celui lié au Sheet NDF/Compta), à côté de backend.gs et notifications.gs.
 * backend.gs redirige vers ce fichier toutes les actions qui commencent par « veille ».
 *
 * Installation (une seule fois) :
 *   1. Propriétés du script (⚙️ Paramètres du projet → Propriétés du script) :
 *        ANTHROPIC_API_KEY          déjà présente (OCR des justificatifs)
 *        AIDES_TERRITOIRES_API_KEY  clé personnelle (aides-territoires.beta.gouv.fr → Mes paramètres → Ma clé API)
 *   2. Fichier + → Script → nommer « veille » → coller tout ce fichier
 *   3. Remplacer backend.gs par la version du repo (routage des actions « veille »)
 *   4. Exécuter veilleInstaller (autoriser Gmail, Sheets, requêtes externes)
 *      → crée les onglets Veille_Profils / Veille_Sources / Veille_Pistes et les déclencheurs
 *   5. Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer
 *   6. Facultatif : exécuter veilleChargerStockFonds pour passer en revue, une seule fois,
 *      les fonds de dotation déjà créés en PACA et Île-de-France (≈ 730, traités par lots de 40)
 *
 * Collecte (chaque nuit vers 3 h) :
 *   - Aides-territoires (API) : aides ouvertes aux associations sur le Var, la Seine-Saint-Denis, Paris
 *   - JOAFE (API DILA) : créations et modifications de fonds de dotation et de fondations d'entreprise
 *   - BOAMP (API DILA) : avis de marché PACA et Île-de-France sur l'accompagnement des jeunes
 *   - Gmail, libellé « Veille AAP » : lettres d'information des fondations, lues par l'IA
 *   - Annuaires : fondations abritées (Fondation de France, Fondation Caritas France) et membres
 *     d'Un Esprit de Famille ; 30 fiches jamais vues par nuit et par annuaire, chaque fiche n'est lue qu'une fois
 * Chaque annonce est notée de 0 à 100 par Haiku au regard des 4 profils de l'onglet Veille_Profils.
 * Les pistes sous VEILLE_NOTE_MIN_GARDE ne sont pas enregistrées.
 *
 * Mails : récapitulatif le lundi matin ; alertes à 6 et 2 semaines de la date limite
 * pour les pistes « À étudier » et « GO ».
 */

var VEILLE_VERSION = "2026-09-25b";
var VEILLE_SHEET_ID = "1YkW_vcIdh9BKxQ7vRYMOW4DTj0U1OLCuHVRIyouyGR8";
var VEILLE_TAB_PISTES = "Veille_Pistes";
var VEILLE_TAB_SOURCES = "Veille_Sources";
var VEILLE_TAB_PROFILS = "Veille_Profils";
var VEILLE_EMAILS = "laetitia.deborde@lit-up.fr,clementine.claudon@lit-up.fr";
var VEILLE_URL = "https://lit-up-fr.github.io/litup-outils/litup_veille_financements.html";
var VEILLE_GMAIL_LABEL = "Veille AAP";
var VEILLE_GMAIL_LABEL_FAIT = "Veille AAP/traité";
var VEILLE_MODELE = "claude-haiku-4-5-20251001";
var VEILLE_NOTE_MIN_GARDE = 30;   // en dessous : pas enregistré
var VEILLE_NOTE_MIN_MAIL = 60;    // à partir de : dans le mail du lundi
var VEILLE_TEMPS_MAX_MS = 4.5 * 60 * 1000; // marge sous la limite de 6 min d'Apps Script
var VEILLE_ALERTES_JOURS = [42, 14];

// Départements suivis pour le BOAMP et Aides-territoires (PACA + Île-de-France)
var VEILLE_DEPTS_AT = ["83", "93", "75"];
var VEILLE_DEPTS_AO = ["04", "05", "06", "13", "83", "84", "75", "77", "78", "91", "92", "93", "94", "95"];
// Pré-filtre avant l'IA (sans accents, en minuscules) : une annonce sans aucun de ces mots n'est pas notée
var VEILLE_MOTS = ["jeune", "jeunesse", "decroch", "raccroch", "remobilis", "insertion", "mission locale",
  "e2c", "ecole de la deuxieme chance", "mlds", "neet", "engagement", "citoyen", "pouvoir d'agir",
  "egalite des chances", "reussite educative", "perseverance", "quartier", "politique de la ville", "qpv",
  "cite educative", "education", "formation des professionnels", "professionnalisation", "accompagnement",
  "innovation sociale", "experimentation", "essaimage", "changement d'echelle", "vie associative",
  "fonctionnement associatif", "fonjep", "fdva", "sante mentale", "orientation"];
var VEILLE_MOTS_FONDS = ["jeunes", "jeunesse", "décrochage", "insertion", "égalité des chances",
  "réussite éducative", "persévérance scolaire", "quartiers"];

var VEILLE_COLS = ["id", "type", "source", "ref_externe", "date_detection", "financeur", "titre", "lien",
  "date_limite", "montant", "territoire", "objet", "profil", "note", "raison", "nature", "siren", "adresse",
  "statut", "issue", "commentaire", "maj_le", "maj_par", "alertes"];
var VEILLE_STATUTS = ["nouveau", "etude", "go", "depose", "clos"];

var VEILLE_SOURCES_DEFAUT = [
  ["F01", "Aides-territoires", "AAP", "API", "oui"],
  ["D01", "JOAFE, fonds de dotation et fondations", "FONDS", "API", "oui"],
  ["M01", "BOAMP, avis de marché", "AO", "API", "oui"],
  ["N00", "Lettres d'information (Gmail « Veille AAP »)", "AAP", "Mails", "oui"],
  ["A01", "Fondation de France, fondations abritées", "FONDS", "Annuaire", "oui"],
  ["A02", "Fondation Caritas France, fondations abritées", "FONDS", "Annuaire", "oui"],
  ["A03", "Un Esprit de Famille, membres", "FONDS", "Annuaire", "oui"]
];
var VEILLE_TAB_VUS = "Veille_Vus"; // fiches d'annuaire déjà lues (même notées sous le seuil)

// Annuaires de fondations abritantes et de réseaux. Leurs pages de liste se paginent en JavaScript :
// on lit donc la première page (dernières fondations ajoutées) et le plan du site (sitemap), qui liste
// toutes les fiches. Chaque nuit, au plus VEILLE_ANNUAIRE_FICHES fiches jamais vues sont ouvertes et notées :
// le stock se parcourt ainsi en quelques semaines, puis seules les nouvelles fondations sont lues.
var VEILLE_ANNUAIRES = {
  A01: { listes: ["https://www.fondationdefrance.org/fr/annuaire-des-fondations", "https://www.fondationdefrance.org/sitemap.xml"],
         fiche: /(?:https:\/\/www\.fondationdefrance\.org)?\/fr\/annuaire-des-fondations\/[a-z0-9-]+/g,
         base: "https://www.fondationdefrance.org", financeur: "Fondation abritée (Fondation de France)" },
  A02: { listes: ["https://www.fondationcaritasfrance.org/fondations-sitemap.xml"],
         fiche: /https:\/\/www\.fondationcaritasfrance\.org\/fondations\/[a-z0-9-]+\/?/g,
         base: "", financeur: "Fondation abritée (Fondation Caritas France)" },
  A03: { listes: ["https://unespritdefamille.org/membres/"],
         fiche: /https:\/\/unespritdefamille\.org\/membre\/[a-z0-9-]+\/?/g,
         base: "", financeur: "Fondation familiale (Un Esprit de Famille)" }
};
var VEILLE_ANNUAIRE_FICHES = 30;
var VEILLE_SOURCES_COLS = ["id", "nom", "type", "acces", "actif", "curseur", "derniere_collecte",
  "collectees", "retenues", "derniere_erreur"];

var VEILLE_PROFILS_COLS = ["code", "nom", "ce_qui_est_finance", "mots_cles_inclusion", "mots_cles_exclusion",
  "publics", "territoires", "types_financeurs", "montant_min_euros", "delai_min_jours", "priorite"];
var VEILLE_PROFILS_DEFAUT = [
  ["JEU", "Boost uP Jeunes (et uP to You, Speak uP)", "Accompagnement direct de jeunes : remobilisation par l'engagement, pair-aidance, participation", "décrochage scolaire, raccrochage, remobilisation, insertion des jeunes, engagement citoyen, pouvoir d'agir, confiance en soi, persévérance, NEET, jeunes sans solution, mission locale, E2C, MLDS, QPV, politique de la ville, cité éducative, pair-aidance, participation des jeunes, santé mentale des jeunes, égalité des chances", "petite enfance, seniors, recherche médicale, patrimoine, sport de haut niveau, investissement immobilier, création d'entreprise uniquement", "14-25 ans en risque de rupture de parcours, jeunes aux freins multiples, jeunes suivis en Mission Locale", "Var (83), Hyères, La Seyne-sur-Mer, Toulon, Métropole TPM, PACA / Seine-Saint-Denis (93), Plaine Commune, Montreuil, Est Ensemble, Paris, Île-de-France / national", "Public territorial, État, CAF, Politique de la Ville, fondations d'entreprise, fonds de dotation", 5000, 21, 1],
  ["PRO", "Boost uP Pro (formation des professionnels)", "Formation et outillage des professionnels qui accompagnent les jeunes (conseillers, éducateurs, enseignants), transformation des pratiques des structures", "formation des professionnels, montée en compétences, professionnalisation, pratiques d'accompagnement, conseillers mission locale, travailleurs sociaux, enseignants, éducateurs, essaimage, changement d'échelle, transfert de méthode, communauté de pratique, Qualiopi, service public de l'emploi, France Travail, Réseau pour l'emploi", "formation initiale diplômante seule, formation de dirigeants d'entreprise, formation technique métier", "professionnels de l'accompagnement jeunesse et insertion, Missions Locales, E2C, MLDS, structures de l'ESS", "PACA, Île-de-France, national", "État (DREETS, DRAJES), FSE+, Régions, OPCO, fondations orientées emploi et insertion, taxe d'apprentissage", 10000, 30, 1],
  ["LAB", "Lit uP Lab' (laboratoire pédagogique, recherche-action)", "Conception, test, évaluation et diffusion d'outils pédagogiques transférables, mesure d'impact, recherche-action", "innovation sociale, innovation pédagogique, expérimentation, recherche-action, évaluation d'impact, mesure d'impact, fonds d'expérimentation, laboratoire, sciences de l'éducation, autodétermination, outil numérique, BAO, boîte à outils, essaimage, modélisation", "recherche fondamentale sans terrain, R&D industrielle, deeptech", "jeunes 14-25 ans et professionnels, chercheurs partenaires", "national, PACA, Île-de-France, Europe", "Fonds d'expérimentation pour la jeunesse, Europe (Erasmus+, FSE+), fondations (Fondation de France), appels recherche-action, fondations d'entreprise", 10000, 30, 2],
  ["STR", "Structuration et changement d'échelle", "Fonctionnement de l'association, postes, outils (dont BAO numérique), changement d'échelle 2026-2028", "fonctionnement associatif, emploi associatif, poste FONJEP, consolidation, structuration, changement d'échelle, passage à l'échelle, développement associatif, numérique associatif, transformation numérique, FDVA fonctionnement, accompagnement stratégique, DLA, mécénat de compétences", "investissement immobilier lourd, association sportive, association culturelle", "l'association Lit uP elle-même", "Var, Seine-Saint-Denis, PACA, Île-de-France, national", "FDVA, FONJEP, Région, fondations de changement d'échelle (La France s'engage, Pierre Bellon), fonds de dotation, mécénat d'entreprise", 5000, 21, 2]
];

// ─── POINT D'ENTRÉE WEB (appelé par backend.gs) ───
function veilleHandle(action, params, data) {
  switch (action) {
    case "veilleList": return veilleList_();
    case "veilleUpdate": return veilleUpdate_(data);
    case "veilleSourceToggle": return veilleSourceToggle_(data);
    case "veilleRun": return veilleCollecter();
    case "veilleVersion": return { ok: true, version: VEILLE_VERSION };
    default: return { error: "Action veille inconnue : " + action };
  }
}

// ─── INSTALLATION ───
function veilleInstaller() {
  var ss = SpreadsheetApp.openById(VEILLE_SHEET_ID);
  veilleOnglet_(ss, VEILLE_TAB_PISTES, VEILLE_COLS, []);
  veilleOnglet_(ss, VEILLE_TAB_SOURCES, VEILLE_SOURCES_COLS,
    VEILLE_SOURCES_DEFAUT.map(function (s) { return s.concat(["", "", "", "", ""]); }));
  veilleOnglet_(ss, VEILLE_TAB_PROFILS, VEILLE_PROFILS_COLS, VEILLE_PROFILS_DEFAUT);
  veilleOnglet_(ss, VEILLE_TAB_VUS, ["source", "ref", "date"], []);
  // Mise à jour d'une installation existante : ajoute les sources absentes de l'onglet
  var s = veilleLire_(VEILLE_TAB_SOURCES);
  var ids = s.rows.map(function (r) { return String(r.id); });
  VEILLE_SOURCES_DEFAUT.forEach(function (d) {
    if (ids.indexOf(d[0]) < 0) s.sh.appendRow(d.concat(["", "", "", "", ""]));
  });

  var gere = ["veilleCollecter", "veilleAlertes", "veilleRecapHebdo"];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (gere.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("veilleCollecter").timeBased().everyDays(1).atHour(3).inTimezone("Europe/Paris").create();
  ScriptApp.newTrigger("veilleAlertes").timeBased().everyDays(1).atHour(8).inTimezone("Europe/Paris").create();
  ScriptApp.newTrigger("veilleRecapHebdo").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone("Europe/Paris").create();

  if (!GmailApp.getUserLabelByName(VEILLE_GMAIL_LABEL)) GmailApp.createLabel(VEILLE_GMAIL_LABEL);
  if (!GmailApp.getUserLabelByName(VEILLE_GMAIL_LABEL_FAIT)) GmailApp.createLabel(VEILLE_GMAIL_LABEL_FAIT);

  var props = PropertiesService.getScriptProperties();
  var manque = ["ANTHROPIC_API_KEY", "AIDES_TERRITOIRES_API_KEY"].filter(function (k) { return !props.getProperty(k); });
  Logger.log("Veille installée (collecte 3 h, alertes 8 h, récap lundi 8 h)."
    + (manque.length ? " ⚠️ Propriétés manquantes : " + manque.join(", ") : " Clés présentes."));
}

/** Crée l'onglet s'il n'existe pas, avec en-têtes et lignes par défaut. */
function veilleOnglet_(ss, nom, cols, lignes) {
  var sh = ss.getSheetByName(nom);
  if (sh) return sh;
  sh = ss.insertSheet(nom);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight("bold").setBackground("#f3f4f6");
  sh.setFrozenRows(1);
  if (lignes.length) sh.getRange(2, 1, lignes.length, cols.length).setValues(lignes);
  return sh;
}

// ─── LECTURE / ÉCRITURE DU SHEET ───
function veilleLire_(nomOnglet) {
  var sh = SpreadsheetApp.openById(VEILLE_SHEET_ID).getSheetByName(nomOnglet);
  if (!sh || sh.getLastRow() < 1) return { sh: sh, head: [], rows: [] };
  var data = sh.getDataRange().getValues();
  var head = data[0].map(function (h) { return String(h).trim(); });
  var rows = data.slice(1).map(function (r, i) {
    var o = { _ligne: i + 2 };
    head.forEach(function (h, j) {
      var v = r[j];
      o[h] = v instanceof Date ? Utilities.formatDate(v, "Europe/Paris", "yyyy-MM-dd") : v;
    });
    return o;
  });
  return { sh: sh, head: head, rows: rows };
}

function veilleList_() {
  var p = veilleLire_(VEILLE_TAB_PISTES);
  var s = veilleLire_(VEILLE_TAB_SOURCES);
  var pr = veilleLire_(VEILLE_TAB_PROFILS);
  if (!p.sh) return { error: "Onglets veille absents : exécuter veilleInstaller" };
  var clean = function (rows) { return rows.map(function (r) { var o = {}; for (var k in r) if (k !== "_ligne") o[k] = r[k]; return o; }); };
  return { ok: true, version: VEILLE_VERSION, pistes: clean(p.rows), sources: clean(s.rows),
    profils: clean(pr.rows).map(function (x) { return { code: x.code, nom: x.nom }; }) };
}

function veilleUpdate_(data) {
  if (!data || !data.id) return { error: "id manquant" };
  if (data.statut && VEILLE_STATUTS.indexOf(data.statut) < 0) return { error: "Statut inconnu : " + data.statut };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var p = veilleLire_(VEILLE_TAB_PISTES);
    var row = p.rows.filter(function (r) { return String(r.id) === String(data.id); })[0];
    if (!row) return { error: "Piste introuvable : " + data.id };
    var set = function (col, val) {
      var j = p.head.indexOf(col);
      if (j >= 0) p.sh.getRange(row._ligne, j + 1).setValue(val);
    };
    if (data.statut) set("statut", data.statut);
    if (data.issue !== undefined) set("issue", data.issue);
    if (data.commentaire !== undefined) set("commentaire", data.commentaire);
    set("maj_le", Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm"));
    set("maj_par", data.par || "");
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function veilleSourceToggle_(data) {
  var s = veilleLire_(VEILLE_TAB_SOURCES);
  var row = s.rows.filter(function (r) { return String(r.id) === String(data.id); })[0];
  if (!row) return { error: "Source introuvable" };
  s.sh.getRange(row._ligne, s.head.indexOf("actif") + 1).setValue(data.actif ? "oui" : "non");
  return { ok: true };
}

function veilleMajSource_(s, id, champs) {
  var row = s.rows.filter(function (r) { return String(r.id) === id; })[0];
  if (!row) return;
  for (var k in champs) {
    var j = s.head.indexOf(k);
    if (j >= 0) s.sh.getRange(row._ligne, j + 1).setValue(champs[k]);
  }
}

// ─── COLLECTE ───
/** Déclencheur nocturne (et bouton « Lancer maintenant » de la page). */
function veilleCollecter() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { error: "Une collecte est déjà en cours" };
  var debut = Date.now();
  var bilan = {};
  try {
    var s = veilleLire_(VEILLE_TAB_SOURCES);
    var p = veilleLire_(VEILLE_TAB_PISTES);
    var connues = {};
    p.rows.forEach(function (r) {
      connues[r.source + "|" + r.ref_externe] = true;
      connues["t|" + veilleCle_(r.financeur, r.titre)] = true;
    });
    var profils = veilleLire_(VEILLE_TAB_PROFILS).rows;
    var collecteurs = { F01: veilleCollecteAT_, D01: veilleCollecteJOAFE_, M01: veilleCollecteBOAMP_, N00: veilleCollecteGmail_ };
    var vus = veilleVus_();
    Object.keys(VEILLE_ANNUAIRES).forEach(function (k) {
      collecteurs[k] = function (curseur, debut) { return veilleCollecteAnnuaire_(k, curseur, debut, vus); };
    });

    s.rows.forEach(function (src) {
      var id = String(src.id);
      if (!collecteurs[id] || String(src.actif).toLowerCase() !== "oui") return;
      if (Date.now() - debut > VEILLE_TEMPS_MAX_MS) { bilan[id] = "reporté (temps)"; return; }
      try {
        var res = collecteurs[id](String(src.curseur || ""), debut);
        var nouvelles = res.items.filter(function (it) {
          var k1 = id + "|" + it.ref, k2 = "t|" + veilleCle_(it.financeur, it.titre);
          if (connues[k1] || connues[k2]) return false;
          connues[k1] = connues[k2] = true;
          return true;
        });
        var retenues = veilleNoterEtEnregistrer_(nouvelles, profils, id, p, debut);
        veilleMajSource_(s, id, { curseur: res.curseur || src.curseur || "",
          derniere_collecte: Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm"),
          collectees: nouvelles.length, retenues: retenues, derniere_erreur: "" });
        bilan[id] = nouvelles.length + " nouvelles, " + retenues + " retenues";
      } catch (e) {
        veilleMajSource_(s, id, { derniere_erreur: String(e.message).substring(0, 250),
          derniere_collecte: Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm") });
        bilan[id] = "erreur : " + e.message;
      }
    });
    Logger.log(JSON.stringify(bilan));
    return { ok: true, bilan: bilan };
  } finally {
    lock.releaseLock();
  }
}

/** Note les annonces par lots de 8 et écrit celles qui atteignent le seuil. Renvoie le nombre retenu. */
function veilleNoterEtEnregistrer_(items, profils, sourceId, p, debut) {
  var aNoter = items.filter(function (it) { return it.force || veilleContientMot_(it.financeur + " " + it.titre + " " + it.texte); });
  var retenues = 0;
  for (var i = 0; i < aNoter.length; i += 8) {
    if (Date.now() - debut > VEILLE_TEMPS_MAX_MS) break; // la suite repassera à la prochaine collecte
    var lot = aNoter.slice(i, i + 8);
    var notes = veilleNoterIA_(lot, profils);
    var lignes = [];
    lot.forEach(function (it, j) {
      var n = notes[j] || {};
      var note = Number(n.note) || 0;
      if (note < VEILLE_NOTE_MIN_GARDE) return;
      if (it.type === "FONDS" && note >= 50) veilleEnrichirSiren_(it);
      var o = {
        id: sourceId + "-" + Utilities.getUuid().substring(0, 8), type: it.type, source: sourceId, ref_externe: it.ref,
        date_detection: Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd"),
        financeur: it.financeur || "", titre: it.titre || "", lien: it.lien || "",
        date_limite: n.date_limite || it.date_limite || "", montant: n.montant || it.montant || "",
        territoire: it.territoire || "", objet: String(it.texte || "").substring(0, 1500),
        profil: n.profil || "", note: note, raison: n.raison || "", nature: n.nature || "",
        siren: it.siren || "", adresse: it.adresse || "", statut: "nouveau", issue: "", commentaire: "",
        maj_le: "", maj_par: "", alertes: ""
      };
      lignes.push(p.head.map(function (h) { return o[h] !== undefined ? o[h] : ""; }));
    });
    if (lignes.length) {
      p.sh.getRange(p.sh.getLastRow() + 1, 1, lignes.length, p.head.length).setValues(lignes);
      retenues += lignes.length;
    }
  }
  return retenues;
}

function veilleNoterIA_(lot, profils) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY absente");
  var txtProfils = profils.map(function (pr) {
    return "- " + pr.code + " · " + pr.nom + " : " + pr.ce_qui_est_finance
      + ". Mots-clés : " + pr.mots_cles_inclusion + ". Exclure : " + pr.mots_cles_exclusion
      + ". Publics : " + pr.publics + ". Territoires : " + pr.territoires
      + ". Montant minimum : " + pr.montant_min_euros + " €.";
  }).join("\n");
  var txtItems = lot.map(function (it, i) {
    return "### " + i + " [" + it.type + "]\nFinanceur : " + (it.financeur || "?") + "\nTitre : " + it.titre
      + "\nTerritoire : " + (it.territoire || "?") + "\nDate limite connue : " + (it.date_limite || "?")
      + "\nTexte : " + String(it.texte || "").substring(0, 1800);
  }).join("\n\n");
  var consigne = "Tu es chargé de financement de Lit uP, association d'intérêt général (Var et Seine-Saint-Denis, "
    + "organisme de formation Qualiopi) qui remobilise des jeunes de 14 à 25 ans en risque de rupture de parcours "
    + "et forme les professionnels qui les accompagnent (Missions Locales, E2C, MLDS).\n\nProfils de projets :\n"
    + txtProfils + "\n\nPour chaque annonce ci-dessous, évalue si Lit uP peut y prétendre et si cela vaut la peine."
    + " Types : AAP = appel à projets ou subvention ; FONDS = fonds de dotation ou fondation nouvellement déclaré"
    + " (pas d'appel ouvert : on juge s'il vaut la peine de le contacter) ; AO = marché public.\n"
    + "Pour un FONDS, nature = \"operateur\" s'il mène seulement ses propres actions (il ne finance pas d'associations),"
    + " \"redistributeur\" s'il finance des projets d'autres structures, \"inconnu\" sinon. Un fonds opérateur ne dépasse pas 25.\n"
    + "Réponds UNIQUEMENT par un tableau JSON, un objet par annonce, dans l'ordre :\n"
    + "[{\"i\":0,\"note\":0,\"profil\":\"JEU|PRO|LAB|STR|\",\"raison\":\"une phrase en français, sans tiret long\","
    + "\"nature\":\"redistributeur|operateur|inconnu|\",\"date_limite\":\"YYYY-MM-DD ou null\",\"montant\":\"texte court ou null\"}]\n"
    + "Barème : 80-100 cœur de cible ; 60-79 pertinent à étudier ; 30-59 lien faible ; 0-29 hors sujet.\n\n" + txtItems;

  var resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify({ model: VEILLE_MODELE, max_tokens: 1500, messages: [{ role: "user", content: consigne }] })
  });
  if (resp.getResponseCode() !== 200) throw new Error("API Anthropic HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 200));
  var text = "";
  (JSON.parse(resp.getContentText()).content || []).forEach(function (c) { if (c.text) text += c.text; });
  var m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  var arr = JSON.parse(m[0]);
  var parIndex = [];
  arr.forEach(function (o) {
    if (o && o.i !== undefined) {
      if (o.date_limite === "null") o.date_limite = null;
      if (o.montant === "null") o.montant = null;
      parIndex[Number(o.i)] = o;
    }
  });
  return parIndex;
}

// ─── COLLECTEUR : AIDES-TERRITOIRES ───
function veilleCollecteAT_(curseur) {
  var token = veilleTokenAT_();
  var depuis = curseur || veilleIlYA_(30);
  var base = "https://aides-territoires.beta.gouv.fr/api/aids/?organization_type_slugs=association&itemsPerPage=50"
    + "&published_after=" + depuis + VEILLE_DEPTS_AT.map(function (d) { return "&perimeter_codes=" + d; }).join("");
  var items = [];
  for (var page = 1; page <= 6; page++) {
    var resp = UrlFetchApp.fetch(base + "&page=" + page, {
      headers: { Authorization: "Bearer " + token, Accept: "application/ld+json" }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error("Aides-territoires HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 150));
    var d = JSON.parse(resp.getContentText());
    var liste = d["hydra:member"] || (Array.isArray(d) ? d : []);
    liste.forEach(function (a) {
      var fin = (a.aid_financers || []).map(function (f) { return f && f.backer ? f.backer.name : ""; }).filter(String).join(", ");
      items.push({
        type: "AAP", ref: String(a.slug || a["@id"] || a.name), financeur: fin, titre: a.name || "",
        lien: a.slug ? "https://aides-territoires.beta.gouv.fr/aides/" + a.slug + "/" : (a.origin_url || ""),
        date_limite: a.date_submission_deadline ? String(a.date_submission_deadline).substring(0, 10) : "",
        montant: a.subvention_comment || "", territoire: a.perimeter && a.perimeter.name ? a.perimeter.name : "",
        texte: veilleSansHtml_((a.description || "") + " " + (a.eligibility || ""))
      });
    });
    if (liste.length < 50) break;
  }
  return { items: items, curseur: veilleAujourdhui_() };
}

function veilleTokenAT_() {
  var cache = CacheService.getScriptCache();
  var t = cache.get("AT_TOKEN");
  if (t) return t;
  var key = PropertiesService.getScriptProperties().getProperty("AIDES_TERRITOIRES_API_KEY");
  if (!key) throw new Error("AIDES_TERRITOIRES_API_KEY absente des propriétés du script");
  var resp = UrlFetchApp.fetch("https://aides-territoires.beta.gouv.fr/api/connexion/", {
    method: "post", contentType: "application/json", payload: "{}", muteHttpExceptions: true,
    headers: { "X-AUTH-TOKEN": key } });
  if (resp.getResponseCode() !== 200) throw new Error("Connexion Aides-territoires HTTP " + resp.getResponseCode());
  t = JSON.parse(resp.getContentText()).token;
  cache.put("AT_TOKEN", t, 6 * 3600); // le jeton vaut 24 h ; on le renouvelle bien avant
  return t;
}

// ─── COLLECTEUR : JOAFE (fonds de dotation, fondations d'entreprise) ───
var VEILLE_JOAFE_URL = "https://journal-officiel-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/jo_associations/records";

function veilleCollecteJOAFE_(curseur) {
  var depuis = curseur || veilleIlYA_(14);
  var mots = VEILLE_MOTS_FONDS.map(function (m) { return 'search(objet,"' + m + '")'; }).join(" or ");
  var where = 'source="joafe" and dateparution>="' + depuis + '" and ('
    + '(association_type="fondDotation" and (' + mots + '))'
    + ' or (association_type in ("fondationEntreprise","fondationPartenariale") and annonce_type_facette like "*Création*"))';
  return veilleJOAFEPage_(where, 0, 100, "dateparution asc");
}

function veilleJOAFEPage_(where, offset, limit, ordre) {
  var url = VEILLE_JOAFE_URL + "?where=" + encodeURIComponent(where) + "&limit=" + limit + "&offset=" + offset
    + "&order_by=" + encodeURIComponent(ordre)
    + "&select=" + encodeURIComponent("id,dateparution,titre,objet,contenu,association_type_libelle,annonce_type_facette,departement_code,departement_libelle,url_pdf");
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error("JOAFE HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 150));
  var d = JSON.parse(resp.getContentText());
  var max = "";
  var items = (d.results || []).map(function (r) {
    var objet = r.objet || "", fondateurs = "";
    if (r.contenu) {
      try { var c = JSON.parse(r.contenu); var k = Object.keys(c)[0]; var a = c[k]; var s = a[Object.keys(a)[0]] || {};
        if (!objet) objet = s.objet || s.nouvelObjet || a.object || "";
        fondateurs = a.fondateurs || s.fondateurs || ""; } catch (e) {}
    }
    if (fondateurs) objet += " Fondateurs : " + fondateurs;
    if (r.dateparution > max) max = r.dateparution;
    var acte = String(r.annonce_type_facette || "").split("/")[1] || "";
    return {
      type: "FONDS", ref: String(r.id), financeur: (r.association_type_libelle || "") + (acte ? " · " + acte.toLowerCase() : ""),
      titre: r.titre || "", lien: r.url_pdf || "", date_limite: "", montant: "",
      territoire: (r.departement_libelle || "") + (r.departement_code ? " (" + r.departement_code + ")" : ""),
      texte: objet || "(objet non publié : juger sur le nom)", force: true, date_jo: r.dateparution
    };
  });
  return { items: items, curseur: max, total: d.total_count || 0 };
}

/** Enrichit un fonds retenu avec l'Annuaire des entreprises (SIREN, adresse). Sans clé. */
function veilleEnrichirSiren_(it) {
  try {
    var q = String(it.titre || "").replace(/^(fonds de dotation|fondation d'entreprise)\s*/i, "") || it.titre;
    var resp = UrlFetchApp.fetch("https://recherche-entreprises.api.gouv.fr/search?per_page=3&q=" + encodeURIComponent(it.titre), { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return;
    var res = JSON.parse(resp.getContentText()).results || [];
    var norm = function (s) { return veilleNorm_(s).replace(/[^a-z0-9]/g, ""); };
    var cible = norm(q);
    var hit = res.filter(function (r) { return norm(r.nom_complet).indexOf(cible) >= 0; })[0];
    if (!hit) return;
    it.siren = hit.siren;
    it.adresse = hit.siege ? hit.siege.adresse : "";
  } catch (e) { /* enrichissement facultatif */ }
}

/**
 * À lancer à la main une fois : passe en revue les fonds de dotation déjà créés (toutes années)
 * en PACA et Île-de-France dont l'objet parle de nos sujets. Traite 40 fonds par exécution et se
 * relance toute seule toutes les 10 minutes jusqu'à la fin, puis supprime son déclencheur.
 */
function veilleChargerStockFonds() {
  var props = PropertiesService.getScriptProperties();
  var offset = Number(props.getProperty("VEILLE_STOCK_OFFSET") || 0);
  var mots = VEILLE_MOTS_FONDS.map(function (m) { return 'search(objet,"' + m + '")'; }).join(" or ");
  var where = 'source="joafe" and association_type="fondDotation" and annonce_type_facette like "*Création*"'
    + ' and (region_libelle="Île-de-France" or region_libelle="Provence-Alpes-Côte d\'Azur") and (' + mots + ')';
  var res = veilleJOAFEPage_(where, offset, 40, "dateparution desc");
  var p = veilleLire_(VEILLE_TAB_PISTES);
  var connues = {};
  p.rows.forEach(function (r) { connues[r.source + "|" + r.ref_externe] = true; });
  var nouvelles = res.items.filter(function (it) { return !connues["D01|" + it.ref]; });
  var retenues = veilleNoterEtEnregistrer_(nouvelles, veilleLire_(VEILLE_TAB_PROFILS).rows, "D01", p, Date.now());
  offset += res.items.length;
  var fini = !res.items.length || offset >= res.total;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "veilleChargerStockFonds") ScriptApp.deleteTrigger(t);
  });
  if (fini) {
    props.deleteProperty("VEILLE_STOCK_OFFSET");
    Logger.log("Stock des fonds terminé.");
  } else {
    props.setProperty("VEILLE_STOCK_OFFSET", String(offset));
    ScriptApp.newTrigger("veilleChargerStockFonds").timeBased().after(10 * 60 * 1000).create();
    Logger.log("Stock des fonds : " + offset + " / " + res.total + " (" + retenues + " retenus sur ce lot). Suite dans 10 min.");
  }
}

// ─── COLLECTEUR : ANNUAIRES DE FONDATIONS (abritantes, réseaux) ───
function veilleVus_() {
  var v = veilleLire_(VEILLE_TAB_VUS);
  var set = {};
  v.rows.forEach(function (r) { set[r.source + "|" + r.ref] = true; });
  set._sh = v.sh;
  return set;
}

function veilleCollecteAnnuaire_(id, curseur, debut, vus) {
  var a = VEILLE_ANNUAIRES[id];
  var liens = [];
  a.listes.forEach(function (url) {
    var html = veilleGet_(url);
    (html.match(new RegExp(a.fiche.source, "g")) || []).forEach(function (u) {
      if (u.charAt(0) === "/") u = a.base + u;
      u = u.replace(/\/$/, "") + (id === "A01" ? "" : "/");
      if (liens.indexOf(u) < 0) liens.push(u);
    });
  });
  if (!liens.length) throw new Error("Aucune fiche trouvée : la page ou le plan du site de l'annuaire a peut-être changé");
  var items = [], lignesVus = [];
  liens.filter(function (u) { return !vus[id + "|" + u]; }).slice(0, VEILLE_ANNUAIRE_FICHES).forEach(function (u) {
    if (Date.now() - debut > VEILLE_TEMPS_MAX_MS / 2) return;
    var h = veilleGet_(u);
    lignesVus.push([id, u, veilleAujourdhui_()]);
    vus[id + "|" + u] = true;
    if (!h) return; // fiche supprimée depuis
    var titre = (h.match(/<title>([^<]*)<\/title>/i) || [])[1] || u;
    titre = veilleSansHtml_(titre).split(/ [-|–] /)[0].trim();
    items.push({ type: "FONDS", ref: u, financeur: a.financeur, titre: titre, lien: u, date_limite: "",
      montant: "", territoire: "", texte: veilleTexteFiche_(h, titre) || "(fiche sans description : juger sur le nom)",
      force: id === "A03" }); // les fiches Un Esprit de Famille ne donnent que les thèmes
  });
  if (lignesVus.length && vus._sh) vus._sh.getRange(vus._sh.getLastRow() + 1, 1, lignesVus.length, 3).setValues(lignesVus);
  return { items: items, curseur: (liens.length - Object.keys(vus).filter(function (k) { return k.indexOf(id + "|") === 0; }).length) + " fiches restantes" };
}

function veilleGet_(url) {
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { "User-Agent": "Mozilla/5.0 (veille Lit uP)" } });
    return r.getResponseCode() === 200 ? r.getContentText() : "";
  } catch (e) { return ""; }
}

/** Texte utile d'une fiche : sans menus ni scripts, à partir du nom de la fondation. */
function veilleTexteFiche_(html, titre) {
  var t = String(html).replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = veilleSansHtml_(t);
  var mot = String(titre).split(" ").slice(0, 3).join(" ");
  var i = mot ? t.lastIndexOf(mot, Math.min(t.length, 4000)) : -1;
  t = t.substring(i > 0 ? i : 0);
  t = t.replace(/Nous utilisons des cookies[\s\S]*$/i, "").replace(/Tous les membres Nous rejoindre/g, "");
  return t.substring(0, 2000);
}

// ─── COLLECTEUR : BOAMP ───
function veilleCollecteBOAMP_(curseur) {
  var depuis = curseur || veilleIlYA_(14);
  var mots = ["décrochage", "remobilisation", "mission locale", "missions locales", "insertion professionnelle",
    "jeunes", "persévérance scolaire", "réussite éducative", "formation des professionnels"]
    .map(function (m) { return 'search(objet,"' + m + '")'; }).join(" or ");
  var depts = VEILLE_DEPTS_AO.map(function (d) { return 'code_departement="' + d + '"'; }).join(" or ");
  var where = 'dateparution>="' + depuis + '" and nature="APPEL_OFFRE" and (' + depts + ') and (' + mots + ')';
  var url = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?limit=100&order_by="
    + encodeURIComponent("dateparution asc") + "&where=" + encodeURIComponent(where)
    + "&select=" + encodeURIComponent("idweb,dateparution,nomacheteur,objet,code_departement,datelimitereponse,url_avis,type_marche");
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error("BOAMP HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 150));
  var max = "";
  var items = (JSON.parse(resp.getContentText()).results || []).map(function (r) {
    if (r.dateparution > max) max = r.dateparution;
    var dep = Array.isArray(r.code_departement) ? r.code_departement.join(", ") : String(r.code_departement || "");
    return {
      type: "AO", ref: String(r.idweb), financeur: veilleSansHtml_(r.nomacheteur || ""), titre: veilleSansHtml_(r.objet || ""),
      lien: r.url_avis || "", date_limite: r.datelimitereponse ? String(r.datelimitereponse).substring(0, 10) : "",
      montant: "", territoire: dep, texte: veilleSansHtml_(r.objet || ""), force: true
    };
  });
  return { items: items, curseur: max };
}

// ─── COLLECTEUR : LETTRES D'INFORMATION (GMAIL) ───
function veilleCollecteGmail_(curseur, debut) {
  var label = GmailApp.getUserLabelByName(VEILLE_GMAIL_LABEL);
  if (!label) return { items: [], curseur: curseur };
  var fait = GmailApp.getUserLabelByName(VEILLE_GMAIL_LABEL_FAIT) || GmailApp.createLabel(VEILLE_GMAIL_LABEL_FAIT);
  var threads = GmailApp.search('label:"' + VEILLE_GMAIL_LABEL + '" -label:"' + VEILLE_GMAIL_LABEL_FAIT + '" newer_than:30d', 0, 15);
  var items = [];
  threads.forEach(function (th) {
    if (Date.now() - debut > VEILLE_TEMPS_MAX_MS / 2) return; // laisse du temps pour la notation
    th.getMessages().forEach(function (msg) {
      var extraits = veilleExtraireMailIA_(msg.getFrom(), msg.getSubject(), msg.getPlainBody());
      extraits.forEach(function (x, k) {
        items.push({ type: "AAP", ref: msg.getId() + "-" + k, financeur: x.financeur || msg.getFrom(),
          titre: x.titre || msg.getSubject(), lien: x.lien || "", date_limite: x.date_limite || "",
          montant: x.montant || "", territoire: x.territoire || "", texte: x.resume || "", force: true });
      });
    });
    th.addLabel(fait);
  });
  return { items: items, curseur: veilleAujourdhui_() };
}

function veilleExtraireMailIA_(de, sujet, corps) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  var consigne = "Voici une lettre d'information reçue par une association. Extrais UNIQUEMENT les appels à projets,"
    + " appels à candidatures, prix ou programmes de financement ouverts qu'elle annonce (pas les actualités)."
    + " Réponds par un tableau JSON (vide s'il n'y en a aucun) :\n"
    + "[{\"financeur\":\"\",\"titre\":\"\",\"date_limite\":\"YYYY-MM-DD ou null\",\"montant\":\"texte court ou null\","
    + "\"territoire\":\"\",\"lien\":\"URL de l'appel si présente\",\"resume\":\"2 phrases : qui est financé, pour quoi\"}]\n\n"
    + "Expéditeur : " + de + "\nSujet : " + sujet + "\n\n" + String(corps || "").substring(0, 12000);
  var resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify({ model: VEILLE_MODELE, max_tokens: 1500, messages: [{ role: "user", content: consigne }] })
  });
  if (resp.getResponseCode() !== 200) throw new Error("API Anthropic HTTP " + resp.getResponseCode());
  var text = "";
  (JSON.parse(resp.getContentText()).content || []).forEach(function (c) { if (c.text) text += c.text; });
  var m = text.match(/\[[\s\S]*\]/);
  try { return m ? JSON.parse(m[0]).filter(function (x) { return x && x.titre; }) : []; } catch (e) { return []; }
}

// ─── ALERTES ET RÉCAPITULATIF ───
/** Chaque matin : date limite à 42 puis 14 jours pour les pistes « À étudier » et « GO ». */
function veilleAlertes() {
  var p = veilleLire_(VEILLE_TAB_PISTES);
  if (!p.sh) return;
  var jAlertes = p.head.indexOf("alertes");
  var aujourd = new Date(veilleAujourdhui_() + "T00:00:00");
  var lignes = [];
  p.rows.forEach(function (r) {
    if (["etude", "go"].indexOf(r.statut) < 0 || !r.date_limite) return;
    var dl = new Date(String(r.date_limite).substring(0, 10) + "T00:00:00");
    if (isNaN(dl)) return;
    var jours = Math.round((dl - aujourd) / 86400000);
    var deja = String(r.alertes || "").split(",").filter(String);
    VEILLE_ALERTES_JOURS.forEach(function (seuil) {
      if (jours <= seuil && jours >= 0 && deja.indexOf(String(seuil)) < 0) {
        deja.push(String(seuil));
        lignes.push("• J-" + jours + " : " + r.titre + " (" + (r.financeur || "financeur ?") + "), date limite le "
          + veilleDateFr_(r.date_limite) + (r.statut === "go" ? " · GO" : " · à étudier") + (r.lien ? "\n  " + r.lien : ""));
      }
    });
    if (jAlertes >= 0) p.sh.getRange(r._ligne, jAlertes + 1).setValue(deja.join(","));
  });
  if (!lignes.length) return;
  MailApp.sendEmail({ to: VEILLE_EMAILS,
    subject: "⏰ Veille financements : " + lignes.length + " date(s) limite(s) approchent",
    body: "Bonjour,\n\nCes pistes arrivent à échéance :\n\n" + lignes.join("\n\n") + "\n\nOuvrir la veille :\n" + VEILLE_URL + "\n" });
}

/** Lundi matin : nouvelles pistes de la semaine (note ≥ 60), triées par date limite. */
function veilleRecapHebdo() {
  var p = veilleLire_(VEILLE_TAB_PISTES);
  if (!p.sh) return;
  var depuis = veilleIlYA_(7);
  var neuves = p.rows.filter(function (r) {
    return r.statut === "nouveau" && String(r.date_detection) >= depuis && Number(r.note) >= VEILLE_NOTE_MIN_MAIL;
  }).sort(function (a, b) { return String(a.date_limite || "9999").localeCompare(String(b.date_limite || "9999")); });
  if (!neuves.length) return;
  var libType = { AAP: "Appels à projets", FONDS: "Nouveaux fonds et fondations", AO: "Appels d'offres" };
  var corps = "Bonjour,\n\n" + neuves.length + " nouvelle(s) piste(s) cette semaine :\n";
  ["AAP", "FONDS", "AO"].forEach(function (t) {
    var l = neuves.filter(function (r) { return r.type === t; });
    if (!l.length) return;
    corps += "\n" + libType[t] + "\n" + l.map(function (r) {
      return "• " + r.note + "/100 · " + r.titre + " (" + (r.financeur || "?") + ")"
        + (r.date_limite ? ", date limite le " + veilleDateFr_(r.date_limite) : "")
        + "\n  " + (r.raison || "") + (r.lien ? "\n  " + r.lien : "");
    }).join("\n") + "\n";
  });
  corps += "\nTrier les pistes :\n" + VEILLE_URL + "\n";
  MailApp.sendEmail({ to: VEILLE_EMAILS, subject: "🔭 Veille financements : " + neuves.length + " nouvelle(s) piste(s)", body: corps });
}

// ─── OUTILS ───
function veilleNorm_(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function veilleContientMot_(s) { var n = veilleNorm_(s); return VEILLE_MOTS.some(function (m) { return n.indexOf(m) >= 0; }); }
function veilleCle_(fin, titre) { return veilleNorm_(fin + " " + titre).replace(/[^a-z0-9]/g, "").substring(0, 80); }
function veilleSansHtml_(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}
function veilleAujourdhui_() { return Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd"); }
function veilleIlYA_(j) { return Utilities.formatDate(new Date(Date.now() - j * 86400000), "Europe/Paris", "yyyy-MM-dd"); }
function veilleDateFr_(s) { var p = String(s).substring(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : s; }

/** Test manuel : lance une collecte et affiche le bilan dans le journal. */
function testVeille() { Logger.log(JSON.stringify(veilleCollecter())); }
