/**
 * veille.gs : veille financements Lit uP (AAP, nouveaux fonds, appels d'offres)
 *
 * PROJET AUTONOME, séparé de la compta : un Google Sheet « Veille financements Lit uP » (propriétaire au
 * choix, partagé en modification avec developpement@lit-up.fr), et ce fichier comme unique script du Sheet.
 * veilleInstaller et le déploiement se font CONNECTÉ AVEC developpement@ : déclencheurs et application web
 * tournent alors sous ce compte, et c'est sa boîte qui est lue (garde-fou : aucune autre boîte n'est lue).
 * Guide pas à pas : docs/veille/INSTALLATION-veille-financements.md
 *
 * Propriétés du script (⚙️ Paramètres du projet → Propriétés du script), jamais dans le code :
 *   ANTHROPIC_API_KEY          clé de l'API Claude (console.anthropic.com → API Keys)
 *   AIDES_TERRITOIRES_API_KEY  clé Aides-territoires (aides-territoires.beta.gouv.fr → Mes paramètres → Ma clé API)
 *   ANTHROPIC_WORKSPACE_ID     seulement si la clé Claude n'appartient à aucun workspace (erreur « not scoped to a
 *                              workspace ») : identifiant wrkspc_… (console Anthropic → Settings → Workspaces)
 *
 * Collecte : une fois par semaine, le dimanche soir, en plusieurs passes de 5 minutes enchaînées
 * automatiquement jusqu'à ce que tout soit lu (limite Apps Script : 6 minutes par exécution).
 *   - Aides-territoires (API) : aides ouvertes aux associations sur le Var, la Seine-Saint-Denis, Paris
 *   - JOAFE (API DILA) : créations et modifications de fonds de dotation et de fondations d'entreprise
 *   - BOAMP (API DILA) : avis de marché PACA et Île-de-France sur l'accompagnement des jeunes
 *   - Boîte mail developpement@ : chaque lettre d'information reçue est lue par l'IA, qui en extrait les appels
 *   - Annuaires : fondations abritées (Fondation de France, Fondation Caritas France) et membres
 *     d'Un Esprit de Famille ; chaque fiche n'est lue qu'une fois
 *   - Carenews : les appels à projets des 5 premières pages de sa liste
 * Chaque annonce est notée de 0 à 100 par Haiku au regard des 4 profils de l'onglet Veille_Profils.
 * Les pistes sous VEILLE_NOTE_MIN_GARDE ne sont pas enregistrées.
 *
 * À la demande (bouton « Analyser les comptes » d'un fonds) : téléchargement des derniers comptes annuels
 * publiés au Journal officiel et lecture par Claude (montant redistribué, taille des aides, montant à solliciter).
 * Quand aucun compte n'est encore publié, le constat est enregistré avec sa date : la page l'affiche au lieu du
 * bouton, et la collecte du dimanche revérifie ces fonds (tous les 30 jours) sans rien coûter en IA.
 *
 * Mails : récapitulatif le lundi matin (avec les abonnements à confirmer) ; chaque matin, alertes à 6 et
 * 2 semaines de la date limite pour les pistes « À étudier » et « GO » (simple lecture du Sheet, aucun site visité).
 */

var VEILLE_VERSION = "2026-09-27a";
// Le Sheet est celui auquel le script est rattaché ; son identifiant est mémorisé à l'installation
// pour les déclencheurs (qui n'ont pas de « Sheet actif »).
function veilleSS_() {
  var id = PropertiesService.getScriptProperties().getProperty("VEILLE_SHEET_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
var VEILLE_TAB_PISTES = "Veille_Pistes";
var VEILLE_TAB_SOURCES = "Veille_Sources";
var VEILLE_TAB_PROFILS = "Veille_Profils";
var VEILLE_EMAILS = "laetitia.deborde@lit-up.fr,clementine.claudon@lit-up.fr";
var VEILLE_URL = "https://lit-up-fr.github.io/litup-outils/litup_veille_financements.html";
// Boîte developpement@ : tous les mails de la boîte de réception sont lus, puis rangés sous ce libellé
var VEILLE_GMAIL_LABEL_FAIT = "Veille/lu";
var VEILLE_PASSES_MAX = 10; // passes enchaînées au plus par collecte hebdomadaire (≈ 1 h)
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

var VEILLE_MOTS_STOCK = ["décrochage", "insertion des jeunes", "insertion professionnelle", "égalité des chances",
  "réussite éducative", "persévérance scolaire", "jeunes en difficulté", "quartiers prioritaires"];

var VEILLE_COLS = ["id", "type", "source", "ref_externe", "date_detection", "financeur", "titre", "lien",
  "date_limite", "montant", "territoire", "objet", "profil", "note", "raison", "nature", "siren", "adresse",
  "statut", "issue", "commentaire", "maj_le", "maj_par", "alertes", "comptes_pdf", "analyse_comptes"];
var VEILLE_STATUTS = ["nouveau", "etude", "go", "depose", "clos"];

var VEILLE_SOURCES_DEFAUT = [
  ["F01", "Aides-territoires", "AAP", "API", "oui"],
  ["D01", "JOAFE, fonds de dotation et fondations", "FONDS", "API", "oui"],
  ["M01", "BOAMP, avis de marché", "AO", "API", "oui"],
  ["N00", "Lettres d'information (boîte developpement@)", "AAP", "Mails", "oui"],
  ["A01", "Fondation de France, fondations abritées", "FONDS", "Annuaire", "oui"],
  ["A02", "Fondation Caritas France, fondations abritées", "FONDS", "Annuaire", "oui"],
  ["A03", "Un Esprit de Famille, membres", "FONDS", "Annuaire", "oui"],
  ["C01", "Carenews, appels à projets", "AAP", "Page", "oui"]
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
         base: "", financeur: "Fondation familiale (Un Esprit de Famille)" },
  // Carenews : les 5 premières pages de la liste des appels (les plus récents) ; le financeur se lit dans le lien
  C01: { listes: ["https://www.carenews.com/appels_a_projets", "https://www.carenews.com/appels_a_projets/1/",
                  "https://www.carenews.com/appels_a_projets/2/", "https://www.carenews.com/appels_a_projets/3/",
                  "https://www.carenews.com/appels_a_projets/4/"],
         fiche: /\/[a-z0-9-]+\/appels-a-projet\/[a-z0-9-]+/g, base: "https://www.carenews.com", type: "AAP" }
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

// ─── POINT D'ENTRÉE WEB (application web propre à la veille) ───
function doGet(e) { return veilleRepondre_(e); }
function doPost(e) { return veilleRepondre_(e); }
function veilleRepondre_(e) {
  var out;
  try {
    var params = (e && e.parameter) || {};
    var data = e && e.postData ? JSON.parse(e.postData.contents || "{}") : {};
    out = veilleHandle(params.action || "", params, data);
  } catch (err) {
    out = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function veilleHandle(action, params, data) {
  switch (action) {
    case "veilleList": return veilleList_();
    case "veilleUpdate": return veilleUpdate_(data);
    case "veilleSourceToggle": return veilleSourceToggle_(data);
    case "veilleRun": return veilleLancerCollecte_();
    case "veilleComptes": return veilleAnalyserComptes_(data);
    case "veilleSuiviSave": return veilleSuiviSave_(data);
    case "veilleSuivre": return veilleSuivre_(data);
    case "veilleEchangeAdd": return veilleEchangeAdd_(data);
    case "veilleImportSuivis": return veilleImportSuivis_(data);
    case "veilleNoterSuivis": return veilleNoterSuivis_();
    case "veilleVersion": return { ok: true, version: VEILLE_VERSION };
    default: return { error: "Action veille inconnue : " + action };
  }
}

// ─── INSTALLATION ───
function veilleInstaller() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Lancer veilleInstaller depuis le script rattaché au Sheet de la veille (Extensions → Apps Script)");
  PropertiesService.getScriptProperties().setProperty("VEILLE_SHEET_ID", ss.getId());
  var shP = veilleOnglet_(ss, VEILLE_TAB_PISTES, VEILLE_COLS, []);
  veilleColonnesManquantes_(shP, VEILLE_COLS);
  veilleOnglet_(ss, VEILLE_TAB_SOURCES, VEILLE_SOURCES_COLS,
    VEILLE_SOURCES_DEFAUT.map(function (s) { return s.concat(["", "", "", "", ""]); }));
  veilleOnglet_(ss, VEILLE_TAB_PROFILS, VEILLE_PROFILS_COLS, VEILLE_PROFILS_DEFAUT);
  veilleOnglet_(ss, VEILLE_TAB_VUS, ["source", "ref", "date"], []);
  veilleColonnesManquantes_(veilleOnglet_(ss, VEILLE_TAB_SUIVIS, VEILLE_SUIVIS_COLS, []), VEILLE_SUIVIS_COLS);
  veilleOnglet_(ss, VEILLE_TAB_ECHANGES, VEILLE_ECHANGES_COLS, []);
  // Mise à jour d'une installation existante : ajoute les sources absentes de l'onglet
  var s = veilleLire_(VEILLE_TAB_SOURCES);
  var ids = s.rows.map(function (r) { return String(r.id); });
  VEILLE_SOURCES_DEFAUT.forEach(function (d) {
    if (ids.indexOf(d[0]) < 0) s.sh.appendRow(d.concat(["", "", "", "", ""]));
  });

  var gere = ["veilleCollecter", "veilleCollecteHebdo", "veilleCollecteSuite", "veilleAlertes", "veilleRecapHebdo"];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (gere.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  // Collecte le dimanche soir : les passes s'enchaînent dans la nuit, le récap part le lundi matin
  ScriptApp.newTrigger("veilleCollecteHebdo").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(21).inTimezone("Europe/Paris").create();
  ScriptApp.newTrigger("veilleRecapHebdo").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone("Europe/Paris").create();
  // Alertes de date limite : lecture du Sheet seulement, d'où un passage quotidien sans coût
  ScriptApp.newTrigger("veilleAlertes").timeBased().everyDays(1).atHour(8).inTimezone("Europe/Paris").create();

  var compte = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (compte === VEILLE_BOITE) {
    if (!GmailApp.getUserLabelByName(VEILLE_GMAIL_LABEL_FAIT)) GmailApp.createLabel(VEILLE_GMAIL_LABEL_FAIT);
  } else {
    Logger.log("⚠️ Installation faite avec " + compte + " : les déclencheurs tourneront sous ce compte et la boîte "
      + VEILLE_BOITE + " ne sera pas lue. Pour la lire, relancer veilleInstaller connecté avec " + VEILLE_BOITE + ".");
  }

  var props = PropertiesService.getScriptProperties();
  var manque = ["ANTHROPIC_API_KEY", "AIDES_TERRITOIRES_API_KEY"].filter(function (k) { return !props.getProperty(k); });
  Logger.log("Veille installée pour " + Session.getEffectiveUser().getEmail()
    + " (collecte le dimanche à 21 h, récap le lundi à 7 h, alertes chaque matin)."
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

/** Mise à jour d'une installation existante : ajoute en fin de ligne d'en-tête les colonnes absentes. */
function veilleColonnesManquantes_(sh, cols) {
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  cols.filter(function (k) { return head.indexOf(k) < 0; }).forEach(function (k) {
    var j = sh.getLastColumn() + 1;
    sh.getRange(1, j).setValue(k).setFontWeight("bold").setBackground("#f3f4f6");
  });
}

// ─── LECTURE / ÉCRITURE DU SHEET ───
function veilleLire_(nomOnglet) {
  var sh = veilleSS_().getSheetByName(nomOnglet);
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
  var su = veilleLire_(VEILLE_TAB_SUIVIS), ec = veilleLire_(VEILLE_TAB_ECHANGES);
  return { ok: true, version: VEILLE_VERSION, collecte: veilleEtatCollecte_(), pistes: clean(p.rows), sources: clean(s.rows),
    profils: clean(pr.rows).map(function (x) { return { code: x.code, nom: x.nom }; }),
    suivis: su.sh ? clean(su.rows) : [], echanges: ec.sh ? clean(ec.rows) : [] };
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
/**
 * Bouton « Lancer la collecte maintenant » : une passe dure jusqu'à 5 minutes, bien plus que ce qu'une page web
 * peut attendre (Google coupe la réponse, d'où « Page introuvable »). La collecte est donc programmée en arrière-plan,
 * passes enchaînées comme le dimanche, et la page se met à jour d'elle-même.
 */
function veilleLancerCollecte_() {
  var props = PropertiesService.getScriptProperties();
  var dejaProgrammee = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "veilleCollecteSuite"; });
  if (dejaProgrammee || props.getProperty("VEILLE_EN_COURS")) return { ok: true, deja: true, etat: veilleEtatCollecte_() };
  props.setProperty("VEILLE_PASSE", "1");
  props.setProperty("VEILLE_EN_COURS", new Date().toISOString());
  ScriptApp.newTrigger("veilleCollecteSuite").timeBased().after(30 * 1000).create();
  return { ok: true, lance: true, etat: veilleEtatCollecte_() };
}

function veilleEtatCollecte_() {
  var props = PropertiesService.getScriptProperties();
  var depuis = props.getProperty("VEILLE_EN_COURS");
  // Sécurité : au-delà de 2 h, on considère la collecte terminée (déclencheur perdu, erreur Google)
  if (depuis && Date.now() - new Date(depuis).getTime() > 2 * 3600 * 1000) { props.deleteProperty("VEILLE_EN_COURS"); depuis = null; }
  return { en_cours: !!depuis, depuis: depuis || "", passe: Number(props.getProperty("VEILLE_PASSE") || 0), passes_max: VEILLE_PASSES_MAX };
}

/** Déclencheur du dimanche soir : première passe de la collecte hebdomadaire. */
function veilleCollecteHebdo() {
  PropertiesService.getScriptProperties().setProperty("VEILLE_PASSE", "1");
  PropertiesService.getScriptProperties().setProperty("VEILLE_EN_COURS", new Date().toISOString());
  try { veilleReverifierComptes_(); } catch (e) { console.log("Revérification des comptes : " + e.message); }
  veilleCollecter(true);
}
/** Passes suivantes, programmées automatiquement tant qu'il reste à lire. */
function veilleCollecteSuite() { veilleCollecter(true); }

/**
 * Une passe de collecte (5 minutes au plus). Avec enchainer = true (déclencheurs), une nouvelle passe est
 * programmée 5 minutes plus tard s'il reste des fiches à lire ou des annonces à noter, jusqu'à VEILLE_PASSES_MAX.
 * Le bouton « Lancer maintenant » de la page fait une seule passe.
 */
function veilleCollecter(enchainer) {
  enchainer = enchainer === true;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { error: "Une collecte est déjà en cours" };
  var debut = Date.now();
  var bilan = {}, reste = false;
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
      if (Date.now() - debut > VEILLE_TEMPS_MAX_MS) { bilan[id] = "reporté à la passe suivante"; reste = true; return; }
      try {
        var res = collecteurs[id](String(src.curseur || ""), debut);
        var nouvelles = res.items.filter(function (it) {
          var k1 = id + "|" + it.ref, k2 = "t|" + veilleCle_(it.financeur, it.titre);
          if (connues[k1] || connues[k2]) return false;
          connues[k1] = connues[k2] = true;
          return true;
        });
        var r = veilleNoterEtEnregistrer_(nouvelles, profils, id, p, debut);
        // Notation complète : on avance le curseur et on marque comme lu. Sinon, tout repassera à la passe suivante
        // (les annonces déjà enregistrées sont reconnues et ne sont pas notées deux fois).
        if (!r.coupe && res.valider) res.valider();
        if (r.coupe || res.reste) reste = true;
        veilleMajSource_(s, id, { curseur: r.coupe ? (src.curseur || "") : (res.curseur || src.curseur || ""),
          derniere_collecte: Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm"),
          collectees: nouvelles.length, retenues: r.retenues, derniere_erreur: "" });
        bilan[id] = nouvelles.length + " nouvelles, " + r.retenues + " retenues" + (r.coupe ? " (suite à la passe suivante)" : "");
      } catch (e) {
        veilleMajSource_(s, id, { derniere_erreur: String(e.message).substring(0, 250),
          derniere_collecte: Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm") });
        bilan[id] = "erreur : " + e.message;
      }
    });
  } finally {
    lock.releaseLock();
  }
  if (enchainer) veilleProgrammerSuite_(reste);
  Logger.log(JSON.stringify(bilan) + (reste ? " · il reste à lire" : " · collecte terminée"));
  return { ok: true, bilan: bilan, reste: reste };
}

function veilleProgrammerSuite_(reste) {
  var props = PropertiesService.getScriptProperties();
  var passe = Number(props.getProperty("VEILLE_PASSE") || 1);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "veilleCollecteSuite") ScriptApp.deleteTrigger(t);
  });
  if (reste && passe < VEILLE_PASSES_MAX) {
    props.setProperty("VEILLE_PASSE", String(passe + 1));
    ScriptApp.newTrigger("veilleCollecteSuite").timeBased().after(5 * 60 * 1000).create();
  } else {
    props.deleteProperty("VEILLE_EN_COURS");
  }
}

/** Note les annonces par lots de 8 et écrit celles qui atteignent le seuil. */
function veilleNoterEtEnregistrer_(items, profils, sourceId, p, debut) {
  var aNoter = items.filter(function (it) { return it.force || veilleContientMot_(it.financeur + " " + it.titre + " " + it.texte); });
  var retenues = 0, coupe = false;
  for (var i = 0; i < aNoter.length; i += 8) {
    if (Date.now() - debut > VEILLE_TEMPS_MAX_MS) { coupe = true; break; }
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
  return { retenues: retenues, coupe: coupe };
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
    headers: veilleEntetesClaude_(),
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

// En-têtes des appels à l'API Claude. Une clé créée hors de tout « workspace » de la console Anthropic
// exige l'en-tête anthropic-workspace-id : il est ajouté si la propriété ANTHROPIC_WORKSPACE_ID existe.
function veilleEntetesClaude_(beta) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY absente des propriétés du script");
  var h = { "x-api-key": key, "anthropic-version": "2023-06-01" };
  var ws = props.getProperty("ANTHROPIC_WORKSPACE_ID");
  if (ws) h["anthropic-workspace-id"] = ws.trim();
  if (beta) h["anthropic-beta"] = beta;
  return h;
}

// ─── COLLECTEUR : AIDES-TERRITOIRES ───
// Testé le 25/09/2026 avec une vraie clé : 1 171 aides ouvertes aux associations, dont 435 couvrant le Var,
// la Seine-Saint-Denis ou Paris (aides nationales et régionales comprises). La plupart sont permanentes ou
// récurrentes : la première collecte (curseur vide) les passe toutes en revue, les suivantes ne lisent que
// les aides publiées depuis la dernière collecte. Réponse réelle : { count, next, results: [...] }.
function veilleCollecteAT_(curseur) {
  var token = veilleTokenAT_();
  var url = "https://aides-territoires.beta.gouv.fr/api/aids/?organization_type_slugs=association&itemsPerPage=50"
    + (curseur ? "&published_after=" + curseur : "")
    + VEILLE_DEPTS_AT.map(function (d) { return "&perimeter_codes=" + d; }).join("");
  var items = [];
  for (var page = 1; page <= 15; page++) {
    var resp = UrlFetchApp.fetch(url + "&page=" + page, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" }, muteHttpExceptions: true });
    if (resp.getResponseCode() === 404) break; // au-delà de la dernière page
    if (resp.getResponseCode() !== 200) throw new Error("Aides-territoires HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 150));
    var d = JSON.parse(resp.getContentText());
    var liste = d.results || d["hydra:member"] || (Array.isArray(d) ? d : []);
    liste.forEach(function (a) {
      var fin = (a.financers_full || []).map(function (f) { return f && f.name; }).filter(String).join(", ")
        || (Array.isArray(a.financers) ? a.financers.join(", ") : "");
      items.push({
        type: "AAP", ref: String(a.slug || a.id || a.name), financeur: fin, titre: a.name || "",
        lien: a.url ? "https://aides-territoires.beta.gouv.fr" + a.url : (a.origin_url || ""),
        date_limite: a.submission_deadline ? String(a.submission_deadline).substring(0, 10) : "",
        montant: a.subvention_comment || "", territoire: a.perimeter || "",
        texte: veilleSansHtml_((a.description || "") + " " + (a.eligibility || ""))
      });
    });
    if (!d.next || !liste.length) break;
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
  // Mots-clés plus précis que la veille courante : 342 fonds au lieu de 775 (mesure du 26/09/2026)
  var mots = VEILLE_MOTS_STOCK.map(function (m) { return 'search(objet,"' + m + '")'; }).join(" or ");
  var where = 'source="joafe" and association_type="fondDotation" and annonce_type_facette like "*Création*"'
    + ' and (region_libelle="Île-de-France" or region_libelle="Provence-Alpes-Côte d\'Azur") and (' + mots + ')';
  var res = veilleJOAFEPage_(where, offset, 40, "dateparution desc");
  var p = veilleLire_(VEILLE_TAB_PISTES);
  var connues = {};
  p.rows.forEach(function (r) { connues[r.source + "|" + r.ref_externe] = true; });
  var nouvelles = res.items.filter(function (it) { return !connues["D01|" + it.ref]; });
  var retenues = veilleNoterEtEnregistrer_(nouvelles, veilleLire_(VEILLE_TAB_PROFILS).rows, "D01", p, Date.now()).retenues;
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
      u = u.replace(/\/$/, "") + (id === "A01" || id === "C01" ? "" : "/");
      if (liens.indexOf(u) < 0) liens.push(u);
    });
  });
  if (!liens.length) throw new Error("Aucune fiche trouvée : la page ou le plan du site de l'annuaire a peut-être changé");
  var items = [], lignesVus = [];
  var aLire = liens.filter(function (u) { return !vus[id + "|" + u]; });
  aLire.slice(0, VEILLE_ANNUAIRE_FICHES).forEach(function (u) {
    if (Date.now() - debut > VEILLE_TEMPS_MAX_MS / 2) return;
    var h = veilleGet_(u);
    lignesVus.push([id, u, veilleAujourdhui_()]);
    if (!h) return; // fiche supprimée depuis
    var titre = (h.match(/<title>([^<]*)<\/title>/i) || [])[1] || u;
    titre = veilleSansHtml_(titre).split(/ [-|–] /)[0].trim();
    // Financeur : fixé par l'annuaire, ou lu dans le lien (carenews.com/fondation-orange/appels-a-projet/… → Fondation Orange)
    var fin = a.financeur || u.replace(a.base, "").split("/")[1].replace(/-/g, " ").replace(/\b\w/g, function (x) { return x.toUpperCase(); });
    items.push({ type: a.type || "FONDS", ref: u, financeur: fin, titre: titre, lien: u, date_limite: "",
      montant: "", territoire: "", texte: veilleTexteFiche_(h, titre) || "(fiche sans description : juger sur le nom)",
      force: id === "A03" }); // les fiches Un Esprit de Famille ne donnent que les thèmes
  });
  var restantes = aLire.length - lignesVus.length;
  return { items: items, curseur: restantes + " fiches restantes", reste: restantes > 0,
    valider: function () {
      if (!lignesVus.length || !vus._sh) return;
      vus._sh.getRange(vus._sh.getLastRow() + 1, 1, lignesVus.length, 3).setValues(lignesVus);
      lignesVus.forEach(function (l) { vus[l[0] + "|" + l[1]] = true; });
    } };
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

// ─── COLLECTEUR : LETTRES D'INFORMATION (boîte developpement@) ───
// Tous les fils de la boîte de réception non encore lus par la veille. Les demandes de confirmation
// d'abonnement sont mises de côté pour le récap du lundi (un clic humain reste nécessaire).
var VEILLE_RE_CONFIRMATION = /(confirm|valid)[a-zé]*\b[\s\S]{0,60}(abonnement|inscription|newsletter|lettre)|(abonnement|inscription)[\s\S]{0,40}(confirm|valid)/i;

// Seule cette boîte est lue : si le script tourne sous un autre compte (installation faite avec le mauvais
// compte), la collecte des mails est refusée pour ne jamais lire ni archiver une boîte personnelle.
var VEILLE_BOITE = "developpement@lit-up.fr";

function veilleCollecteGmail_(curseur, debut) {
  var compte = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (compte !== VEILLE_BOITE) throw new Error("Boîte non lue : le script tourne sous « " + (compte || "compte inconnu")
    + " » et non sous " + VEILLE_BOITE + ". Refaire veilleInstaller et le déploiement connecté avec " + VEILLE_BOITE + ".");
  var fait = GmailApp.getUserLabelByName(VEILLE_GMAIL_LABEL_FAIT) || GmailApp.createLabel(VEILLE_GMAIL_LABEL_FAIT);
  var threads = GmailApp.search('in:inbox -label:"' + VEILLE_GMAIL_LABEL_FAIT + '" newer_than:60d', 0, 25);
  var items = [], lus = [], confirmations = [];
  threads.forEach(function (th) {
    if (Date.now() - debut > VEILLE_TEMPS_MAX_MS / 2) return; // laisse du temps pour la notation
    th.getMessages().forEach(function (msg) {
      var corps = msg.getPlainBody() || "";
      if (VEILLE_RE_CONFIRMATION.test(msg.getSubject() + " " + corps.substring(0, 1500))) {
        var lien = (corps.match(/https?:\/\/[^\s<>"]*(confirm|valid|subscribe|optin|opt-in)[^\s<>"]*/i) || [])[0] || "";
        confirmations.push({ de: msg.getFrom(), sujet: msg.getSubject(), lien: lien, date: veilleAujourdhui_() });
        return;
      }
      veilleExtraireMailIA_(msg.getFrom(), msg.getSubject(), corps).forEach(function (x, k) {
        items.push({ type: "AAP", ref: msg.getId() + "-" + k, financeur: x.financeur || msg.getFrom(),
          titre: x.titre || msg.getSubject(), lien: x.lien || "", date_limite: x.date_limite || "",
          montant: x.montant || "", territoire: x.territoire || "", texte: x.resume || "", force: true });
      });
    });
    lus.push(th);
  });
  return { items: items, curseur: veilleAujourdhui_(), reste: threads.length > lus.length || threads.length === 25,
    valider: function () {
      lus.forEach(function (th) { th.addLabel(fait); th.moveToArchive(); });
      if (confirmations.length) {
        var props = PropertiesService.getScriptProperties();
        var deja = JSON.parse(props.getProperty("VEILLE_CONFIRMATIONS") || "[]");
        props.setProperty("VEILLE_CONFIRMATIONS", JSON.stringify(deja.concat(confirmations).slice(-30)));
      }
    } };
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
    headers: veilleEntetesClaude_(),
    payload: JSON.stringify({ model: VEILLE_MODELE, max_tokens: 1500, messages: [{ role: "user", content: consigne }] })
  });
  if (resp.getResponseCode() !== 200) throw new Error("API Anthropic HTTP " + resp.getResponseCode());
  var text = "";
  (JSON.parse(resp.getContentText()).content || []).forEach(function (c) { if (c.text) text += c.text; });
  var m = text.match(/\[[\s\S]*\]/);
  try { return m ? JSON.parse(m[0]).filter(function (x) { return x && x.titre; }) : []; } catch (e) { return []; }
}

// ─── ANALYSE DES COMPTES ANNUELS D'UN FONDS OU D'UNE FONDATION ───
// Les fonds de dotation, fondations et associations qui reçoivent plus de 153 000 € de dons ou de subventions
// publient leurs comptes au Journal officiel. Le dépôt est repéré par SIREN dans le JOAFE (source « dca »),
// le PDF téléchargé sur journal-officiel.gouv.fr puis lu par Claude, qui en tire ce qui intéresse un demandeur.
var VEILLE_MODELE_COMPTES = "claude-opus-5";   // lecture fine de documents financiers, à la demande seulement
var VEILLE_PDF_URL = "https://www.journal-officiel.gouv.fr/telechargements/ASSOCIATIONS/DCA/PDF/";

function veilleAnalyserComptes_(data) {
  if (!data || !data.id) return { error: "id manquant" };
  var p = veilleLire_(VEILLE_TAB_PISTES);
  veilleColonnesManquantes_(p.sh, VEILLE_COLS);
  p = veilleLire_(VEILLE_TAB_PISTES);
  var row = p.rows.filter(function (r) { return String(r.id) === String(data.id); })[0];
  if (!row) return { error: "Piste introuvable" };
  var set = function (col, val) { var j = p.head.indexOf(col); if (j >= 0) p.sh.getRange(row._ligne, j + 1).setValue(val); };
  // « Pas de comptes » : constat daté, enregistré pour ne pas refaire la recherche à chaque clic
  var absent = function (motif, abritee) {
    var a = { absent: true, abritee: !!abritee, motif: motif, verifie_le: veilleAujourdhui_() };
    set("analyse_comptes", JSON.stringify(a));
    return { ok: true, analyse: a };
  };
  if (/Fondation de France|Caritas/.test(row.financeur) && row.source !== "D01")
    return absent("Fondation abritée : elle n'a pas de comptes propres au Journal officiel (ils sont inclus dans ceux de la fondation qui l'abrite). Le montant à solliciter se lit plutôt dans ses appels à projets ou en la contactant.", true);

  var depot = veilleDernierDepot_(row.siren, row.titre);
  if (depot && depot.erreur) return { error: "Journal officiel injoignable pour le moment (HTTP " + depot.erreur + ") : réessayer plus tard." };
  if (!depot) return absent("Aucun compte publié au Journal officiel"
    + (row.siren ? " (SIREN " + row.siren + ")" : "") + ". Un fonds créé récemment n'a pas encore clos d'exercice ; "
    + "un petit fonds de dotation peut aussi être en retard de dépôt.");

  var pdf = UrlFetchApp.fetch(depot.url, { muteHttpExceptions: true });
  if (pdf.getResponseCode() !== 200) return { error: "PDF des comptes inaccessible (HTTP " + pdf.getResponseCode() + ") : " + depot.url };
  var octets = pdf.getBlob().getBytes();
  if (octets.length > 20 * 1024 * 1024) return { error: "PDF trop lourd pour l'analyse (" + Math.round(octets.length / 1048576) + " Mo) : l'ouvrir à la main", pdf: depot.url };

  var consigne = "Tu aides Lit uP, association d'intérêt général qui remobilise des jeunes de 14 à 25 ans (Var, "
    + "Seine-Saint-Denis) et forme les professionnels qui les accompagnent, à préparer une demande de financement.\n"
    + "Voici les derniers comptes annuels publiés par « " + row.titre + " » (exercice clos le " + depot.cloture + ").\n"
    + "Lis-les et réponds UNIQUEMENT par un objet JSON, montants en euros (nombres), null quand l'information n'est pas "
    + "dans le document. N'invente rien : si tu déduis, dis-le dans le champ concerné.\n"
    + "{\"exercice\":\"AAAA\",\"total_ressources\":0,\"dons_et_mecenat\":0,\"produits_financiers\":0,"
    + "\"fonds_propres_ou_dotation\":0,\"montant_redistribue\":0,\"nombre_projets_soutenus\":null,"
    + "\"don_moyen_ou_fourchette\":\"texte court\",\"charges_de_fonctionnement\":0,\"part_redistribuee_pct\":0,"
    + "\"mode\":\"redistributeur|operateur|mixte|inconnu\",\"domaines_finances\":[\"…\"],"
    + "\"exemples_beneficiaires\":[\"…\"],\"montant_a_solliciter\":{\"min\":0,\"max\":0,\"justification\":\"1 à 2 phrases\"},"
    + "\"points_attention\":[\"…\"],\"synthese\":\"3 à 5 phrases en français clair, sans tiret long\",\"confiance\":\"haute|moyenne|faible\"}\n"
    + "Montant à solliciter : raisonne à partir du montant redistribué, du nombre de projets et de la taille habituelle "
    + "des aides ; une première demande raisonnable est souvent sous la moyenne des aides versées.";

  var resp;
  try {
  resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: veilleEntetesClaude_("server-side-fallback-2026-07-01"),
    payload: JSON.stringify({
      model: VEILLE_MODELE_COMPTES, fallbacks: "default", max_tokens: 8000,
      output_config: { effort: "low" }, // extraction de chiffres : un effort bas suffit et garde l'appel court
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: Utilities.base64Encode(octets) } },
        { type: "text", text: consigne }
      ] }]
    })
  });
  } catch (e) {
    // Apps Script coupe les appels externes trop longs : un gros PDF peut dépasser la limite
    return { error: "L'analyse a pris trop de temps (" + e.message + "). Relancer ; si cela se répète, ouvrir le PDF à la main.", pdf: depot.url };
  }
  if (resp.getResponseCode() !== 200) return { error: "API Anthropic HTTP " + resp.getResponseCode() + " : " + resp.getContentText().substring(0, 250), pdf: depot.url };
  var msg = JSON.parse(resp.getContentText());
  if (msg.stop_reason === "refusal") return { error: "L'analyse a été refusée par le modèle : ouvrir le PDF à la main", pdf: depot.url };
  var text = "";
  (msg.content || []).forEach(function (b) { if (b.type === "text") text += b.text; });
  var m = text.match(/\{[\s\S]*\}/);
  if (!m) return { error: "Réponse d'analyse illisible", pdf: depot.url };
  var analyse;
  try { analyse = JSON.parse(m[0]); } catch (e) { return { error: "Réponse d'analyse illisible", pdf: depot.url }; }
  analyse.cloture = depot.cloture;
  analyse.analyse_le = veilleAujourdhui_();

  set("comptes_pdf", depot.url);
  set("analyse_comptes", JSON.stringify(analyse));
  if (!row.siren && depot.siren) set("siren", depot.siren);
  return { ok: true, analyse: analyse, pdf: depot.url };
}

/** Dernier dépôt de comptes au JOAFE, par SIREN, sinon par nom (sans tenir compte des majuscules ni des accents). */
function veilleDernierDepot_(siren, titre) {
  var where = 'source="dca" and ' + (siren
    ? 'dca_siren="' + String(siren).replace(/\D/g, "") + '"'
    : 'search(titre,"' + String(titre).replace(/"/g, "") + '")');
  var url = VEILLE_JOAFE_URL + "?limit=20&order_by=" + encodeURIComponent("dca_datecloture desc")
    + "&where=" + encodeURIComponent(where) + "&select=" + encodeURIComponent("id,titre,dca_datecloture,dca_siren");
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { erreur: r.getResponseCode() }; // à ne pas confondre avec « aucun compte »
  var norm = function (s) { return veilleNorm_(s).replace(/[^a-z0-9]/g, ""); };
  var res = (JSON.parse(r.getContentText()).results || []).filter(function (x) {
    return x.dca_datecloture && (siren || norm(x.titre) === norm(titre)); // par nom : correspondance exacte seulement
  });
  if (!res.length) return null;
  var d = String(res[0].dca_datecloture).substring(0, 10).split("-"); // AAAA-MM-JJ
  return { id: res[0].id, siren: res[0].dca_siren, cloture: d[2] + "/" + d[1] + "/" + d[0],
    url: VEILLE_PDF_URL + d[0] + "/" + d[2] + d[1] + "/" + res[0].id + ".pdf" };
}

/**
 * Chaque dimanche, avant la collecte : les fonds marqués « pas encore de comptes » depuis 30 jours ou plus sont
 * revérifiés au Journal officiel (simple requête, sans IA). Si des comptes sont apparus, la page propose de les
 * analyser ; sinon la date de vérification est mise à jour. 25 fonds et 45 secondes au plus par dimanche.
 */
function veilleReverifierComptes_() {
  var p = veilleLire_(VEILLE_TAB_PISTES);
  var j = p.head.indexOf("analyse_comptes");
  if (j < 0) return 0;
  var limite = veilleIlYA_(30), debut = Date.now(), n = 0;
  p.rows.forEach(function (row) {
    if (n >= 25 || Date.now() - debut > 45000 || row.type !== "FONDS" || String(row.statut) === "clos") return;
    var a; try { a = JSON.parse(row.analyse_comptes || "null"); } catch (e) { return; }
    if (!a || !a.absent || a.abritee || a.nouveau_depot || String(a.verifie_le || "") > limite) return;
    var depot = veilleDernierDepot_(row.siren, row.titre);
    if (depot && depot.erreur) return;
    n++;
    a.verifie_le = veilleAujourdhui_();
    if (depot) a.nouveau_depot = depot.cloture;
    p.sh.getRange(row._ligne, j + 1).setValue(JSON.stringify(a));
  });
  return n;
}

// ─── SUIVI DES FINANCEURS (onglet « ⭐ Suivis ») ───
// Une ligne par financeur suivi (Veille_Suivis) et un journal des échanges (Veille_Echanges).
// Entrées : import unique de la base Notion, bouton « ⭐ Suivre » sur une piste, ajout manuel.
var VEILLE_TAB_SUIVIS = "Veille_Suivis";
var VEILLE_TAB_ECHANGES = "Veille_Echanges";
var VEILLE_SUIVIS_COLS = ["id", "nom", "type", "etape", "favori", "pertinence", "pertinence_raison", "thematiques", "site",
  "contact_nom", "contact_role", "contact_mail", "montant_vise", "note", "source", "piste_ids", "siren",
  "prochaine_action", "prochaine_date", "cree_le", "maj_le", "maj_par", "notion_id"];
var VEILLE_ECHANGES_COLS = ["id", "suivi_id", "date", "type", "contenu", "par", "cree_le"];
var VEILLE_ETAPES_SUIVI = ["qualifier", "contacter", "contacte", "discussion", "obtenu", "pause"];
var VEILLE_CHAMPS_SUIVI = ["nom", "type", "etape", "favori", "pertinence", "pertinence_raison", "thematiques", "site",
  "contact_nom", "contact_role", "contact_mail", "montant_vise", "note", "siren", "prochaine_action", "prochaine_date"];

function veilleMaintenant_() { return Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm"); }
function veilleCleNom_(s) {
  return veilleNorm_(s).replace(/\b(fondation|fonds|de|du|des|d|la|le|l|dotation|entreprise|pour)\b/g, " ").replace(/[^a-z0-9]/g, "");
}
function veilleOngletSuivis_() {
  var ss = veilleSS_();
  var sh = veilleOnglet_(ss, VEILLE_TAB_SUIVIS, VEILLE_SUIVIS_COLS, []);
  veilleOnglet_(ss, VEILLE_TAB_ECHANGES, VEILLE_ECHANGES_COLS, []);
  return sh;
}
function veilleEcrireLigne_(t, o) {
  var head = t.head.length ? t.head : t.sh.getRange(1, 1, 1, t.sh.getLastColumn()).getValues()[0].map(String);
  t.sh.appendRow(head.map(function (h) { return o[h] !== undefined && o[h] !== null ? o[h] : ""; }));
}

/** Crée (sans id) ou met à jour (avec id) un financeur suivi. */
function veilleSuiviSave_(data) {
  if (!data) return { error: "Données manquantes" };
  if (data.etape && VEILLE_ETAPES_SUIVI.indexOf(data.etape) < 0) return { error: "Étape inconnue : " + data.etape };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    veilleOngletSuivis_();
    var t = veilleLire_(VEILLE_TAB_SUIVIS);
    if (!data.id) {
      if (!String(data.nom || "").trim()) return { error: "Nom du financeur manquant" };
      var cle = veilleCleNom_(data.nom);
      var existe = t.rows.filter(function (r) { return veilleCleNom_(r.nom) === cle; })[0];
      if (existe) return { ok: true, id: existe.id, deja: true };
      var o = { id: "S-" + Utilities.getUuid().substring(0, 8), etape: "contacter", favori: "oui", source: data.source || "manuel",
        cree_le: veilleMaintenant_(), maj_le: veilleMaintenant_(), maj_par: data.par || "" };
      VEILLE_CHAMPS_SUIVI.forEach(function (k) { if (data[k] !== undefined) o[k] = data[k]; });
      if (data.piste_ids) o.piste_ids = data.piste_ids;
      veilleEcrireLigne_(t, o);
      return { ok: true, id: o.id, suivi: o };
    }
    var row = t.rows.filter(function (r) { return String(r.id) === String(data.id); })[0];
    if (!row) return { error: "Financeur introuvable" };
    var set = function (col, val) { var j = t.head.indexOf(col); if (j >= 0) t.sh.getRange(row._ligne, j + 1).setValue(val); };
    VEILLE_CHAMPS_SUIVI.forEach(function (k) { if (data[k] !== undefined) set(k, data[k]); });
    set("maj_le", veilleMaintenant_()); set("maj_par", data.par || "");
    return { ok: true, id: row.id };
  } finally { lock.releaseLock(); }
}

/** Bouton « ⭐ Suivre » d'une piste : crée le financeur (ou retrouve celui de même nom) et y rattache la piste. */
function veilleSuivre_(data) {
  var p = veilleLire_(VEILLE_TAB_PISTES);
  var piste = p.rows.filter(function (r) { return String(r.id) === String(data.id); })[0];
  if (!piste) return { error: "Piste introuvable" };
  var nom = piste.type === "FONDS" ? piste.titre : (piste.financeur || piste.titre);
  var an = null; try { an = piste.analyse_comptes ? JSON.parse(piste.analyse_comptes) : null; } catch (e) {}
  var r = veilleSuiviSave_({ nom: nom, source: "veille", par: data.par,
    type: piste.type === "FONDS" ? String(piste.financeur || "").split(" · ")[0] : (piste.type === "AO" ? "Acheteur public" : ""),
    site: piste.type === "FONDS" ? "" : (piste.lien || ""), siren: piste.siren || "", piste_ids: piste.id,
    note: String(piste.raison || "") + (an && an.synthese ? " · Comptes " + (an.exercice || "") + " : " + an.synthese : ""),
    thematiques: String(piste.objet || "").substring(0, 300),
    prochaine_action: "Premier contact", prochaine_date: veilleIlYA_(-14) });
  if (r.error) return r;
  if (r.deja) { // rattacher la piste au financeur existant
    var t = veilleLire_(VEILLE_TAB_SUIVIS);
    var row = t.rows.filter(function (x) { return x.id === r.id; })[0];
    var ids = String(row.piste_ids || "").split(",").filter(String);
    if (ids.indexOf(piste.id) < 0) { ids.push(piste.id); t.sh.getRange(row._ligne, t.head.indexOf("piste_ids") + 1).setValue(ids.join(",")); }
  }
  return r;
}

/** Ajoute un échange au journal et met à jour, si demandé, l'étape et la prochaine action du financeur. */
function veilleEchangeAdd_(data) {
  if (!data || !data.suivi_id) return { error: "Financeur manquant" };
  veilleOngletSuivis_();
  var e = veilleLire_(VEILLE_TAB_ECHANGES);
  var o = { id: "E-" + Utilities.getUuid().substring(0, 8), suivi_id: data.suivi_id, date: data.date || veilleAujourdhui_(),
    type: data.type || "autre", contenu: data.contenu || "", par: data.par || "", cree_le: veilleMaintenant_() };
  if (o.contenu || o.type !== "autre") veilleEcrireLigne_(e, o);
  var maj = { id: data.suivi_id, par: data.par };
  ["etape", "prochaine_action", "prochaine_date"].forEach(function (k) { if (data[k] !== undefined) maj[k] = data[k]; });
  var r = veilleSuiviSave_(maj);
  return r.error ? r : { ok: true, echange: o };
}

/**
 * Import en une fois (base Notion « Financements - suivi dossier ») : lignes déjà converties par Claude, envoyées par lots.
 * Mise à jour sans doublon grâce à notion_id ; l'historique Notion devient la première entrée du journal.
 */
function veilleImportSuivis_(data) {
  var lignes = (data && data.lignes) || [];
  if (!lignes.length) return { error: "Aucune ligne à importer" };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    veilleOngletSuivis_();
    var t = veilleLire_(VEILLE_TAB_SUIVIS), e = veilleLire_(VEILLE_TAB_ECHANGES);
    var parNotion = {}; t.rows.forEach(function (r) { if (r.notion_id) parNotion[r.notion_id] = true; });
    var ajoutS = [], ajoutE = [], ignores = 0;
    lignes.forEach(function (l) {
      if (!l.nom || (l.notion_id && parNotion[l.notion_id])) { ignores++; return; }
      var id = "S-" + Utilities.getUuid().substring(0, 8);
      var o = { id: id, source: "notion", favori: l.etape === "pause" ? "non" : "oui", cree_le: veilleMaintenant_(),
        maj_le: veilleMaintenant_(), maj_par: "import Notion", notion_id: l.notion_id || "" };
      VEILLE_CHAMPS_SUIVI.forEach(function (k) { if (l[k] !== undefined && l[k] !== null) o[k] = l[k]; });
      if (!o.etape) o.etape = "qualifier";
      ajoutS.push(t.head.map(function (h) { return o[h] !== undefined ? o[h] : ""; }));
      if (l.historique) ajoutE.push(e.head.map(function (h) {
        return ({ id: "E-" + Utilities.getUuid().substring(0, 8), suivi_id: id, date: l.historique_date || "2022-12-31",
          type: "import", contenu: l.historique, par: "import Notion", cree_le: veilleMaintenant_() })[h] || ""; }));
    });
    if (ajoutS.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, ajoutS.length, t.head.length).setValues(ajoutS);
    if (ajoutE.length) e.sh.getRange(e.sh.getLastRow() + 1, 1, ajoutE.length, e.head.length).setValues(ajoutE);
    return { ok: true, importes: ajoutS.length, ignores: ignores };
  } finally { lock.releaseLock(); }
}

/** L'IA propose une pertinence sur 5 pour les financeurs « À qualifier » qui n'en ont pas (lots de 12, 4 min au plus). */
function veilleNoterSuivis_() {
  var debut = Date.now();
  var t = veilleLire_(VEILLE_TAB_SUIVIS);
  var aNoter = t.rows.filter(function (r) { return r.etape === "qualifier" && (r.pertinence === "" || r.pertinence === null); });
  var notes = 0;
  for (var i = 0; i < aNoter.length && Date.now() - debut < 4 * 60 * 1000; i += 12) {
    var lot = aNoter.slice(i, i + 12);
    var consigne = "Lit uP, association d'intérêt général (Var, Seine-Saint-Denis), remobilise des jeunes de 14 à 25 ans en "
      + "risque de rupture de parcours et forme les professionnels qui les accompagnent (Missions Locales, E2C). "
      + "Pour chaque financeur ci-dessous, estime sur 5 la pertinence de le solliciter (5 = cœur de cible, 1 = hors sujet), "
      + "à partir de ce que tu sais de lui et des informations données. Si tu ne le connais pas, dis-le et reste prudent (2 ou 3). "
      + "Réponds UNIQUEMENT par un tableau JSON : [{\"i\":0,\"note\":3,\"raison\":\"une phrase, sans tiret long\"}]\n\n"
      + lot.map(function (r, k) { return "### " + k + "\nNom : " + r.nom + "\nType : " + (r.type || "?") + "\nThématiques : "
        + (r.thematiques || "?") + "\nNotes : " + String(r.note || "").substring(0, 300); }).join("\n\n");
    var resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", { method: "post", contentType: "application/json",
      muteHttpExceptions: true, headers: veilleEntetesClaude_(),
      payload: JSON.stringify({ model: VEILLE_MODELE, max_tokens: 1500, messages: [{ role: "user", content: consigne }] }) });
    if (resp.getResponseCode() !== 200) return { error: "API Anthropic HTTP " + resp.getResponseCode(), notes: notes };
    var text = ""; (JSON.parse(resp.getContentText()).content || []).forEach(function (b) { if (b.text) text += b.text; });
    var m = text.match(/\[[\s\S]*\]/); if (!m) continue;
    JSON.parse(m[0]).forEach(function (o) {
      var r = lot[Number(o.i)]; if (!r) return;
      t.sh.getRange(r._ligne, t.head.indexOf("pertinence") + 1).setValue(Number(o.note) || "");
      t.sh.getRange(r._ligne, t.head.indexOf("pertinence_raison") + 1).setValue("IA : " + (o.raison || ""));
      notes++;
    });
  }
  return { ok: true, notes: notes, restants: Math.max(0, aNoter.length - notes) };
}

/** Actions de suivi à faire dans les 7 jours (ou en retard), pour le mail du lundi. */
function veilleRelancesSemaine_() {
  var t = veilleLire_(VEILLE_TAB_SUIVIS);
  if (!t.sh) return [];
  var limite = veilleIlYA_(-7);
  return t.rows.filter(function (r) {
    return r.prochaine_date && r.prochaine_action && ["obtenu", "pause"].indexOf(r.etape) < 0 && String(r.prochaine_date) <= limite;
  }).sort(function (a, b) { return String(a.prochaine_date).localeCompare(String(b.prochaine_date)); });
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
  var props = PropertiesService.getScriptProperties();
  var conf = JSON.parse(props.getProperty("VEILLE_CONFIRMATIONS") || "[]");
  var relances = veilleRelancesSemaine_();
  if (!neuves.length && !conf.length && !relances.length) return;
  var libType = { AAP: "Appels à projets", FONDS: "Nouveaux fonds et fondations", AO: "Appels d'offres" };
  var corps = "Bonjour,\n\n" + (neuves.length ? neuves.length + " nouvelle(s) piste(s) cette semaine :\n" : "Pas de nouvelle piste notée 60 ou plus cette semaine.\n");
  ["AAP", "FONDS", "AO"].forEach(function (t) {
    var l = neuves.filter(function (r) { return r.type === t; });
    if (!l.length) return;
    corps += "\n" + libType[t] + "\n" + l.map(function (r) {
      return "• " + r.note + "/100 · " + r.titre + " (" + (r.financeur || "?") + ")"
        + (r.date_limite ? ", date limite le " + veilleDateFr_(r.date_limite) : "")
        + "\n  " + (r.raison || "") + (r.lien ? "\n  " + r.lien : "");
    }).join("\n") + "\n";
  });
  if (relances.length) {
    var auj = veilleAujourdhui_();
    corps += "\n⏰ Relances et actions de la semaine\n" + relances.map(function (r) {
      return "• " + (String(r.prochaine_date) < auj ? "EN RETARD · " : veilleDateFr_(r.prochaine_date) + " · ") + r.nom + " : " + r.prochaine_action;
    }).join("\n") + "\n";
  }
  if (conf.length) {
    corps += "\nAbonnements à confirmer (boîte developpement@) :\n" + conf.map(function (x) {
      return "• " + x.de + " : " + x.sujet + (x.lien ? "\n  " + x.lien : "\n  (lien à retrouver dans le mail, archivé sous « " + VEILLE_GMAIL_LABEL_FAIT + " »)");
    }).join("\n") + "\n";
    props.deleteProperty("VEILLE_CONFIRMATIONS");
  }
  corps += "\nTrier les pistes :\n" + VEILLE_URL + "\n";
  MailApp.sendEmail({ to: VEILLE_EMAILS, subject: "🔭 Veille financements : " + neuves.length + " nouvelle(s) piste(s)"
    + (relances.length ? ", " + relances.length + " relance(s)" : "")
    + (conf.length ? ", " + conf.length + " abonnement(s) à confirmer" : ""), body: corps });
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
function testVeille() { Logger.log(JSON.stringify(veilleCollecter(false))); }
