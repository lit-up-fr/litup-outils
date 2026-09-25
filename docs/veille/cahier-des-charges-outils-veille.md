# Outils de veille Lit uP : cahier des charges

État au 25 septembre 2026. **Veille financements : version 1 construite** (page `litup_veille_financements.html`, script `apps-script/veille.gs`). Veille Qualiopi : à construire.

Fichiers de référence dans ce dossier (séparateur `;`) :

| Fichier | Contenu |
|---|---|
| `profils-veille-financements.csv` | Les 4 profils projets qui servent au tri (repris dans l'onglet `Veille_Profils`, modifiable) |
| `sources-veille-financements.csv` | 57 sources de référence ; celles marquées API ou Annuaire sont collectées automatiquement, les autres se suivent par leur lettre d'information (libellé Gmail « Veille AAP ») |
| `sources-veille-qualiopi.csv` | 19 sources rangées par indicateur Qualiopi |
| `mockup-veille-financements-v1.html` | Maquette validée : options A (cartes) et B (étapes) retenues toutes les deux |

## 1. Navigation dans litup-outils

Page d'accueil : bouton **« Outils de veille »**, qui ouvre un choix :

- **Veille financements** (`litup_veille_financements.html`), mot de passe direction
- **Veille Qualiopi** : affichée « Bientôt disponible »

## 2. Veille financements (v1)

### 2.1 Sources collectées automatiquement

| Id | Source | Accès | Ce qui est collecté |
|---|---|---|---|
| F01 | Aides-territoires | API (clé personnelle) | Aides ouvertes aux associations, périmètres Var, Seine-Saint-Denis, Paris (et les aides nationales et régionales qui les couvrent) |
| D01 | JOAFE (Journal officiel) | API DILA, sans clé | Créations et modifications de **fonds de dotation** dont l'objet parle de jeunes, décrochage, insertion, égalité des chances… ; créations de **fondations d'entreprise** et partenariales (avec le nom des entreprises fondatrices) |
| M01 | BOAMP | API DILA, sans clé | Avis de marché PACA et Île-de-France sur l'accompagnement et l'insertion des jeunes, les Missions Locales, la formation des professionnels |
| N00 | Lettres d'information | Gmail, libellé « Veille AAP » | L'IA extrait les appels annoncés dans chaque lettre (fondations, Carenews, CFF, Avise, réseaux…) |
| A01 | Fondation de France | Annuaire + plan du site | Les ≈ 780 fondations abritées (description complète de chaque fondation) |
| A02 | Fondation Caritas France | Plan du site | Les ≈ 100 fondations abritées |
| A03 | Un Esprit de Famille | Page des membres | Les ≈ 190 fondations familiales membres (nom et thèmes seulement) |
| C01 | Carenews | Pages de liste | Les appels à projets des 3 premières pages (les plus récents, ≈ 15 à 25 appels), financeur lu dans le lien |

Non collectables automatiquement (applications qui ne s'affichent que dans un navigateur) : les appels à projets du Centre français des Fonds et Fondations, qui viennent de **Yes Association** (yesasso.org), et l'annuaire du CFF. Ils se suivent par leurs lettres d'information (libellé Gmail « Veille AAP »).

Mesures faites le 25/09/2026 : 1 288 fonds de dotation créés avec ces mots-clés dans leur objet depuis 2009, dont 729 en PACA et Île-de-France, et 82 depuis janvier 2026 (≈ 9 par mois) ; ≈ 50 avis BOAMP pertinents en 4 mois.

Pour les annuaires, la première nuit lit 30 fiches par annuaire, puis 30 de plus chaque nuit : le stock est parcouru en 3 à 4 semaines, ensuite seules les nouvelles fondations sont lues. Pour le stock des fonds de dotation, exécuter une fois `veilleChargerStockFonds` (≈ 775 fonds, par lots de 40).

### 2.2 Chaîne de traitement

```
Chaque nuit vers 3 h (Apps Script)
  1. Collecte       les 8 sources ci-dessus
  2. Dédoublonnage  une annonce déjà vue (même source + même référence, ou même financeur + même titre) est ignorée
  3. Pré-filtre     une annonce sans aucun mot de nos sujets n'est pas envoyée à l'IA (économie)
  4. Notation       Haiku note de 0 à 100 au regard des 4 profils, donne le profil, la raison en une phrase,
                    la date limite et le montant s'il les trouve ; pour un fonds : opérateur ou redistributeur
  5. Enrichissement fonds notés 50 et plus : SIREN et adresse du siège (Annuaire des entreprises)
  6. Écriture       onglet Veille_Pistes (seulement les notes ≥ 30)
Chaque lundi à 8 h   mail récapitulatif : nouvelles pistes notées ≥ 60, par type, triées par date limite
Chaque jour à 8 h    alertes à 6 puis 2 semaines de la date limite (pistes « À étudier » et « GO »)
```

### 2.3 Onglets du Sheet (créés par `veilleInstaller`)

- `Veille_Profils` : les 4 profils ; on peut y modifier mots-clés, exclusions, territoires, montants sans toucher au code
- `Veille_Sources` : `id`, `nom`, `type`, `acces`, `actif`, `curseur`, `derniere_collecte`, `collectees`, `retenues`, `derniere_erreur`
- `Veille_Pistes` (un seul onglet pour les 3 types) : `id`, `type` (AAP / FONDS / AO), `source`, `ref_externe`, `date_detection`, `financeur`, `titre`, `lien`, `date_limite`, `montant`, `territoire`, `objet`, `profil`, `note`, `raison`, `nature`, `siren`, `adresse`, `statut`, `issue`, `commentaire`, `maj_le`, `maj_par`, `alertes`, `comptes_pdf`, `analyse_comptes` (JSON)
- `Veille_Vus` : fiches d'annuaire déjà lues (pour ne pas les relire)

Étapes (`statut`) : nouveau → etude → go → depose → clos. Libellés adaptés au type : pour un fonds, « À contacter » puis « Contacté » ; pour un appel d'offres, « Offre remise ». À la clôture, une issue est demandée (NO-GO / Obtenu / Refusé / Sans suite, ou équivalents) avec un motif.

Le suivi des montants demandés et obtenus reste dans **Airtable (3.2 Suivi subventions)**, déjà relié au suivi comptable : la veille s'arrête au dépôt. Une passerelle « Déposé → créer la ligne dans Airtable 3.2 » est possible ensuite.

### 2.4 Page « Veille financements »

- Deux vues au choix, mémorisées par appareil : **Cartes** (option A, pensée pour le téléphone) et **Étapes** (option B, colonnes avec glisser-déposer sur ordinateur et menu d'étape sur téléphone)
- Onglets Appels à projets / Nouveaux fonds / Appels d'offres ; filtres profil, note, statut, recherche
- Sur chaque carte : note, raison, profil, date limite (liseré rouge sous 6 semaines), boutons d'étape, commentaire
- **📋 Fiche go/no-go** : copie un texte prêt à coller dans Claude (agent subventions) pour produire la fiche de qualification
- **🔎 Chercher le fonds** (fonds) : liens vers l'Annuaire des entreprises, une recherche web, la page LinkedIn du fonds et l'annonce au JO
- Vue **Sources** : état de chaque source, erreurs, activation, bouton « Lancer la collecte maintenant »

### 2.5 Dirigeants, contacts et dotation des fonds : ce qui est possible

- **Dirigeants** : l'Annuaire des entreprises ne donne pas les dirigeants des fonds de dotation et fondations (testé : liste vide), et le JOAFE ne publie pas de noms. Les noms se trouvent sur le site du fonds, dans son rapport annuel ou ses comptes publiés.
- **LinkedIn et adresses mail** : pas de collecte automatique. Aspirer LinkedIn est interdit par ses conditions d'utilisation, et la CNIL a sanctionné Kaspr (240 000 €, décembre 2024) pour avoir constitué des fichiers de contacts à partir de LinkedIn. Deviner ou acheter des adresses nominatives expose aux mêmes risques. L'outil propose donc des **recherches manuelles** (bouton « Chercher le fonds ») ; on contacte via l'adresse ou le formulaire publiés par le fonds, ou par LinkedIn en se présentant.
- **Comptes annuels : analyse à la demande (bouton « 📊 Analyser les comptes » d'un fonds).** Le JOAFE recense les dépôts de comptes par SIREN (source « dca ») et le PDF se télécharge à une adresse fixe : `journal-officiel.gouv.fr/telechargements/ASSOCIATIONS/DCA/PDF/{année}/{jjmm}/{SIREN}_{jjmmaaaa}.pdf` (testé le 25/09/2026). L'outil prend le dernier dépôt, le fait lire par Claude (Opus 5, effort bas, repli automatique en cas de refus) et enregistre : ressources, dons, produits financiers, dotation, **montant redistribué**, nombre de projets, **taille habituelle des aides**, part redistribuée, domaines, exemples de bénéficiaires, **fourchette à solliciter** avec sa justification, points d'attention. Limites : un fonds créé depuis moins d'un an n'a pas encore de comptes ; une **fondation abritée** n'a pas de comptes propres (ils sont dans ceux de la Fondation de France ou de Caritas) ; les petits fonds sont parfois en retard de dépôt. Coût : de l'ordre de quelques dizaines de centimes à 1 € par analyse selon l'épaisseur du PDF (tarif Opus 5 : 5 $ par million de jetons en entrée), d'où une analyse à la demande et non systématique.
- **Capital de départ (dotation initiale)** : n'apparaît ni dans l'Annuaire des entreprises (le capital n'existe que pour les sociétés) ni dans l'annonce du JO (vérifié : objet, siège et numéro RNF seulement). La loi impose une dotation initiale d'au moins 15 000 €. La taille réelle d'un fonds se lit dans ses **comptes annuels**, que tout fonds de dotation doit publier au Journal officiel (à partir de sa première année close).

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
