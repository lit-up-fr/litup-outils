# Outils de veille Lit uP : cahier des charges

État au 25 septembre 2026. Document de travail, à valider avant développement.

Fichiers de paramétrage dans ce dossier (à importer dans le Google Sheet, séparateur `;`) :

| Fichier | Contenu |
|---|---|
| `profils-veille-financements.csv` | Les 4 profils projets qui servent au tri |
| `sources-veille-financements.csv` | 52 sources (AAP publics, Europe, AAP privés, lettres de fondations, nouveaux fonds, appels d'offres) |
| `sources-veille-qualiopi.csv` | 19 sources rangées par indicateur Qualiopi |

## 1. Navigation dans litup-outils

Page d'accueil : un nouveau bouton **« Outils de veille »**, qui ouvre un choix :

- **Veille financements** (`litup_veille_financements.html`)
- **Veille Qualiopi** (`litup_veille_qualiopi.html`)

Même architecture que les outils NDF : pages HTML autonomes, backend Apps Script, données dans le Google Sheet. Même mot de passe que la direction, ou un mot de passe dédié (à trancher).

## 2. Veille financements

### 2.1 Ce que l'outil couvre

1. **AAP publics et privés** : Aides-territoires, Régions, Départements, Politique de la Ville, Europe, fondations.
2. **Nouveaux fonds de dotation et fondations** : repérage des fonds déclarés au Journal officiel (JOAFE) dont l'objet touche nos sujets, même sans AAP ouvert. Un fonds repéré va dans une liste « à contacter », pas dans la liste des AAP.
3. **Quelques appels d'offres** : BOAMP filtré sur la formation et l'accompagnement des jeunes, plus Maximilien (IDF) et la plateforme de la Région Sud.

### 2.2 Chaîne de traitement

```
Chaque nuit (Apps Script, déclencheur horaire)
  1. Collecte     API (Aides-territoires, BOAMP, JOAFE, UE) + pages + mails du libellé Gmail « Veille AAP »
  2. Extraction   Haiku transforme chaque annonce en fiche : financeur, titre, date limite, montant, public, territoire, lien
  3. Dédoublonnage  même financeur + titre proche + même date limite = une seule fiche (on garde toutes les sources)
  4. Tri          pré-filtre de la grille go/no-go (public, thème, territoire, délai) puis note de 0 à 100 par profil
  5. Écriture     onglet « Veille_AAP » (ou « Veille_Fonds » / « Veille_AO »)
Chaque lundi
  6. Mail récapitulatif : nouvelles pistes notées 60 et plus, triées par date limite
Chaque jour
  7. Alertes : date limite à 6 semaines et à 2 semaines pour les pistes marquées « À étudier » ou « GO »
```

### 2.3 Onglets du Sheet

- `Veille_Profils` : contenu de `profils-veille-financements.csv`
- `Veille_Sources` : contenu de `sources-veille-financements.csv`, plus les colonnes `actif` (oui/non), `derniere_collecte`, `nb_pistes_retenues`
- `Veille_AAP` : `id`, `date_detection`, `source_ids`, `financeur`, `titre`, `lien`, `date_limite`, `montant_min`, `montant_max`, `public`, `territoire`, `profil_principal`, `note`, `raison_note` (1 phrase de Haiku), `statut` (Nouveau / À étudier / GO / NO-GO / Déposé / Obtenu / Refusé), `montant_demande`, `montant_obtenu`, `commentaire`
- `Veille_Fonds` : `id`, `date_detection`, `nom`, `objet`, `departement`, `lien_joafe`, `taille_estimee`, `note`, `statut` (Nouveau / À contacter / Contacté / Sans suite)
- `Veille_AO` : même structure que `Veille_AAP`, plus `acheteur`, `code_cpv`, `date_remise`

Les colonnes `montant_demande` et `montant_obtenu` donnent directement les chiffres du mix de financement et de la dépendance à un même financeur.

### 2.4 Page « Veille financements »

- Liste des pistes par onglet (AAP, Fonds, Appels d'offres), filtres par profil, note, statut et date limite
- Sur chaque piste : boutons « À étudier », « NO-GO », et « Qualifier » qui prépare la fiche go/no-go
- Écran « Sources » : activer ou désactiver une source, voir la dernière collecte et le nombre de pistes retenues (pour supprimer les sources qui n'apportent rien)

### 2.5 À terme : outil de réponse aux AAP

Pour une piste en GO, l'outil prépare un premier jet de dossier à partir de trois corpus :

1. **La trame du dossier demandé** (PDF, Word ou formulaire du financeur, déposé dans l'outil)
2. **Le corpus des réponses déjà faites** (dossier Drive des candidatures passées, découpé par rubrique)
3. **Les « projets à faire financer »** : une liste tenue par Lit uP (onglet `Projets_a_financer` : nom, profil, besoin en euros, période, état d'avancement, pièces associées)

Le premier jet respecte les limites de caractères du gabarit et signale les chiffres à vérifier. On le construit une fois la veille rodée : il dépend du même Sheet et des mêmes profils.

## 3. Veille Qualiopi

### 3.1 Ce que dit le référentiel

Les trois veilles du critère 6 restent obligatoires pour tous les prestataires :

| Indicateur | Libellé (guide de lecture V9) | Niveau attendu |
|---|---|---|
| **23** | Veille légale et réglementaire sur le champ de la formation professionnelle, et exploitation des enseignements | Mise en place de la veille, sa prise en compte par le prestataire et sa communication en interne |
| **24** | Veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d'intervention, et exploitation des enseignements | Mise en place de la veille et son impact éventuel sur les prestations |
| **25** | Veille sur les innovations pédagogiques et technologiques permettant une évolution des prestations, et exploitation des enseignements | Mise en place de la veille et son impact éventuel sur les prestations |

L'indicateur 26 (handicap) n'est pas une veille, mais ses évolutions se suivent avec les mêmes sources (voir `sources-veille-qualiopi.csv`, Q19).

### 3.2 Nouveau référentiel au 1er novembre 2026 (à intégrer tout de suite)

- **Décret n° 2026-728 du 1er août 2026**, publié au Journal officiel le 4 août 2026. Il s'applique aux audits réalisés à partir du **1er novembre 2026** ; le référentiel actuel et le guide de lecture V9 restent valables jusqu'au 31 octobre.
- Les 7 critères restent les mêmes. **12 indicateurs sont modifiés** (1, 2, 3, 12, 14, 15, 19, 20, 27, 32 d'après les analyses publiées ; liste à confirmer sur le texte officiel) et un **indicateur 33** est créé pour les CFA (hors champ Lit uP).
- **Les indicateurs 23, 24 et 25 ne sont pas modifiés**, d'après les mêmes analyses.
- Ce qui change pour tout le monde : procédures obligatoires contre les violences sexuelles, le harcèlement et les discriminations ; transparence sur la méthode de calcul des résultats affichés ; information accessible, détaillée et vérifiable ; conformité des sous-traitants et intervenants ; suivi du distanciel.
- **L'audit contrôle désormais l'effectivité** : il ne suffit plus d'avoir le document, il faut montrer que la procédure est appliquée. C'est exactement ce que doit prouver l'outil (étape 4 ci-dessous).
- Guide de lecture V10 et deux arrêtés complémentaires : attendus avant le 1er novembre, à surveiller (source Q02).

> Ce décret est lui-même un parfait premier élément de veille indicateur 23 : il sert de cas test pour l'outil.

### 3.3 Chaîne en 5 étapes

```
1. Veille        collecte automatique (RSS, pages, lettres d'information, Légifrance) + saisie manuelle
                 (salon, webinaire, échange avec une chercheuse)
2. Suggestion    Haiku résume l'info, la range dans l'indicateur 23, 24 ou 25, et propose 0 à 3 changements
                 concrets pour Lit uP (document à mettre à jour, pratique à adapter, info à diffuser en interne)
3. Décision      pour chaque suggestion : Retenue / Écartée (motif obligatoire, court) / Déjà en place
                 + responsable + échéance
4. Effectivité   le changement est fait : date, ce qui a été modifié, pièce jointe (nouvelle version du
                 document, compte rendu de réunion d'équipe, capture, mail de diffusion)
5. Preuve        export PDF du registre de veille par indicateur et par période, prêt pour l'audit
```

Écarter une suggestion avec un motif est aussi une preuve : l'auditeur veut voir que l'info a été lue, analysée et exploitée (ou jugée sans impact, pour une raison).

### 3.4 Onglets du Sheet

- `Qualiopi_Sources` : contenu de `sources-veille-qualiopi.csv`
- `Qualiopi_Veille` : `id`, `date`, `indicateur` (23 / 24 / 25), `source_id`, `titre`, `lien`, `resume`, `impact_litup` (Aucun / Faible / Fort), `saisie` (auto / manuelle)
- `Qualiopi_Actions` : `id`, `veille_id`, `changement_propose`, `decision` (Retenue / Écartée / Déjà en place), `motif`, `responsable`, `echeance`, `date_realisation`, `description_realisation`, `preuve_url` (fichier dans le Drive), `diffuse_equipe` (oui/non, date)

### 3.5 Page « Veille Qualiopi »

- Trois colonnes ou onglets : 23 Réglementaire, 24 Métiers et emplois, 25 Pédagogie et technologie
- Chaque info montre ses suggestions, avec les boutons Retenir / Écarter / Déjà en place
- Tableau « Actions en cours » avec échéances ; dépôt de la preuve au moment de clôturer une action (upload vers un dossier Drive « Qualiopi / Preuves de veille », avec le même mécanisme que les justificatifs NDF)
- Bouton **« Télécharger le registre de veille »** : PDF par période et par indicateur (généré par Apps Script, comme le récap NDF), avec pour chaque ligne l'info, la décision, la réalisation et le lien vers la preuve

## 4. Points à trancher

1. Mot de passe : même accès que la direction ou accès dédié (pour ouvrir la veille Qualiopi à l'équipe formation) ?
2. Nom du certificateur Qualiopi et de l'OPCO de Lit uP (sources Q06, Q07)
3. Adresse Gmail qui reçoit les lettres d'information (boîte dédiée « veille@ » ou libellé dans une boîte existante)
4. Ordre de développement proposé : Qualiopi d'abord (échéance du 1er novembre, petit volume, gros enjeu d'audit), puis financements
