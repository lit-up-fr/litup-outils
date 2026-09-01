# Page « Engagements financeurs »

*Note prise le 31/08/2026, à la demande de Laetitia. Complétée le même jour avec la
sélection d'indicateurs et la maille d'agrégation.*

> **Construit le 31/08/2026** — un onglet de test 🤝 Engagements existe désormais,
> avec les trois parties demandées : Définir, Suivre à date, Bilans passés. La
> structure de données réellement implémentée est décrite en fin de note.
> Les indicateurs qualitatifs demandent l'action `getIndicateurs` du backend
> (version 2026-08-31d, à redéployer) puis un ☁️ Charger → Airtable.

## Le besoin, tel qu'exprimé

Une page qui permette de :

1. **définir les engagements** pris envers un financeur — financiers **et** qualitatifs
   (nombre de personnes, nombre de programmes, heures d'activité, etc.) ;
2. **suivre les états d'avancement** de ces engagements ;
3. **faire des bilans** financiers et qualitatifs, en récupérant aussi les données
   qualitatives depuis Airtable.

## Ce qui existe déjà et sur quoi s'appuyer

### Côté outil

- **`D.airtableSubs` / `D.airtablePrestas`** — les financements viennent déjà
  d'Airtable, avec `rid` (identifiant stable du record), montant, statut de
  versement, et un compte bancaire de rattachement. C'est la brique « financeur ».
- **Les répartitions mémorisées (`D.splits`)** — depuis le 31/08, un financement
  éclaté sur plusieurs projets garde la trace de ses familles, de son périmètre et
  des codes servis. C'est exactement le lien « engagement → projets » dont le
  bilan a besoin : le réalisé financier par projet est déjà calculable.
- **`D.actHeures` + `D.actRid`** — heures d'action par code projet, reprises
  d'Airtable, avec l'identifiant du parcours.
- **Le suivi analytique** — charges et produits par compte × projet, avec la
  ventilation des salaires et des charges collectives. Le réalisé financier d'un
  engagement, c'est une coupe de ce tableau restreinte aux projets de l'engagement.
- **`finList()` / `finSansCompte()`** — inventaire des financements et détection de
  ceux qui n'ont pas de compte bancaire.

### Côté Airtable — indicateurs qualitatifs déjà présents

Table **`4. Parcours`** (`tbl7jv5UM8DPR5Sa6`), champs déjà calculés en rollup.
Ils couvrent presque tout ce qu'un financeur demande, sans nouvelle saisie :

| Champ | ID |
|---|---|
| Nb jeunes | `fldkCI8uAlpfWT04G` |
| Nb jeunes participants à la réalisation du projet | `fldTdkFw5cromcan8` |
| Nb jeunes participant à la séance bilan | `fldVDbpdwxgESu58k` |
| Nb jeunes participant à au moins 3 séances | `fldKrcuM7NBHhRRR0` |
| Nb jeunes participant à au moins 3 séances **ou** réalisation du projet | `fldDJjEJCqEnYNddu` |
| Nb jeunes participants à 10 séances ou plus | `fldO3d7o61Zu1WfuI` |
| Nb jeunes ayant une attestation de formation (présence) | `fldL9nsuw3XOu0Q7r` |
| Nb heures participants au boost up | `fldmjJAdlv05tRlxW` |
| Nb heures participants (séances > 3 ou participants au projet) | `fld1BpqS50WFL6eP8` |
| Nb heures participants au boost up avec attestation de présence | `flddNcvoOci8cEKF5` |
| Nb professionnels formés | `fldamIUcuiv5UcRRJ` |
| Nb heures formation | `fld8ZxcAC074NVHx3` *(déjà utilisé)* |
| BPF — heures externes / internes | `fldTAKWWwQE6s2PKY` / `fldLxcvaLyY8VvPTN` |
| Nb de partenaires experts | `fldDQROqqQfdoUbar` |

**Conséquence pratique :** l'essentiel du travail n'est pas de créer des
indicateurs, mais de **choisir lesquels** et de les **agréger sur les projets
rattachés à un engagement**. Le backend devra les demander dans
`getAirtableData` (ou une action dédiée `getIndicateurs`), comme on l'a fait pour
« Nb heures formation ».

### La sélection retenue — 31/08/2026

Un catalogue complet a été présenté en conversation (groupes A à G, construits
depuis les 136 champs numériques de la base). Laetitia en a retenu **sept**, en
posant explicitement : « on va garder uniquement la base, on verra après pour les
bilans plus complets ».

| Repère | Indicateur | Champ Airtable | Portée demandée |
|---|---|---|---|
| A1 | Nb jeunes | `fldkCI8uAlpfWT04G` | **BU** |
| A5 | Nb jeunes ≥ 3 séances **ou** réalisation du projet | `fldDJjEJCqEnYNddu` | **BU** |
| A10 | Nb professionnels formés | `fldamIUcuiv5UcRRJ` | **F2F** |
| B1 | Nb heures formation | `fld8ZxcAC074NVHx3` | tous |
| C1 | Nombre de séances prévues | `fldBNuqKffFQ6BbdS` | tous |
| F1 | Note globale | `fld3esPRw1A4M8tov` | tous |
| G1 | Coût réel programme | `fldauy8SrQZynRLuo` | tous |

Les sept sont des **rollups déjà calculés** sur `4. Parcours` : rien à créer dans
Airtable, seulement à demander côté backend. C'est le tri qui rend la première
version faisable — les indicateurs par jeune (table `2. Jeunes`) auraient
demandé une agrégation nouvelle.

Deux d'entre eux ne sont pas des compteurs de volume et se comportent
différemment dans un cumul :

- **F1 — Note globale** est une *appréciation*, pas une quantité. On ne
  l'additionne pas : sur plusieurs parcours elle se lit en **moyenne**, et il
  faut afficher sur combien de parcours cette moyenne est calculée, sinon un
  seul parcours noté fait illusion.
- **G1 — Coût réel programme** est un montant qui **double la comptabilité** de
  l'outil. Les deux chiffres n'ont pas la même source et n'ont aucune raison de
  coïncider au centime. À afficher côte à côte, jamais l'un à la place de
  l'autre.

### Le filtre par famille — conséquence de « A1, A5 pour les BU, A10 pour les F2F »

Un indicateur n'est donc pas une simple case à cocher : il porte un **filtre de
projets**. Sur un engagement couvrant 8 BU et 3 F2F, « Nb jeunes » n'agrège que
les 8 BU, et « Nb professionnels formés » que les 3 F2F. Sans ce filtre on
additionnerait des cellules vides et le chiffre serait faux — silencieusement,
ce qui est le pire cas.

Chaque cible reçoit donc une **`portee`** : soit une liste de préfixes de code
(`["BU"]`, `["F2F"]`), soit « tous les projets du périmètre qualitatif ». Elle
est pré-remplie par défaut selon l'indicateur, et modifiable — un financeur peut
demander « les jeunes des BU *et* des EXP ».

## Décisions — tranchées le 31/08/2026

Les trois réponses vont toutes vers le cas général. Aucune simplification n'est
donc possible sur ces trois axes ; autant le savoir avant de commencer.

1. **Un engagement est un objet propre.** « Il peut y avoir plusieurs versements
   pour un même engagement. » Il porte donc une liste de financements Airtable
   (par `rid`), et peut en porter **zéro** — une convention signée dont rien
   n'est encore arrivé est un engagement valide. Conséquence : le « reste à
   percevoir » est une donnée à part entière, et l'engagement ne peut pas être
   une simple extension de `D.airtableSubs`.

2. **Deux périmètres distincts, chacun en codes et/ou familles.** « Ça dépend des
   financements, les deux sont possibles. » Il faut donc *deux* sélections :
   - le **périmètre financier** — sur quoi la subvention est imputée ;
   - le **périmètre qualitatif** — sur quoi les indicateurs sont comptés.
   Ils coïncident souvent, mais pas toujours (« financé sur 11 parcours, rendre
   compte sur tous les parcours du Var »). L'interface doit permettre de dire
   « le même que le financier » en un clic, sinon la saisie sera pénible.

3. **Pluriannuel, et sur la période propre de l'engagement.** « Il faudra
   agréger les programmes concernés sur la durée de l'engagement (parfois de
   juin à juin, sur 2 années). »

   Cette précision **remplace** la découpe par exercice esquissée d'abord ici.
   L'axe d'agrégation est la période conventionnée (`du` → `au`), pas l'exercice
   comptable. Une ventilation par exercice reste utile en second rideau quand le
   financeur l'écrit (« 300 jeunes sur trois ans, dont 100 en 2026 »), mais ce
   n'est plus la maille de référence.

   Les deux moitiés ne sont pas de même difficulté :

   - **Financier — direct.** Les écritures sont datées ; la coupe du 01/06/2026
     au 31/05/2027 se fait sans détour. Réserve à écrire dans la page : ce total
     traverse deux exercices, il ne se retrouvera donc dans **aucun** tableau
     annuel de l'outil. C'est correct, mais ça se lit comme une incohérence si
     on ne le dit pas.
   - **Qualitatif — approximation assumée.** Les rollups Airtable **ne sont pas
     datés** : « Nb jeunes » d'un parcours est son total, pas sa part de juin à
     décembre. On ne peut donc pas découper *à l'intérieur* d'un parcours. La
     règle retenue : retenir les parcours **dont les dates tombent dans la
     période** (début `fldRc5jvycrucZGyY` / fin `fldx69vwn1zxoe5u0`) et prendre
     leur total. Un parcours à cheval sur une borne est donc dedans ou dehors,
     **en entier**. Si un financeur exige un prorata, il faudra le saisir à la
     main sur ce parcours-là, et le marquer comme saisie manuelle.

### Le piège du périmètre dynamique

Un périmètre défini par **famille** est vivant : un parcours qui rejoint la
famille entre automatiquement dans le périmètre de l'engagement. C'est ce qu'on
veut pour un suivi courant (« tous les parcours du Var »), mais c'est un problème
pour un bilan déjà transmis à un financeur : le chiffre change après l'envoi.

D'où la règle : **le suivi est vivant, le bilan est figé**. Un bilan produit
enregistre la liste des projets retenus et les valeurs lues, avec sa date. Le
suivi continue d'évoluer à côté, sans réécrire le bilan.

Laetitia a confirmé et renforcé cette règle le 31/08 : « certains bilans sont
demandés en avance. Il faut figer certains bilan, à savoir garder une copie de
ce qui a été envoyé au financeur à la date défini, mais avoir la possibilité de
continuer à faire vivre le projet avec d'autres éventuels financeurs, charges,
etc. »

Le fait que des bilans soient demandés **avant la fin de la période** est
justement l'argument décisif : au moment de l'envoi, les chiffres sont
provisoires *par construction*. Un bilan figé n'est donc pas une commodité
d'archivage, c'est la seule façon de savoir plus tard ce qui a réellement été
transmis. Conséquence d'interface : un bilan figé s'affiche en lecture seule,
avec sa date bien visible, et l'écart avec le suivi courant est une information
utile — pas une erreur à corriger.

## Esquisse de structure de données (à valider)

```javascript
D.engagements = [{
  id, financeur, libelle, ref,        // ref = n° de convention
  du, au,                              // période, éventuellement pluriannuelle
  exercices: ["2026","2027","2028"],  // dérivable de du/au, mais explicite = plus sûr

  // ── financier ──
  rids: ["rec…"],                      // financements Airtable rattachés (0..n)
  mtEngage,                            // montant total conventionné
  parExercice: { "2026": 40000, "2027": 40000 },  // OPTIONNEL, second rideau
  perimFin:  { projets:[], familles:[] },

  // ── qualitatif ──
  perimQual: { memeQueFin:true, projets:[], familles:[] },
  cibles: [{
    cle:"fldkCI8uAlpfWT04G",           // champ Airtable, ou "manuel"
    lib:"Nb jeunes", unite:"personnes",
    portee:{ pfx:["BU"] },             // filtre de projets — cf. « A1, A5 pour les BU »
    cumul:"somme",                     // "somme" | "moyenne" (note globale) | "manuel"
    total:300, parExercice:{ "2026":100, "2027":200 }   // total = la référence
  }],

  jalons: [{ date, libelle, fait:false }],
  bilans: [{ date, exercice, projets:[], valeurs:{}, mtPercu, note }],  // photos figées
  notes
}]
```

Le **réalisé courant** n'est jamais stocké : il se recalcule à la demande depuis
les écritures (financier) et depuis Airtable (qualitatif). Même principe que
partout ailleurs dans l'outil — une seule source de vérité, pas de chiffre
recopié qui finit par diverger. Seuls les **bilans** sont figés, et ils le sont
explicitement, avec leur date et la liste des projets retenus.

`du`/`au` sont la maille d'agrégation ; `exercices` et les `parExercice` ne
servent qu'à restituer une cible que le financeur a lui-même exprimée par année.
Un engagement de juin à juin n'a donc **pas** besoin d'être découpé pour être
suivi.

## Points de vigilance identifiés d'avance

- **Ne pas dupliquer les indicateurs Airtable dans l'outil.** Les recopier
  créerait deux vérités. Les lire, les afficher, dater la lecture.
- **Un bilan est daté.** Un financeur veut « au 31/12 ». Il faudra donc pouvoir
  figer une photo (export), sans que cette photo devienne la donnée de référence.
- **Les engagements en nature** (mise à disposition, valorisation du bénévolat)
  ne sont ni dans la compta ni dans Airtable : prévoir une saisie manuelle
  assumée, marquée comme telle.
- **Un même parcours peut servir deux financeurs.** Le comptage qualitatif n'est
  alors pas additif entre engagements — il faudra le dire explicitement plutôt
  que de laisser croire à un total consolidé.
- **Une cellule Airtable vide n'est pas un zéro.** Sur « Nb heures formation »,
  on sait déjà que 14 parcours actifs sont à remplir. Un total qui agrège du
  vide comme du zéro donne un chiffre plausible et faux — il faut afficher
  « n parcours sur m renseignés » à côté de chaque cible, comme on l'a fait
  pour les heures d'action.
- **Vérifier le taux de remplissage des sept indicateurs retenus** sur les
  parcours 2026 *avant* de construire la page. Si l'un d'eux est vide presque
  partout, mieux vaut le savoir maintenant que le découvrir dans un bilan.

## Ce qui a été implémenté — 31/08/2026

Trois parties, dans l'ordre où le travail se fait, sur la maquette proposée par
Laetitia : *« une partie pour renseigner et associer à un financement existant,
une partie pour suivre à date avec un tableau de bord par rapport à l'attendu à
date (figeable pour un bilan), une dernière pour retrouver les bilans passés. »*

```javascript
D.engagements = [{
  id, financeur, libelle, ref, du, au,     // la PÉRIODE est la maille, pas l'exercice
  rids: ["rec…"],                          // financements Airtable rattachés (0..n)
  mtEngage,
  perimFin:  { codes:[], familles:[] },
  perimQual: { memeQueFin:true, codes:[], familles:[] },
  cibles: [{ cle, lib, unite, cumul:"somme"|"moyenne",
             portee:{ pfx:["BU"] },        // A1/A5 sur les BU, A10 sur les F2F
             total }],
  bilans: [{ date, libelle, codes:[], valeurs:{}, fin:{…}, note, fige }],
  notes
}]
D.actIndic      = { "BU91": { "fldkCI8uAlpfWT04G": 12, … } }   // repris d'Airtable
D.actIndicDates = { "BU91": { du:"2026-09-01", au:"2026-12-15" } }
```

### Décisions prises pendant la construction

- **L'attendu à date** est un prorata linéaire du temps écoulé, faute de jalons
  déclarés par le financeur. C'est écrit dans la page : sur une activité
  saisonnière, un été creux fera toujours apparaître un retard. Des jalons
  explicites restent à ajouter si un financeur en impose.
- **Le perçu ne se devine pas.** Il est calculé sur les crédits portant la trace
  d'un des financements rattachés. Sans rattachement il reste à zéro et la page
  le dit, plutôt que de gonfler le perçu avec les recettes d'un autre financeur.
- **Une note se lit en moyenne, pas en somme**, et le nombre de parcours notés
  est affiché à côté : un seul parcours noté 4,8 donnerait l'illusion d'un
  excellent programme.
- **Une cellule Airtable vide n'est pas un zéro.** Chaque cible affiche sa
  couverture (« 3 / 5 renseignés »), parce qu'un total qui agrège du vide est
  plausible et faux.
- **Coupe à la date, des deux côtés.** Un parcours qui n'a pas commencé à la date
  du bilan ne compte pas — sinon le financier s'arrêtait à la date et le
  qualitatif comptait l'avenir : deux moitiés du même bilan qui ne parlaient pas
  du même moment.
- **Un parcours est retenu s'il CHEVAUCHE la période**, pas si ses deux bornes y
  tombent : tester les bornes écartait un parcours démarré avant et fini après,
  c'est-à-dire celui qui couvre le mieux la période.
- **Un bilan figé ne se reconstitue pas.** Sa suppression est refusée sans
  confirmation explicite, et supprimer un engagement qui en porte est refusé
  tout court.

## Affectation du montant conventionné (côté financeur)

Ajouté le 01/09/2026. La part réservée d'une enveloppe de frais se saisissait
projet par projet ; la convention, elle, se lit dans l'autre sens : « la CAF
donne 20 000 €, dont 50 % sur les frais généraux ». C'est la même réservation
vue de l'autre bout, et la convention fait foi.

### Décisions prises

- **Quatre destinations, et deux comportements.** Frais généraux, frais locaux
  (FV/FP) et LAB sont des enveloppes à répartir : y affecter une part du
  financement la réserve au périmètre de la convention, et le reste de
  l'enveloppe se répartit sur les autres projets. « Charges directes du projet »
  ne déplace rien — ces charges sont déjà sur le projet : la part sert de
  contrôle. Le choix des destinations a été arbitré avec Laetitia : pas de
  ciblage par famille de comptes ni compte à compte, qui aurait demandé une
  saisie détaillée par convention.
- **Le solde va aux charges directes.** Le total fait donc toujours 100 %, il n'y
  a pas de case à équilibrer ni d'état d'erreur à gérer.
- **Une convention à cheval se découpe au prorata des jours.** Juin 2026 → mai
  2027 pèse 214/365 sur l'exercice 2026. C'est le même prorata linéaire que
  l'attendu à date — une convention de lecture, pas une vérité : le montant de
  chaque exercice est affiché et corrigeable à la main.
- **La convention prime, la saisie manuelle déroge.** Un montant tapé dans la
  modale des frais remplace ce que la convention réserve, et c'est écrit dans la
  ligne (« dérogation à la main · la convention dit 8 000 € ») ; vider la case y
  revient.
- **Deux enveloppes pour une destination.** « Frais locaux » alimente FV et FP :
  la part se partage entre elles au prorata des heures de chaque territoire dans
  le périmètre, sinon une convention sur des projets du Sud viendrait réserver
  sur l'Île-de-France.
- **Une part qui ne se pose nulle part est signalée.** Si aucun projet du
  périmètre ne reçoit l'enveloppe sur l'exercice, le montant n'est pas posé et la
  modale le dit — sans quoi la répartition repartirait au prorata sans que
  personne ne comprenne pourquoi.
- **Le contrôle se fait à date.** Comparer le montant total affecté aux charges
  déjà dépensées ferait crier au manque jusqu'au dernier jour de la convention :
  le contrôle porte sur l'affecté à date, le total restant affiché à côté.
- **Le bilan figé garde l'affectation** — % , montants affectés, affecté à date
  et charges en face — et l'export CSV la reprend : un bilan relu dans deux ans
  doit dire sur quoi le financeur avait mis son argent.

### Ce qui reste ouvert


- `getIndicateurs` doit être redéployé côté Apps Script pour que six des sept
  indicateurs remontent (seules les heures de formation sont déjà rapatriées).
- Les **jalons** du financeur, si l'attendu linéaire ne suffit pas.
- Les **engagements en nature** (mise à disposition, valorisation du bénévolat) :
  ni dans la compta ni dans Airtable, à saisir à la main et à marquer comme tel.
- Un **export du bilan en document** plutôt qu'en CSV, si un financeur impose un
  format.
