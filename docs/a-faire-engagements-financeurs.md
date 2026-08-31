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

## Décisions à prendre avant de coder

Ces trois choix déterminent la structure ; y répondre évite de tout refaire.

1. **La maille d'un engagement.** Un engagement porte-t-il sur *un* financement
   Airtable, sur *plusieurs* (une convention pluriannuelle versée en tranches),
   ou existe-t-il indépendamment (une convention signée dont aucun versement
   n'est encore arrivé) ? La réponse décide si l'engagement est un objet propre
   avec ses propres identifiants, ou une extension des financements existants.

2. **Le rattachement aux projets.** Un engagement vise-t-il des **codes projets**,
   des **familles**, ou les deux ? Les répartitions mémorisées donnent déjà le
   lien financier ; reste à savoir si le périmètre qualitatif est le même
   (« les 11 parcours financés ») ou plus large (« tous les parcours du Var »).

3. **Le pluriannuel.** Un engagement sur 2026-2028 se suit-il comme un tout, ou
   par exercice ? Cela conditionne l'affichage de l'avancement et la façon dont
   le budget prévisionnel s'y raccroche.

## Esquisse de structure de données (à valider)

```javascript
D.engagements = [{
  id, financeur, libelle,
  rids: ["rec…"],              // financements Airtable rattachés
  du, au,                       // période de l'engagement
  mtEngage,                     // montant conventionné
  projets: ["BU91 - …"],        // codes projets visés
  familles: ["sud-jeunes"],     // ou familles
  cibles: [{ cle:"fldkCI8uAlpfWT04G", lib:"Nb jeunes", valeur:120, unite:"personnes" }],
  jalons: [{ date, libelle, fait:false }],
  notes
}]
```

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
