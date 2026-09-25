# Installer la veille financements

Temps estimé : 30 minutes, à faire une seule fois.

La veille a son **propre Google Sheet et son propre script**, séparés de la compta : le fichier NDF / Compta n'est pas modifié.

**Deux comptes, deux rôles :**
- **laetitia.deborde@** crée le Sheet et en reste propriétaire (étape 1).
- **developpement@** fait l'installation et le déploiement (étapes 2 à 4). Un script agit avec les droits de la personne qui l'installe : c'est ce qui permet de lire la boîte developpement@, et seulement elle. Garde-fou dans le code : si le script tourne sous un autre compte, les mails ne sont pas lus et une erreur s'affiche dans ⚙ Sources.

Astuce : ouvrir developpement@ dans une fenêtre de navigation privée (ou un autre profil Chrome) pour ne pas mélanger les deux comptes.

## 1. Créer le Sheet et y coller le script (avec laetitia.deborde@, 5 min)

1. Dans Google Drive, créer un Google Sheet vide nommé **« Veille financements Lit uP »**.
2. Le partager **en modification** avec developpement@lit-up.fr (et clementine.claudon@lit-up.fr si besoin).
3. Dans le Sheet : **Extensions → Apps Script**. Renommer le projet « Veille financements ».
4. Remplacer tout le contenu du fichier `Code.gs` par **tout** le fichier `apps-script/veille.gs` du repo, puis enregistrer (💾).

**À partir d'ici, se connecter avec developpement@** : ouvrir le Sheet partagé, puis Extensions → Apps Script.

## 2. Enregistrer les deux clés (avec developpement@, 10 min)

Les clés se rangent dans les **Propriétés du script** : ⚙️ Paramètres du projet, puis en bas **Propriétés du script → Ajouter une propriété**. Elles ne vont jamais dans le code, ni dans une conversation.

| Propriété | Où la trouver |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key. Créer une clé dédiée nommée « veille » : ses dépenses apparaîtront à part de celles de l'OCR des justificatifs. |
| `AIDES_TERRITOIRES_API_KEY` | Sur [aides-territoires.beta.gouv.fr](https://aides-territoires.beta.gouv.fr), se connecter à son compte, puis **Mon compte → Mes paramètres → Ma clé API** (si la clé n'apparaît pas, la demander depuis cette page ou via le formulaire de contact du site). Copier la clé telle quelle. |

Pour Aides-territoires, il n'y a rien à faire sur la page de documentation de l'API (`/api`, rubrique « Connexion ») : c'est le script qui échange la clé contre un jeton de connexion à chaque collecte.

## 3. Installer (avec developpement@, 5 min)

1. Dans l'éditeur Apps Script, choisir la fonction **`veilleInstaller`** dans la liste en haut, puis **Exécuter**.
2. Autoriser les accès demandés (Sheets, Gmail, envoi de mails, requêtes vers des sites externes, déclencheurs). Google peut afficher « application non validée » : Paramètres avancés, puis Accéder à Veille financements.
3. Vérifier le journal d'exécution : « Veille installée pour **developpement@lit-up.fr** … Clés présentes. » Si un autre compte apparaît ou si un avertissement ⚠️ s'affiche, c'est que l'installation a été faite avec le mauvais compte : se reconnecter avec developpement@ et relancer `veilleInstaller`. Les onglets `Veille_Pistes`, `Veille_Sources`, `Veille_Profils`, `Veille_Vus` apparaissent dans le Sheet.

## 4. Publier l'application web (avec developpement@, 5 min)

1. **Déployer → Nouveau déploiement → ⚙️ Application Web.**
2. Exécuter en tant que : **Moi (developpement@lit-up.fr)**. Qui a accès : **Tout le monde** (comme le backend de la compta : la page n'a pas de connexion Google).
3. Déployer, puis copier l'**URL de l'application Web** (elle finit par `/exec`).
4. Me transmettre cette URL (elle n'est pas secrète) : je la renseigne dans `litup_veille_financements.html` (constante `BACKEND_URL`).

Après chaque modification du script : Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer (l'URL ne change pas).

## 5. Premier essai

1. Ouvrir la page Veille financements, puis ⚙ **Sources → Lancer la collecte maintenant** (une passe de 5 minutes).
2. Vérifier la colonne d'erreurs de chaque source. Une erreur Aides-territoires indique une clé mal copiée.
3. Facultatif : exécuter **`veilleChargerStockFonds`** dans l'éditeur pour passer en revue, une seule fois, les ≈ 775 fonds de dotation déjà créés en PACA et Île-de-France (il se relance tout seul par lots de 40).

## Fonctionnement ensuite

- **Collecte** : chaque **dimanche à 21 h**, en passes de 5 minutes enchaînées automatiquement (10 au plus) jusqu'à ce que tout soit lu.
- **Récapitulatif** : le **lundi à 7 h**, envoyé depuis developpement@ à Laetitia et Clémentine (nouvelles pistes notées 60 ou plus, abonnements à confirmer).
- **Alertes de date limite** : chaque matin à 8 h. Aucun site n'est visité, le script relit seulement le Sheet ; un mail ne part que si une piste « À étudier » ou « GO » passe à 6 ou 2 semaines de sa date limite.
- **Boîte developpement@** : chaque mail de la boîte de réception est lu par l'IA, qui en extrait les appels à projets, puis archivé sous le libellé « Veille/lu ». Les mails de confirmation d'abonnement ne sont pas lus : ils sont listés dans le récap du lundi, avec leur lien, pour qu'une personne clique.
