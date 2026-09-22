# CLAUDE.md — Travailler ensemble sur les Outils internes Lit uP

Ce fichier est le point d'entrée du dépôt. Il s'adresse à **toute personne qui va
modifier ces outils** — salariée de Lit uP, prestataire, ou assistant IA (Claude
Code lit ce fichier automatiquement à chaque session).

Il répond à quatre questions : *qu'est-ce que je regarde ?*, *comment je modifie
sans rien casser ?*, *qu'est-ce qui a déjà été tenté et raté ?*, *qui a fait
quoi ?*

**Si vous ne lisez qu'une chose : la [checklist de modification](#6-la-checklist-de-chaque-modification).**

---

## 1. Le projet en cinq lignes

Une suite d'outils de gestion pour l'association **Lit uP**, publiée en PWA sur
GitHub Pages : <https://lit-up-fr.github.io/litup-outils/>

- Notes de frais (salariés, direction, prestataires)
- Dépenses directes (carte, virements, prélèvements)
- Suivi comptable, budget prévisionnel, trésorerie, RH, engagements financeurs

**Pas de framework, pas de build, pas de `npm install`.** Chaque outil est
**une seule page HTML autonome** (CSS et JavaScript inclus dedans). On ouvre le
fichier, on modifie, on commit, c'est en ligne. Cette simplicité est un choix
assumé : l'outil doit rester réparable par une personne seule, depuis un iPad,
sans chaîne de compilation.

---

## 2. Qui fait quoi

| Personne | Rôle sur les outils |
|---|---|
| **Laetitia de Borde** (laetitia.deborde@lit-up.fr) | Direction. Commanditaire de la quasi-totalité des évolutions, utilisatrice principale du suivi comptable, valide les NDF. |
| **Clémentine Claudon** (clementine.claudon@lit-up.fr) | Direction. Validation et règlement des NDF, dépenses directes. |
| **Salariés et prestataires** | Saisissent leurs notes de frais. Ne touchent pas au code. |
| **Claude (Claude Code)** | Écrit la majorité du code, sur demande explicite. Auteur Git de ~130 commits. |

**Conséquence importante :** l'auteur Git d'un commit (`Claude`, `lit-up-fr`)
ne dit **pas** qui a décidé du changement. La demande réelle est **dans le corps
du message de commit**, souvent citée entre guillemets. Voir
[§8, conventions Git](#8-conventions-git).

---

## 3. Carte du dépôt

```
index.html                       Page d'accueil : choix du profil + mot de passe
litup_ndf_salarie.html           NDF salarié
litup_ndf_direction.html         NDF direction (validation, règlement)
litup_ndf_prestataire.html       NDF prestataire / facilitateur
litup_depenses_carte.html        Dépenses directes (Clémentine & Laetitia)
litup_suivi_comptable_v6.html    LE gros outil (~860 Ko) : 8 onglets, cœur du projet
manifest.webmanifest             PWA
sw.js                            Service worker — CACHE_VERSION à incrémenter !
icons/                           Icônes PWA
apps-script/backend.gs           Backend Google Apps Script (copie versionnée)
apps-script/notifications.gs     Emails du workflow NDF (fichier autonome)
archives/                        Copies gelées de l'outil + README explicatif
docs/                            Notes de cadrage et de décision, une par sujet
```

Les onglets du suivi comptable : `📋 Classement`, `📈 Suivi analytique`,
`📋 Budget prévi.`, `⚖️ Prévi. vs Réalisé`, `💰 Trésorerie`, `👥 RH`,
`🤝 Engagements`, `⚠️ Justif.`

---

## 4. Où vivent le code et les données

```
  Navigateur (PWA)                Google Apps Script              Sources
  ────────────────                ──────────────────              ───────
  litup_*.html          ──HTTP──▶  backend.gs  ──────────────▶  Google Sheet
  localStorage                     (doGet/doPost, ?action=…)      (NDF, Compta,
  IndexedDB (base de fusion)                                       Config, Depenses)
                                                          ──────▶  Google Drive
                                                                    (justificatifs)
                                                          ──────▶  Airtable
                                                                    (financements,
                                                                     codes projets,
                                                                     indicateurs)
                                   notifications.gs ─────▶ emails (déclencheurs)
```

**Les quatre lieux de vérité, à ne jamais confondre :**

1. **`localStorage` du navigateur** — l'état de travail courant. Clés :
   `litup_v5` (compta), `litup_ndf`, `litup_dir`, `litup_carte`, `litup_codes`,
   `litup_pwd_*`, plus les préférences d'affichage. **Propre à un appareil.**
   C'est la cause n°1 des « je l'ai déjà fait sur mon téléphone, ça n'apparaît
   pas sur l'iPad ».
2. **Le Google Sheet** (`1YkW_vcIdh9BKxQ7vRYMOW4DTj0U1OLCuHVRIyouyGR8`) —
   le partage entre appareils et entre personnes. Onglets `NDF`, `Compta`,
   `Config`, `Depenses`. Ce qui n'est pas envoyé par **☁️ Sauvegarder** n'existe
   que sur l'appareil qui l'a saisi.
3. **Google Drive** — les justificatifs (pièces jointes, bulletins RH).
4. **Airtable** (base `appWof91rLGFIUnrT`) — la source des financements, des
   codes projets et des indicateurs qualitatifs. **On ne saisit jamais dans
   l'outil ce qui existe dans Airtable :** on le recharge.

Le backend est joint par une URL `script.google.com/macros/s/…/exec`, **identique
dans les cinq pages**. Si elle change (nouveau déploiement), il faut la changer
dans les cinq.

---

## 5. Avant de toucher au code (règles d'or)

1. **Comprendre avant de réécrire.** Ces fichiers sont denses et commentés en
   français ; les commentaires expliquent *pourquoi* le code est ainsi, pas ce
   qu'il fait. Un commentaire qui dit « sinon page blanche si le CDN ne répond
   pas » est le compte-rendu d'un bug déjà vécu : ne l'annulez pas sans le lire.
2. **Ne jamais réécrire `litup_suivi_comptable_v6.html` en entier.** 860 Ko,
   ~12 000 lignes. On y travaille par recherche ciblée (`grep -n`) et
   modification chirurgicale. Une réécriture globale perd du code en silence.
3. **Travailler sur une branche**, jamais directement sur `main`
   (convention : `claude/<sujet-court>`).
4. **Un sujet = un commit.** Le message de commit est la documentation de ce
   projet ; il doit pouvoir se lire dans six mois.
5. **Tester avant de pousser.** Il n'y a ni CI ni tests automatisés dans le
   dépôt : la vérification est manuelle, et elle est **votre responsabilité**.
   La pratique en place : écrire de petits scripts de vérification jetables dans
   un dossier `scratchpad/` (non versionné) et dire dans le commit ce qui a été
   vérifié.
6. **Ne jamais toucher aux données de production pour tester.** Le Sheet et
   Airtable sont partagés et vivants.

---

## 6. La checklist de chaque modification

À dérouler **systématiquement**. Chaque ligne oubliée a déjà coûté une
demi-journée à quelqu'un.

- [ ] **Modification faite** sur la bonne page (et sur les *cinq* pages si ça
      touche le socle commun : mot de passe, URL backend, service worker).
- [ ] **`sw.js` : incrémenter `CACHE_VERSION`** (`litup-outils-v68` → `v69`).
      Sans ça, les utilisateurs continuent de voir l'ancienne version depuis le
      cache, parfois pendant des jours, et « ça ne marche pas chez moi » est
      impossible à diagnostiquer.
- [ ] **Marqueur de build** dans l'en-tête du suivi comptable (ligne ~269 :
      `build 2026-09-01j`) — date + lettre incrémentale dans la journée. C'est
      ce que Laetitia lit pour dire quelle version elle a sous les yeux.
- [ ] **Si `apps-script/backend.gs` est modifié :**
  - [ ] incrémenter `BACKEND_VERSION` (format `AAAA-MM-JJx`) ;
  - [ ] mettre `BACKEND_ATTENDU` (dans `litup_suivi_comptable_v6.html`) à la
        version minimale nécessaire — l'outil affiche sinon un bandeau
        « Apps Script à redéployer » ;
  - [ ] **redéployer le web app dans l'éditeur Apps Script** (Déployer → Gérer
        les déploiements → modifier → nouvelle version). Le commit Git ne
        déploie rien : `apps-script/*.gs` est une *copie* versionnée.
- [ ] **Commit** avec un message en français qui décrit l'effet (voir §8).
- [ ] **Push** sur la branche, puis fusion vers `main` une fois vérifié.
- [ ] **Vérifier en ligne** après 1–2 minutes (GitHub Pages) : ouvrir la page,
      forcer le rechargement, contrôler le numéro de build affiché.

> ⚠️ `notifications.gs` ne demande **pas** de redéploiement du web app : les
> déclencheurs utilisent toujours la dernière version enregistrée du code. Mais
> un premier ajout demande d'exécuter `installerDeclencheurNDF` une fois à la
> main.

---

## 7. Conventions de code

**Langue.** Tout est en français : interface, commentaires, noms de fonctions
métier (`fusionner`, `parcoursActifs`, `chargeLib`), messages de commit, notes
dans `docs/`. On continue en français.

**Style JavaScript.** Vanilla, pas de framework, pas de transpilation. Style
compact assumé (`const ds=d=>d.toISOString().slice(0,10)`), `let`/`const`,
fonctions fléchées. L'état global du suivi comptable vit dans un objet `D`,
rendu par `render()`, persisté par `autoSaveBrut()`.

**Commentaires.** On commente **le pourquoi**, en particulier quand le code
paraît alambiqué : c'est presque toujours la cicatrice d'un bug réel. Exemple à
imiter (dans `sw.js`) :

```js
// Fichier par fichier : avec addAll, un seul 404 fait échouer toute
// l'installation et le service worker reste bloqué en « installing ».
```

**Robustesse.** Tout accès à `localStorage`, `IndexedDB` ou au réseau est
enveloppé dans un `try/catch` : une brique absente ne doit jamais donner une page
blanche. Les bibliothèques externes (XLSX, JSZip depuis cdnjs) sont **chargées à
la demande** par `chargeLib()`, jamais en `<script src>` bloquant.

**Interface.** Thème sombre par défaut (thème clair mémorisé dans
`litup_theme`), police DM Sans, accent `#00989D` (turquoise Lit uP) et
`#FCC33D` (jaune). Émojis comme repères de navigation : c'est délibéré, les
utilisatrices s'y repèrent.

**Un message d'erreur doit dire quoi faire.** Pas « erreur » mais « Apps Script
à redéployer (déployé : X · attendu : Y) ». Pas un zéro muet, mais « voici
pourquoi ce total est à 0 ».

**Mobile.** Laetitia travaille depuis un iPad et un téléphone. Toute évolution
doit rester utilisable en portrait.

---

## 8. Conventions Git

**Branches.** `claude/<sujet-court>` pour le travail en cours ; `main` est la
branche publiée (GitHub Pages sert `main`). **Pousser sur `main`, c'est mettre en
production.**

**Messages de commit.** La convention actuelle (depuis fin août 2026) :

```
Titre : l'effet obtenu, en français, sans préfixe technique

Le contexte, souvent la phrase exacte de la demande entre guillemets.

Ce qui a été changé et POURQUOI, y compris ce qui a été écarté.

Vérifié : ce qui a été testé, et comment.
```

Exemple réel (`65d1ccf`) : *« Le plan comptable part vers le Sheet, et le perçu
dit pourquoi il est à zéro »*, suivi de la citation de Laetitia, du diagnostic
des deux causes, et de la liste des vérifications.

Les commits d'août 2026 portent encore des préfixes `feat:` / `fix:` / `chore:`
— ancienne convention, à ne pas reprendre.

**Tracer qui a demandé quoi.** L'auteur Git n'est pas le décideur. Nommez la
personne à l'origine de la demande dans le corps du message (« à la demande de
Laetitia », « deux constats de Clémentine depuis son iPad »). C'est ce qui rend
`git log` lisible comme un historique de décisions.

**Commandes utiles :**

```bash
git log --oneline -20                    # les 20 dernières évolutions
git log --format='%ad %an | %s' --date=short   # avec date et auteur
git log -p -S "fusionner"                # quand une fonction est-elle apparue
git log --follow -- docs/mon-sujet.md    # l'histoire d'un document
```

---

## 9. Les erreurs à ne pas refaire

Cette liste vient de bugs réellement survenus. Chacune a coûté du temps.

| ⚠️ | L'erreur | Ce qui se passe | La règle |
|---|---|---|---|
| 1 | Oublier d'incrémenter `CACHE_VERSION` dans `sw.js` | Les utilisateurs voient l'ancienne page, parfois plusieurs jours. Personne ne comprend pourquoi le correctif « ne marche pas ». | Incrémenter à **chaque** livraison. |
| 2 | Modifier `backend.gs` sans redéployer le web app | L'outil appelle une action qui n'existe pas côté serveur. Indistinguable d'un bug de l'outil — ce doute a déjà duré des semaines, d'où le mécanisme `BACKEND_VERSION` / `BACKEND_ATTENDU`. | Redéployer, et monter les deux numéros. |
| 3 | Ajouter une donnée à `D` sans l'ajouter à la sauvegarde cloud | La donnée ne vit que sur l'appareil qui l'a saisie (cas réel : plan comptable, codes projets et règles de classement, corrigé le 01/09/2026). | Toute donnée partagée doit entrer dans `autoSaveBrut()`, dans l'envoi vers le Sheet **et** dans la liste de fusion `FUS_REGLAGES`. |
| 4 | Charger une bibliothèque CDN en `<script src>` bloquant | Page blanche indéfinie si le CDN ne répond pas. | Chargement à la demande via `chargeLib()`. |
| 5 | Remplacer au chargement ce qui devrait être réuni | Un compte créé sur le téléphone efface celui créé sur l'iPad. | Décider explicitement, champ par champ : *réunir* (plan comptable) ou *remplacer* (codes projets venus d'Airtable). |
| 6 | Agréger un indicateur sans filtre de périmètre | On additionne des cellules vides et le chiffre est faux **en silence** — le pire cas. | Tout indicateur porte une portée (familles / codes projets). |
| 7 | Additionner ce qui ne s'additionne pas | Une note de satisfaction se moyenne, avec le nombre de parcours notés ; un « coût réel » venu d'Airtable double la comptabilité et se met **à côté**, jamais à la place. | Distinguer volume, appréciation et montant. |
| 8 | Écrire dans le Sheet depuis une archive | L'ancien code écrit avec l'ancien comportement dans les données d'aujourd'hui. | Les archives sont en **lecture seule**. Ne rien y enregistrer. |
| 9 | Commiter des fichiers de test | Deux captures d'écran (`.r1.png`, `.r2.png`) ont dû être retirées. | Scripts et captures de vérification dans `scratchpad/`, hors du dépôt. |
| 10 | Croire qu'une archive gèle les données | Elle gèle **le code**. Les données viennent du `localStorage` et du Sheet du jour où on l'ouvre. | Pour geler des données : export JSON + historique de versions du Sheet. |
| 11 | Écraser le travail de l'autre lors d'une sauvegarde simultanée | Deux personnes sur le suivi comptable, l'une perd tout. | Passer par la fusion (§10). Jamais un « écraser » brutal. |
| 12 | Modifier une page sans la tester sur mobile | Bug réel : le contenu commençait 846 px plus bas sur téléphone. | Vérifier en portrait. |

---

## 10. Données : sauvegarder, fusionner, restaurer, archiver

**Le cycle normal.** ☁️ **Charger** au début d'une session (on récupère ce que
les autres ont fait), on travaille, ☁️ **Sauvegarder** à la fin.

**La fusion à deux.** Le suivi comptable sait fusionner deux versions plutôt que
d'en sacrifier une. Le mécanisme (à comprendre avant d'y toucher) :

- trois états sont nécessaires : la **version commune de départ** (celle qu'on a
  chargée), **la nôtre**, **celle du Sheet** ;
- champ par champ : un seul côté a changé → on prend ce côté ; les deux
  pareil → rien ; les deux différemment → **on demande** ;
- la version commune est conservée en **IndexedDB** (`litup_compta`, store
  `base`) parce qu'elle pèse autant que les données et que `localStorage` est
  déjà plein ;
- si la version commune est absente ou périmée, **on ne fusionne pas et on le
  dit**, plutôt que de deviner.

**Sauvegarder pour de vrai.** 📤 Export → 💾 JSON produit un fichier complet,
rechargeable par 📥 Import. C'est la sauvegarde qui compte. Le Sheet a en plus
son propre historique de versions (Fichier → Historique des versions).

**Archiver une version.** Avant une remise à plat importante : copier la page
dans `archives/AAAA-MM-JJ-<nom>.html` avec un bandeau d'archivage, y joindre le
`backend.gs` et le `sw.js` du jour, et documenter dans `archives/README.md`.
*(Le `README` mentionne un repère Git `avant-remise-a-plat-2026-08-28` : ce tag
n'existe pas sur le dépôt distant — le repère fiable est le fichier archivé.)*

---

## 11. Secrets, mots de passe, données personnelles

**Ce qui n'entre JAMAIS dans le dépôt :** jetons Airtable, clés API Anthropic
(OCR), identifiants Google. Ils vivent dans **Apps Script → Paramètres du projet
→ Propriétés du script** (`AIRTABLE_TOKEN`, `ANTHROPIC_API_KEY`) et sont lus par
`PropertiesService.getScriptProperties()`.

**Les mots de passe des profils sont en clair dans le HTML** (`litup-ndf-2026`,
`litup-dir-2026`, `litup-compta-2026`, `ndf-2026`). C'est une barrière contre
l'accès accidentel, **pas une sécurité** : le code est public sur GitHub Pages.
À savoir, et à ne pas prendre pour plus que ça. Si on les change, il faut les
changer dans `index.html` **et** dans le garde placé en tête de chaque page.

Deux nuances à connaître :

- **`litup_depenses_carte.html` n'a aucun garde** : l'accueil demande un mot de
  passe avant d'y mener, mais la page s'ouvre directement si on connaît son URL.
  Les quatre autres pages, elles, revérifient le mot de passe au chargement.
- Le mot de passe validé est mémorisé dans `localStorage` (`litup_pwd_*`) : il
  n'est plus redemandé sur cet appareil.

**Données personnelles.** Les NDF contiennent des noms, des montants, parfois des
adresses ; les bulletins RH sont sur Drive. Rien de tout cela ne doit être copié
dans le dépôt, ni dans un message de commit, ni dans une note de `docs/`. Les
emails de l'équipe présents dans `notifications.gs` sont des adresses
professionnelles, utilisées pour l'envoi des alertes.

---

## 12. Déployer et vérifier

**Le site.** GitHub Pages sert la branche `main`. Un push sur `main` est en ligne
en une à deux minutes. Pas d'étape de build.

**Le backend.** Apps Script se déploie **à la main** dans l'éditeur (voir §6).
`apps-script/backend.gs` dans le dépôt est une copie de référence : c'est elle
qui permet de relire l'historique et de comparer.

**Vérifier qu'une livraison est bien arrivée :**

1. ouvrir la page, recharger en forçant (ou fermer/rouvrir la PWA) ;
2. lire le **marqueur de build** en haut du suivi comptable ;
3. vérifier qu'aucun bandeau « ⚠️ Apps Script à redéployer » n'apparaît ;
4. tester le geste qui a changé, sur mobile **et** sur ordinateur.

En cas de page blanche : `?secours=1` ouvre le mode de secours ; le service
worker répond toujours une page lisible plutôt qu'une erreur réseau muette.

---

## 13. Journal des modifications

`git log` reste la source de vérité détaillée. Ce tableau donne les repères, et
**qui était à l'origine** de chaque phase.

| Période | Auteur des commits | À la demande de | Ce qui s'est joué |
|---|---|---|---|
| **21–28 avr. 2026** | laetitiadeborde-litup, lit-up-fr | Laetitia | Création du dépôt. Premières versions des outils, déposées par upload direct depuis GitHub (« Add files via upload »). |
| **5–23 mai 2026** | lit-up-fr | Laetitia | Itérations sur les notes de frais. |
| **19 août 2026** | lit-up-fr (PR #1 à #5) | Laetitia | Passage en **PWA** (manifest, service worker, icônes) et **notifications email** du workflow NDF. Dernières contributions via pull requests. |
| **20–22 août 2026** | Claude | Laetitia | Import bancaire, OCR des justificatifs, **rapprochement banque ↔ financements Airtable**, budget prévisionnel construit depuis Airtable, backend Apps Script **versionné**. |
| **25–27 août 2026** | Claude | Laetitia | Chaîne des **justificatifs** : numéros de pièces, liens Drive, rattrapages, pièces partagées (indemnités kilométriques). |
| **28 août 2026** | Claude | Laetitia | Onglet **RH** : masse salariale, grille de taux, réduction générale. **Archivage** de la version précédente (`archives/`) avant remise à plat. |
| **29–30 août 2026** | Claude | Laetitia | Écritures hors banque, virements internes, ancrage des soldes, démarrage sans dépendance aux CDN. |
| **31 août 2026** (35 commits) | Claude | Laetitia | La grosse journée : **ventilation des salaires sur les projets**, heures d'action depuis Airtable, répartitions mémorisées, suivi analytique par projet, **fusion du travail à deux**, et ouverture du chantier **Engagements financeurs**. |
| **1er sept. 2026** | Claude | Laetitia (retours depuis son iPad) | **Frais de structure** et enveloppes, affectation d'un financement à une enveloppe, plan comptable envoyé au Sheet, explication des totaux à zéro. |
| **22 sept. 2026** | Claude | Laetitia | Ce fichier `CLAUDE.md`. |

**Pour ajouter une ligne :** une phase, pas un commit. Une ligne quand un
chantier s'ouvre ou se referme — pas à chaque correctif.

---

## 14. Chantiers ouverts

- **`docs/a-faire-engagements-financeurs.md`** — la page « Engagements
  financeurs » : besoin, décisions tranchées le 31/08/2026, sélection des sept
  indicateurs Airtable, structure de données implémentée. L'onglet 🤝
  Engagements existe ; les indicateurs qualitatifs demandent l'action
  `getIndicateurs` du backend (version ≥ `2026-08-31d`) puis un ☁️ Charger →
  Airtable.
- **Écart de versions à surveiller** : `BACKEND_VERSION` vaut `2026-08-31d`
  dans le dépôt, `BACKEND_ATTENDU` vaut `2026-08-31b` dans l'outil. Vérifier ce
  qui est **réellement déployé** côté Apps Script avant de conclure à un bug.
- **Pas de tests automatisés, pas de CI.** Si le projet grossit encore, c'est le
  premier manque à combler.

---

## 15. Tenir ce fichier à jour

Ce document ne vaut que s'il est vrai. Mettez-le à jour dans **le même commit**
que le changement concerné quand :

- une nouvelle page, un nouvel onglet ou une nouvelle source de données apparaît ;
- une convention change (déploiement, nommage, format de version) ;
- **un bug vous coûte plus d'une heure** → une ligne dans §9, pour la personne
  suivante ;
- un chantier s'ouvre ou se referme → §13 et §14.

Pour une décision qui demande plus que quelques lignes, créer une note dans
`docs/` (une par sujet, datée, disant ce qui a été décidé **et ce qui a été
écarté**) et la référencer ici.
