# À faire — page « Engagements financeurs »

*Note prise le 31/08/2026, à la demande de Laetitia. Rien n'est développé.*

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

3. **Pluriannuel.** L'engagement porte une période qui peut couvrir plusieurs
   exercices. Conséquence structurante : **les cibles doivent être ventilables
   par exercice** — un financeur écrit « 300 jeunes sur trois ans, dont 100 en
   2026 ». Il faut donc, pour chaque cible, une valeur totale *et* une valeur
   par exercice, et un avancement lisible dans les deux vues. Le réalisé
   financier suit la même règle : par exercice et cumulé.

### Le piège du périmètre dynamique

Un périmètre défini par **famille** est vivant : un parcours qui rejoint la
famille entre automatiquement dans le périmètre de l'engagement. C'est ce qu'on
veut pour un suivi courant (« tous les parcours du Var »), mais c'est un problème
pour un bilan déjà transmis à un financeur : le chiffre change après l'envoi.

D'où la règle : **le suivi est vivant, le bilan est figé**. Un bilan produit
enregistre la liste des projets retenus et les valeurs lues, avec sa date. Le
suivi continue d'évoluer à côté, sans réécrire le bilan.

## Esquisse de structure de données (à valider)

```javascript
D.engagements = [{
  id, financeur, libelle, ref,        // ref = n° de convention
  du, au,                              // période, éventuellement pluriannuelle
  exercices: ["2026","2027","2028"],  // dérivable de du/au, mais explicite = plus sûr

  // ── financier ──
  rids: ["rec…"],                      // financements Airtable rattachés (0..n)
  mtEngage,                            // montant total conventionné
  parExercice: { "2026": 40000, "2027": 40000, "2028": 20000 },
  perimFin:  { projets:[], familles:[] },

  // ── qualitatif ──
  perimQual: { memeQueFin:true, projets:[], familles:[] },
  cibles: [{
    cle:"fldkCI8uAlpfWT04G",           // champ Airtable, ou "manuel"
    lib:"Nb jeunes", unite:"personnes",
    total:300, parExercice:{ "2026":100, "2027":100, "2028":100 }
  }],

  jalons: [{ date, libelle, fait:false }],
  bilans: [{ date, exercice, projets:[], valeurs:{}, mtPercu, note }],  // photos figées
  notes
}]
```

Le **réalisé courant** n'est jamais stocké : il se recalcule depuis les écritures
(financier) et depuis Airtable (qualitatif). Seuls les **bilans** sont figés, et
ils le sont explicitement, avec leur date et la liste des projets retenus.

Le **réalisé** ne serait jamais stocké : il se recalcule à la demande depuis les
écritures (financier) et depuis Airtable (qualitatif). Même principe que partout
ailleurs dans l'outil — une seule source de vérité, pas de chiffre recopié qui
finit par diverger.

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
